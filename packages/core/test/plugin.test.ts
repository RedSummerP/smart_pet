import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/events/bus.js';
import type { PluginManifest } from '../src/plugin/manifest.js';
import type { PluginRegistryOptions } from '../src/plugin/registry.js';
import { PluginRegistry } from '../src/plugin/registry.js';
import type { CapabilitySink, PluginDefinition, PluginHostApi, PluginKV } from '../src/plugin/types.js';
import { createInitialPetState } from '../src/pet/constants.js';
import { InMemoryPetStateStore } from '../src/state/store.js';

function memoryKvFactory(): (id: string) => PluginKV {
  const maps = new Map<string, Map<string, unknown>>();
  return (id: string): PluginKV => {
    let m = maps.get(id);
    if (!m) {
      m = new Map();
      maps.set(id, m);
    }
    return {
      async get<T>(key: string): Promise<T | undefined> {
        return m!.get(key) as T | undefined;
      },
      async set(key: string, value: unknown): Promise<void> {
        m!.set(key, value);
      },
      async delete(key: string): Promise<void> {
        m!.delete(key);
      },
      async list(): Promise<string[]> {
        return [...m!.keys()];
      },
    };
  };
}

const GAMES_PLUGIN_MANIFEST: PluginManifest = {
  id: 'plugin-memory',
  name: '记忆翻牌',
  version: '0.1.0',
  requires: { pipet: '>=0.1.0' },
  capabilities: [{ kind: 'games' }],
};

function makeRegistry(extra?: Partial<PluginRegistryOptions>) {
  const bus = new EventBus();
  const store = new InMemoryPetStateStore(createInitialPetState('x', 0));
  const sink: CapabilitySink = { onCapability: vi.fn(), onCapabilityRemoved: vi.fn() };
  const reg = new PluginRegistry({
    bus,
    state: store,
    storage: memoryKvFactory(),
    sink,
    loaders: {},
    ...extra,
  });
  return { bus, store, sink, reg };
}

function defGamePlugin(id = 'plugin-memory'): PluginDefinition {
  const setup = vi.fn((ctx: PluginHostApi) => {
    ctx.registerCapability({ kind: 'games' }, { games: [] });
    return { start: vi.fn(), stop: vi.fn() };
  });
  return { manifest: { ...GAMES_PLUGIN_MANIFEST, id }, setup };
}

