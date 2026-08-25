import type { EventBus } from '../events/bus.js';
import type { PetState } from '../pet/types.js';
import type { CapabilitySpec, PluginManifest } from './manifest.js';

/** 插件私有存储（按插件 id 隔离的 KV，宿主提供实现） */
export interface PluginKV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

/** 插件可读的宠物状态视图（只读 + 订阅） */
export interface PetStateReader {
  get(): PetState;
  subscribe(cb: (state: PetState) => void): () => void;
}

/** 插件运行时拿到的宿主句柄 */
export interface PluginHostApi {
  readonly manifest: PluginManifest;
  readonly bus: EventBus;
  readonly state: PetStateReader;
  readonly storage: PluginKV;
  /** 已授权权限集合（宿主按 manifest.permissions + 用户策略授予） */
  readonly grantedPermissions: ReadonlySet<string>;
  /** 声明能力并交给宿主（sink）消费 */
  registerCapability(spec: CapabilitySpec, impl: unknown): void;
  unregisterCapability(spec: CapabilitySpec): void;
}

/** 插件生命周期钩子 */
export interface PluginLifecycle {
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
}

/** 插件模块导出形状：默认导出 PluginDefinition */
export interface PluginDefinition {
  manifest: PluginManifest;
  setup(ctx: PluginHostApi): PluginLifecycle | void | Promise<PluginLifecycle | void>;
}

/** 插件加载器：宿主提供，负责 import 插件模块并返回其定义 */
export type PluginLoader = (manifest: PluginManifest) => Promise<PluginDefinition>;

/** 能力接收器：宿主把启用插件的能力交给应用层消费（如：游戏交给 UI 挂载、工具交给 ai 注册） */
export interface CapabilitySink {
  onCapability(pluginId: string, spec: CapabilitySpec, impl: unknown): void | Promise<void>;
  onCapabilityRemoved(pluginId: string, spec: CapabilitySpec): void | Promise<void>;
}

/** 权限策略：宿主决定给插件授予哪些权限（默认 = manifest.permissions） */
export type PermissionPolicy = (manifest: PluginManifest) => string[] | Promise<string[]>;

export type PluginStatus = 'pending' | 'loaded' | 'enabled' | 'started' | 'stopped' | 'disabled' | 'error';