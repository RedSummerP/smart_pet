import { describe, expect, it, vi } from 'vitest';
import { EventBus, PluginRegistry, createInitialPetState, InMemoryPetStateStore } from '@smartpet/core';
import { ToolRegistry } from '@smartpet/ai';
import plugin, { COIN_FLIP_TOOL, DICE_TOOL, FORTUNE_TOOL, FUN_TOOLS } from '../src/index.js';
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

describe('娱乐工具包插件（tools capability）', () => {
  it('manifest 声明了三个工具', () => {
    expect(plugin.manifest.capabilities).toEqual([
      { kind: 'tools', toolNames: ['coin_flip', 'dice', 'fortune'] },
    ]);
  });

  it('setup 注册 tools 能力，宿主可收集为工具集', async () => {
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

    const spec = plugin.manifest.capabilities[0]!;
    const calls = onCapability.mock.calls.filter(([id, s]) => id === plugin.manifest.id && (s as { kind?: string }).kind === 'tools');
    expect(calls.length).toBe(1);
    const impl = calls[0]![2] as { tools: unknown[] };
    const names = (impl.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['coin_flip', 'dice', 'fortune']));
    void spec;
  });

  it('工具 handler 行为（随机值均在合法区间）', () => {
    for (let i = 0; i < 50; i++) {
      const coin = COIN_FLIP_TOOL.handler({}, {});
      expect(coin.text).toMatch(/正|反/);
      const dice = DICE_TOOL.handler({}, {});
      const value = (dice.details as { value: number }).value;
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      const fortune = FORTUNE_TOOL.handler({}, {});
      expect(fortune.text).toContain('🔮');
    }
  });

  it('FUN_TOOLS 可直接转换为 pi AgentTool（经 ToolRegistry）', () => {
    const reg = new ToolRegistry();
    for (const tool of FUN_TOOLS) reg.register(tool);
    const agentTools = reg.toAgentTools();
    expect(agentTools.map((t) => t.name)).toEqual(['coin_flip', 'dice', 'fortune']);
    void COIN_FLIP_TOOL;
  });

  it('插件可在真实 PluginHostApi 注册', () => {
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