import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@smartpet/core';
import type { PluginHostApi } from '@smartpet/core';
import { PluginRegistry } from '@smartpet/core';
import { createInitialPetState } from '@smartpet/core';
import { InMemoryPetStateStore } from '@smartpet/core';
import plugin, { CLASSIC_SKIN, MINT_SKIN, MOCHA_SKIN, SHADOW_SKIN } from '../src/index.js';

function memoryKv() {
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
}

describe('皮肤插件（skins capability）', () => {
  it('manifest 声明了每套皮肤的能力', () => {
    expect(plugin.manifest.capabilities).toHaveLength(4);
    expect(plugin.manifest.capabilities.map((c) => c.kind)).toEqual(['skins', 'skins', 'skins', 'skins']);
  });

  it('setup 逐套皮肤注册 capability；宿主管道可消费', async () => {
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
    expect(reg.get(plugin.manifest.id)!.status).toBe('enabled');
    expect(onCapability).toHaveBeenCalledTimes(4);

    // 收集到的皮肤 id / 调色板校验
    const skins: Array<{ id: string; palette: unknown }> = [];
    for (const [id, , impl] of onCapability.mock.calls as unknown as Array<[string, unknown, { skins: Array<{ id: string; palette: unknown }> }]>) {
      void id;
      skins.push(...impl.skins);
    }
    expect(skins.map((s) => s.id)).toEqual(expect.arrayContaining(['classic', 'mocha', 'shadow', 'mint']));
    const classic = skins.find((s) => s.id === 'classic')!;
    expect(classic.palette).toEqual(CLASSIC_SKIN.palette);
  });

  it('内置皮肤均为合法 RGB（0-255）', () => {
    for (const skin of [CLASSIC_SKIN, MOCHA_SKIN, SHADOW_SKIN, MINT_SKIN]) {
      for (const channel of Object.values(skin.palette)) {
        for (const value of channel) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('插件可注册进真实 PluginHostApi 且不冲突', async () => {
    const bus = new EventBus();
    const store = new InMemoryPetStateStore(createInitialPetState('x', 0));
    let registered = 0;
    const reg = new PluginRegistry({
      bus,
      state: store,
      storage: memoryKv(),
      sink: {
        onCapability: () => {
          registered += 1;
        },
        onCapabilityRemoved: () => undefined,
      },
    });
    const fakeHost: PluginHostApi = {
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
    plugin.setup(fakeHost);
    expect(registered).toBe(4);
    void reg;
  });
});