import { describe, expect, it, vi } from 'vitest';
import { EventBus, PluginRegistry, createInitialPetState, InMemoryPetStateStore } from '@smartpet/core';
import plugin, { ACHIEVEMENTS, ACHIEVEMENT_THRESHOLDS } from '../src/index.js';
import type { PluginHostApi } from '@smartpet/core';

const memoryKv = (): ((id: string) => unknown) => {
  const maps = new Map<string, Map<string, unknown>>();
  return (id: string) => {
    let m = maps.get(id);
    if (!m) {
      m = new Map();
      maps.set(id, m);
    }
    return {
      get: async <T>(k: string): Promise<T | undefined> => m!.get(k) as T | undefined,
      set: async (k: string, v: unknown) => void m!.set(k, v),
      delete: async (k: string) => void m!.delete(k),
      list: async () => [...m!.keys()],
    };
  };
};

describe('成就系统插件（hooks capability）—— 单元', () => {
  it('manifest 声明 hooks 能力与钩子名；4 个成就', () => {
    expect(plugin.manifest.capabilities[0]).toEqual({
      kind: 'hooks',
      hookNames: ['onFed', 'onPlayed', 'onGameScore'],
    });
    expect(ACHIEVEMENTS).toHaveLength(4);
  });

  it('计数与阈值规则', () => {
    expect(ACHIEVEMENT_THRESHOLDS['achievement:feeder-5']!.when(5)).toBe(true);
    expect(ACHIEVEMENT_THRESHOLDS['achievement:feeder-5']!.when(4)).toBe(false);
    expect(ACHIEVEMENT_THRESHOLDS['achievement:playful-10']!.when(10)).toBe(true);
    expect(ACHIEVEMENT_THRESHOLDS['achievement:player-1']!.when(1)).toBe(true);
  });

  it('setup 注册 hooks 能力进 sink', async () => {
    const bus = new EventBus();
    const store = new InMemoryPetStateStore(createInitialPetState('x', 0));
    const onCapability = vi.fn();
    const reg = new PluginRegistry({
      bus,
      state: store,
      storage: memoryKv(),
      sink: { onCapability, onCapabilityRemoved: vi.fn() },
      loaders: {},
    });
    await reg.register(plugin.manifest, async () => plugin);
    await reg.enable(plugin.manifest.id);
    expect(onCapability).toHaveBeenCalledWith(
      plugin.manifest.id,
      expect.objectContaining({ kind: 'hooks' }),
      expect.objectContaining({ hooks: expect.any(Object) }),
    );
  });

  it('可直接注册进 PluginHostApi', () => {
    const bus = new EventBus();
    const store = new InMemoryPetStateStore(createInitialPetState('x', 0));
    let registered = 0;
    const host: PluginHostApi = {
      manifest: plugin.manifest,
      bus,
      state: store,
      storage: memoryKv()('x'),
      grantedPermissions: new Set(),
      registerCapability: () => {
        registered += 1;
      },
      unregisterCapability: () => undefined,
    };
    plugin.setup(host);
    expect(registered).toBe(1);
  });
});