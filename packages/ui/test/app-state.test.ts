import { describe, expect, it, vi } from 'vitest';
import { AppState } from '../src/app/app-state.js';
import { createMockBridge } from '../src/bridge/mock.js';
import type { PlatformBridge } from '../src/bridge/types.js';
import type { SyncBackend } from '@smartpet/sync';

describe('AppState 装配层', () => {
  it('init：读取默认 settings、注册演示插件、agent 就绪', async () => {
    const app = new AppState(createMockBridge());
    expect(app.ready).toBe(false);
    await app.init();
    expect(app.ready).toBe(true);
    expect(app.bridgeKind).toBe('mock');
    expect(app.settingsText).toContain('llm-pi-ai');
    expect(app.games.map((g) => g.title)).toEqual(
      expect.arrayContaining(['猜数字', '记忆翻牌', '2048']),
    );
    expect(app.agent).toBeTruthy();
    expect(app.modelLabel).toBeTruthy();
  });

  it('喂食/玩耍/改名：真实改变宠物状态并广播', async () => {
    const app = new AppState(createMockBridge());
    await app.init();
    const before = app.pet.stats.satiety;
    const v0 = app.version;
    app.feed();
    expect(app.pet.stats.satiety).toBeGreaterThan(before);
    expect(app.version).toBeGreaterThan(v0);

    app.rename('阿宝');
    expect(app.pet.meta.name).toBe('阿宝');
    app.play();
    expect(app.pet.stats.happiness).toBeGreaterThan(70);
  });

  it('send：脚本化 agent + 工具调用闭环（说“喂我” → pet_actions 真实喂食）', async () => {
    const app = new AppState(createMockBridge());
    await app.init();
    const before = app.pet.stats.satiety;
    await app.send('我饿了，喂我点吃的吧');

    const toolEntries = app.messages.filter((m) => m.role === 'tool');
    expect(toolEntries.some((m) => m.text.includes('pet_actions'))).toBe(true);
    expect(app.pet.stats.satiety).toBeGreaterThan(before); // AI 工具真实驱动状态
    const assistant = [...app.messages].reverse().find((m) => m.role === 'assistant');
    expect(assistant?.text).toContain('小鱼干');
  });

  it('send：计算器工具调用', async () => {
    const app = new AppState(createMockBridge());
    await app.init();
    await app.send('帮我算一算 7*8 是多少');
    const toolEntries = app.messages.filter((m) => m.role === 'tool');
    expect(toolEntries.some((m) => m.text.includes('calc'))).toBe(true);
    const assistant = [...app.messages].reverse().find((m) => m.role === 'assistant');
    expect(assistant?.text).toContain('56');
  });

  it('订阅/退订通知', async () => {
    const app = new AppState(createMockBridge());
    await app.init();
    let calls = 0;
    const off = app.subscribe(() => calls++);
    const snapshot = app.version;
    void snapshot;
    app.play();
    expect(calls).toBeGreaterThan(0);
    off();
    const after = calls;
    app.feed();
    expect(calls).toBe(after);
  });

  it('皮肤：插件注册 4 套皮肤；换肤写入状态（可跨端同步）并可取调色板', async () => {
    const app = new AppState(createMockBridge());
    await app.init();
    expect(app.skins.map((s) => s.id)).toEqual(
      expect.arrayContaining(['classic', 'mocha', 'shadow', 'mint']),
    );
    expect(app.skinId).toBe('classic');
    app.applySkin('mocha');
    expect(app.pet.flags['skin']).toBe('mocha');
    expect(app.skinId).toBe('mocha');
    expect(app.getSkinPalette('mocha').fur).toEqual([222, 184, 152]);
  });

  it('托盘动作：feed → 真实喂食；games → 导航请求', async () => {
    let trayHandler: ((action: string) => void) | undefined;
    const bridge: PlatformBridge = {
      ...createMockBridge(),
      onTrayAction: (handler) => {
        trayHandler = handler;
      },
    };
    const app = new AppState(bridge);
    await app.init();
    const before = app.pet.stats.satiety;
    expect(trayHandler).toBeDefined();
    trayHandler!('feed');
    expect(app.pet.stats.satiety).toBeGreaterThan(before);
    trayHandler!('games');
    expect(app.tabRequest).toBe('games');
    app.consumeTab();
    expect(app.tabRequest).toBeNull();
  });

  it('本地持久化：flushPet 落盘 → 新 AppState 恢复同一宠物', async () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    };
    const appA = new AppState(createMockBridge({ storage: storageLike }));
    await appA.init();
    appA.feed();
    appA.rename('阿宝');
    await appA.flushPet();

    const appB = new AppState(createMockBridge({ storage: storageLike }));
    await appB.init();
    expect(appB.pet.meta.name).toBe('阿宝');
    expect(appB.pet.stats.satiety).toBe(appA.pet.stats.satiety);
    expect(appB.pet.stats.exp).toBe(appA.pet.stats.exp);
  });

  it('ticker：每秒驱动属性衰减', async () => {
    vi.useFakeTimers();
    try {
      const app = new AppState(createMockBridge());
      await app.init();
      const before = app.pet.stats.satiety;
      app.startTicker(1000);
      vi.advanceTimersByTime(1000);
      expect(app.pet.stats.satiety).toBeLessThan(before);
      expect(app.pet.stats.satiety).toBeGreaterThanOrEqual(0);
      app.stopTicker();
    } finally {
      vi.useRealTimers();
    }
  });

  it('attachRemoteSync：双端经远端后端收敛（M2 supabase 语义）', async () => {
    let stored: { rev: string; binary: string } | null = null;
    const backend: SyncBackend = {
      async fetchRow() {
        return stored ? { ...stored } : null;
      },
      async upsertRow(row) {
        stored = { rev: row.rev, binary: row.binary };
      },
      subscribe: () => () => undefined,
    };

    const appA = new AppState(createMockBridge());
    await appA.init();
    const appB = new AppState(createMockBridge());
    await appB.init();
    await appA.attachRemoteSync(backend, 'supabase');
    await appB.attachRemoteSync(backend, 'supabase');
    expect(appA.syncLabel).toBe('supabase');
    expect(appB.syncLabel).toBe('supabase');

    appA.feed();
    await appA.syncNow();
    await appB.syncNow();
    expect(appB.pet.stats.exp).toBe(appA.pet.stats.exp);
    expect(appB.pet.stats.exp).toBeGreaterThan(0);
  });

  it('保存 settings 经 bridge 持久化', async () => {
    const app = new AppState(createMockBridge());
    await app.init();
    await app.saveSettings('llm-pi-ai:\n  default:\n    provider: x\n    model: y\n');
    expect(app.settingsText).toContain('provider: x');
  });
});