import type { EventBus } from '../events/bus.js';
import { PIPET_VERSION, parseManifest, rangeSatisfies } from './manifest.js';
import type { CapabilitySpec, PluginManifest } from './manifest.js';
import type {
  CapabilitySink,
  PermissionPolicy,
  PluginDefinition,
  PluginHostApi,
  PluginKV,
  PluginLifecycle,
  PluginLoader,
  PluginStatus,
  PetStateReader,
} from './types.js';

export interface PluginRecord {
  manifest: PluginManifest;
  status: PluginStatus;
  error?: string;
  /** 已授权权限 */
  permissions: string[];
  /** 已注册的能力（随 enable/disable 增减） */
  capabilities: CapabilitySpec[];
}

export interface PluginRegistryOptions {
  bus: EventBus;
  state: PetStateReader;
  /** 插件私有存储：工厂（按插件 id）或共享实例 */
  storage: PluginKV | ((pluginId: string) => PluginKV);
  /** 能力接收器（应用层消费注册的能力） */
  sink?: CapabilitySink;
  /** 权限策略；缺省 = manifest.permissions */
  permissions?: PermissionPolicy;
  /** 预注册的加载器：id -> loader（也可用 #registerWithLoader / register 的 loader 参数） */
  loaders?: Record<string, PluginLoader>;
}

/**
 * 插件注册表：resolve → load → authorize → enable(setup) → start/stop → disable → unload
 * - 依赖：requires.plugins 拓扑启用，环检测（跨层级链式）
 * - 失败隔离：任何插件异常只标记 error 状态，不影响其它插件
 * - 同 id 请求串行（in-flight 去重），内层调用走非串行内部方法避免自等待
 */
export class PluginRegistry {
  private readonly manifests = new Map<string, PluginManifest>();
  private readonly loaders = new Map<string, PluginLoader>();
  private readonly records = new Map<string, PluginRecord>();
  private readonly definitions = new Map<string, PluginDefinition>();
  private readonly lifecycles = new Map<string, PluginLifecycle>();
  private readonly hostApis = new Map<string, PluginHostApi>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly kvFactory: (pluginId: string) => PluginKV;

  constructor(private readonly opts: PluginRegistryOptions) {
    if (typeof opts.storage === 'function') {
      this.kvFactory = opts.storage as (pluginId: string) => PluginKV;
    } else {
      const shared = opts.storage;
      this.kvFactory = () => shared;
    }
    for (const [id, loader] of Object.entries(opts.loaders ?? {})) this.loaders.set(id, loader);
  }

  get(id: string): PluginRecord | undefined {
    return this.records.get(id);
  }

  list(): PluginRecord[] {
    return [...this.records.values()];
  }

  /** 注册：校验 manifest + pipet 版本兼容，置为 pending */
  async register(manifestLike: unknown, loader?: PluginLoader): Promise<PluginRecord> {
    const manifest = parseManifest(manifestLike);
    if (this.manifests.has(manifest.id)) throw new Error(`插件已注册: ${manifest.id}`);
    if (!rangeSatisfies(PIPET_VERSION, manifest.requires.pipet)) {
      throw new Error(`插件 ${manifest.id} 需要 pipet ${manifest.requires.pipet}，当前 ${PIPET_VERSION}`);
    }
    if (loader) this.loaders.set(manifest.id, loader);
    const permissions = await (this.opts.permissions?.(manifest) ?? manifest.permissions);
    const record: PluginRecord = { manifest, status: 'pending', permissions: [...permissions], capabilities: [] };
    this.manifests.set(manifest.id, manifest);
    this.records.set(manifest.id, record);
    return record;
  }

  /** 并行注册多个 */
  async registerMany(items: Array<{ manifest: unknown; loader?: PluginLoader }>): Promise<PluginRecord[]> {
    return Promise.all(items.map((i) => this.register(i.manifest, i.loader)));
  }

  /** 加载：import 模块并校验形状（不执行 setup） */
  async load(id: string): Promise<void> {
    await this.serialized(id, () => this.loadInternal(id));
  }

  /** 启用：先依赖（拓扑），再授权 + setup（能力注册进 sink） */
  async enable(id: string): Promise<void> {
    await this.enableInternal(id, []);
  }

  async start(id: string): Promise<void> {
    const record = this.must(id);
    if (record.status === 'started') return;
    if (record.status !== 'enabled') await this.enable(id);
    const lifecycle = this.lifecycles.get(id);
    try {
      await lifecycle?.start?.();
      this.setStatus(record, 'started');
    } catch (err) {
      this.fail(record, err);
      throw err;
    }
  }

  async stop(id: string): Promise<void> {
    const record = this.must(id);
    if (record.status !== 'started') return;
    const lifecycle = this.lifecycles.get(id);
    try {
      await lifecycle?.stop?.();
      this.setStatus(record, 'enabled');
    } catch (err) {
      this.fail(record, err);
      throw err;
    }
  }