describe('PluginRegistry', () => {
  it('register → enable：setup 拿到宿主句柄、能力进 sink', async () => {
    const { sink, reg } = makeRegistry();
    const def = defGamePlugin();
    await reg.register(def.manifest, async () => def);
    const record = reg.get('plugin-memory')!;
    expect(record.status).toBe('pending');

    await reg.enable('plugin-memory');
    expect(record.status).toBe('enabled');
    expect(def.setup).toHaveBeenCalledTimes(1);
    expect(sink.onCapability).toHaveBeenCalledWith(
      'plugin-memory',
      expect.objectContaining({ kind: 'games' }),
      expect.anything(),
    );
    expect(record.capabilities).toHaveLength(1);
  });

  it('start/stop 生命周期钩子', async () => {
    const { reg } = makeRegistry();
    const start = vi.fn();
    const stop = vi.fn();
    const def: PluginDefinition = {
      manifest: GAMES_PLUGIN_MANIFEST,
      setup: () => ({ start, stop }),
    };
    await reg.register(def.manifest, async () => def);
    await reg.start('plugin-memory');
    expect(start).toHaveBeenCalledTimes(1);
    expect(reg.get('plugin-memory')!.status).toBe('started');
    await reg.stop('plugin-memory');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(reg.get('plugin-memory')!.status).toBe('enabled');
  });

  it('依赖拓扑：先启用依赖插件', async () => {
    const { reg } = makeRegistry();
    const dep: PluginDefinition = {
      manifest: { id: 'dep-a', name: '依赖A', version: '0.1.0' },
      setup: () => ({ start: vi.fn() }),
    };
    const main: PluginDefinition = {
      manifest: {
        id: 'main-b',
        name: '主B',
        version: '0.1.0',
        requires: { pipet: '>=0.1.0', plugins: { 'dep-a': '>=0.1.0' } },
      },
      setup: () => ({}),
    };
    await reg.register(dep.manifest, async () => dep);
    await reg.register(main.manifest, async () => main);
    await reg.enable('main-b');
    expect(reg.get('dep-a')!.status).toBe('enabled');
    expect(reg.get('main-b')!.status).toBe('enabled');
  });

  it('缺失依赖 → 报错且进入 error 状态', async () => {
    const { reg } = makeRegistry();
    const main: PluginDefinition = {
      manifest: {
        id: 'main-b',
        name: '主B',
        version: '0.1.0',
        requires: { pipet: '>=0.1.0', plugins: { ghost: '>=0.1.0' } },
      },
      setup: () => ({}),
    };
    await reg.register(main.manifest, async () => main);
    await expect(reg.enable('main-b')).rejects.toThrow(/缺少依赖/);
    expect(reg.get('main-b')!.status).toBe('error');
    expect(reg.get('main-b')!.error).toContain('ghost');
  });

  it('跨层级依赖环检测（a→b→a 与自环）', async () => {
    const { reg } = makeRegistry();
    const a: PluginDefinition = {
      manifest: {
        id: 'a',
        name: 'A',
        version: '0.1.0',
        requires: { pipet: '>=0.1.0', plugins: { b: '>=0.1.0' } },
      },
      setup: () => ({}),
    };
    const b: PluginDefinition = {
      manifest: {
        id: 'b',
        name: 'B',
        version: '0.1.0',
        requires: { pipet: '>=0.1.0', plugins: { a: '>=0.1.0' } },
      },
      setup: () => ({}),
    };
    await reg.register(a.manifest, async () => a);
    await reg.register(b.manifest, async () => b);
    await expect(reg.enable('a')).rejects.toThrow(/依赖环/);
  });

  it('setup 抛错 → error 状态，且不影响其它插件', async () => {
    const { sink, reg } = makeRegistry();
    const bad: PluginDefinition = {
      manifest: { id: 'bad', name: '坏插件', version: '0.1.0' },
      setup: () => {
        throw new Error('setup exploded');
      },
    };
    await reg.register(bad.manifest, async () => bad);
    await expect(reg.enable('bad')).rejects.toThrow('setup exploded');
    expect(reg.get('bad')!.status).toBe('error');
    expect(sink.onCapability).not.toHaveBeenCalled();

    const good = defGamePlugin('good');
    await reg.register(good.manifest, async () => good);
    await reg.enable('good');
    expect(reg.get('good')!.status).toBe('enabled');
  });

  it('disable 注销能力（onCapabilityRemoved）并回到 disabled', async () => {
    const { sink, reg } = makeRegistry();
    const def = defGamePlugin();
    await reg.register(def.manifest, async () => def);
    await reg.enable('plugin-memory');
    await reg.disable('plugin-memory');
    expect(sink.onCapabilityRemoved).toHaveBeenCalledWith(
      'plugin-memory',
      expect.objectContaining({ kind: 'games' }),
    );
    expect(reg.get('plugin-memory')!.status).toBe('disabled');
    expect(reg.get('plugin-memory')!.capabilities).toHaveLength(0);
  });

  it('插件私有存储可读可写（宿主句柄 storage）', async () => {
    const { reg } = makeRegistry();
    const seen: unknown[] = [];
    const plugin: PluginDefinition = {
      manifest: { id: 'kv-p', name: 'kv', version: '0.1.0' },
      setup: async (ctx) => {
        await ctx.storage.set('k', { a: 1 });
        seen.push(await ctx.storage.get('k'));
      },
    };
    await reg.register(plugin.manifest, async () => plugin);
    await reg.enable('kv-p');
    expect(seen).toEqual([{ a: 1 }]);
  });

  it('版本兼容：requires.pipet 不满足时拒绝注册', async () => {
    const { reg } = makeRegistry();
    const futuristic: PluginManifest = {
      id: 'future',
      name: '未来插件',
      version: '0.1.0',
      requires: { pipet: '>=9.9.9' },
    };
    await expect(
      reg.register(futuristic, async () => ({ manifest: futuristic, setup: () => ({}) })),
    ).rejects.toThrow(/需要 pipet >=9.9.9/);
  });

  it('重复注册同一 id 抛错', async () => {
    const { reg } = makeRegistry();
    const def = defGamePlugin();
    await reg.register(def.manifest, async () => def);
    await expect(reg.register(def.manifest, async () => def)).rejects.toThrow(/已注册/);
  });
});