  /** 禁用：停 + 注销能力（sink.onCapabilityRemoved） */
  async disable(id: string): Promise<void> {
    const record = this.must(id);
    if (record.status === 'disabled' || record.status === 'error') return;
    await this.stop(id).catch(() => undefined);
    const hostApi = this.hostApis.get(id);
    for (const spec of [...record.capabilities]) hostApi?.unregisterCapability(spec);
    this.hostApis.delete(id);
    this.lifecycles.delete(id);
    this.setStatus(record, 'disabled');
  }

  /** 卸载：禁用 + 丢弃定义与加载器 */
  async unload(id: string): Promise<void> {
    await this.disable(id);
    this.definitions.delete(id);
    this.loaders.delete(id);
  }

  /** 全部启用（逐个隔离错误） */
  async enableAll(): Promise<void> {
    for (const record of [...this.records.values()]) {
      await this.enable(record.manifest.id).catch(() => undefined);
    }
  }

  /** 全部启动 */
  async startAll(): Promise<void> {
    for (const record of [...this.records.values()]) {
      await this.start(record.manifest.id).catch(() => undefined);
    }
  }

  // ---- 内部 ----

  private async loadInternal(id: string): Promise<void> {
    const record = this.must(id);
    if (this.definitions.has(id)) return;
    const loader = this.loaders.get(id);
    if (!loader) throw new Error(`插件 ${id} 未提供加载器`);
    try {
      const definition = await loader(record.manifest);
      this.validateDefinition(id, definition);
      this.definitions.set(id, definition);
      this.setStatus(record, 'loaded');
    } catch (err) {
      this.fail(record, err);
      throw err;
    }
  }

  private async enableInternal(id: string, chain: string[]): Promise<void> {
    await this.serialized(id, async () => {
      const record = this.must(id);
      if (record.status === 'enabled' || record.status === 'started') return;
      try {
        await this.enableDependencies(id, [...chain, id]);
        if (!this.definitions.has(id)) await this.loadInternal(id);
        const definition = this.definitions.get(id);
        if (!definition) throw new Error(`插件 ${id} 无法加载`);
        const hostApi = this.buildHostApi(record);
        const lifecycle = (await definition.setup(hostApi)) ?? {};
        this.hostApis.set(id, hostApi);
        this.lifecycles.set(id, lifecycle);
        this.setStatus(record, 'enabled');
      } catch (err) {
        // 失败隔离：依赖缺失/加载失败/setup 抛错统一标记 error，不影响其它插件
        this.fail(record, err);
        throw err;
      }
    });
  }

  private async enableDependencies(id: string, chain: string[]): Promise<void> {
    const record = this.must(id);
    const deps = record.manifest.requires.plugins ?? {};
    for (const depId of Object.keys(deps)) {
      if (chain.includes(depId)) {
        throw new Error(`插件依赖环: ${[...chain, depId].join(' -> ')}`);
      }
      const depRecord = this.records.get(depId);
      if (!depRecord) throw new Error(`插件 ${id} 缺少依赖 ${depId}`);
      const payload = depRecord.manifest.requires.plugins?.[depId];
      if (payload && !rangeSatisfies(depRecord.manifest.version, payload)) {
        throw new Error(`插件 ${id} 依赖 ${depId}@${payload}，实际 ${depRecord.manifest.version}`);
      }
      await this.enableInternal(depId, chain);
    }
  }

  private buildHostApi(record: PluginRecord): PluginHostApi {
    const registeredKeys = new Set<string>();
    const specKey = (spec: CapabilitySpec): string => `${spec.kind}:${JSON.stringify(spec)}`;
    const api: PluginHostApi = {
      manifest: record.manifest,
      bus: this.opts.bus,
      state: this.opts.state,
      storage: this.kvFactory(record.manifest.id),
      grantedPermissions: new Set(record.permissions),
      registerCapability: (spec, impl) => {
        const key = specKey(spec);
        if (registeredKeys.has(key)) throw new Error(`插件 ${record.manifest.id} 重复注册能力 ${key}`);
        registeredKeys.add(key);
        record.capabilities.push(spec);
        void this.opts.sink?.onCapability(record.manifest.id, spec, impl);
      },
      unregisterCapability: (spec) => {
        const key = specKey(spec);
        if (!registeredKeys.delete(key)) return;
        const idx = record.capabilities.findIndex((c) => specKey(c) === key);
        if (idx >= 0) record.capabilities.splice(idx, 1);
        void this.opts.sink?.onCapabilityRemoved(record.manifest.id, spec);
      },
    };
    return api;
  }

  private validateDefinition(id: string, definition: PluginDefinition): void {
    if (!definition || typeof definition.setup !== 'function') throw new Error(`插件 ${id} 缺少 setup`);
    const manifest = parseManifest(definition.manifest);
    if (manifest.id !== id) throw new Error(`插件 ${id} manifest.id 不一致: ${manifest.id}`);
  }

  private async serialized(id: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.inFlight.get(id);
    if (prev) await prev;
    const promise = fn().finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, promise);
    await promise;
  }

  private must(id: string): PluginRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`未知插件: ${id}`);
    return record;
  }

  private setStatus(record: PluginRecord, status: PluginStatus): void {
    record.status = status;
    if (status !== 'error') delete record.error;
  }

  private fail(record: PluginRecord, err: unknown): void {
    record.status = 'error';
    record.error = err instanceof Error ? err.message : String(err);
  }
}