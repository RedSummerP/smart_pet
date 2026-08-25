import { describe, expect, it, vi } from 'vitest';
import { createInitialPetState, FOODS, EventBus } from '@smartpet/core';
import { SyncPetStateStore } from '../src/store.js';
import { MemorySyncAdapter, base64ToBytes, bytesToBase64 } from '../src/adapter.js';
import { SyncEngine } from '../src/sync.js';
import type { PetState } from '@smartpet/core';

/** 固定宠物 id（同一宠物多端） */
function makeState(name = '小皮'): PetState {
  const base = createInitialPetState(name, 0);
  return { ...base, meta: { ...base.meta, id: 'pet-sync-1' } };
}

/** 由同一 genesis 建立两台设备（模拟：B 新装后先拉取采纳 A 的初始文档） */
function twoDevices() {
  const genesis = new SyncPetStateStore(makeState()).save();
  const a = new SyncPetStateStore();
  a.mergeIncoming(genesis);
  const b = new SyncPetStateStore();
  b.mergeIncoming(genesis);
  expect(a.get().stats.satiety).toBe(80);
  expect(b.get().stats.satiety).toBe(80);
  return { a, b };
}

describe('SyncPetStateStore（Automerge 底层）', () => {
  it('reduce 生命周期：喂食/衰减/读取一致', () => {
    const store = new SyncPetStateStore(makeState());
    expect(store.get().stats.satiety).toBe(80);
    store.reduce({ type: 'feed', item: FOODS[1]!, at: 0 });
    expect(store.get().stats.satiety).toBe(100); // 80+20 → reducer clamp 100（域语义）
    expect(store.get().stats.happiness).toBe(85);
    store.reduce({ type: 'tick', dtMs: 60_000, at: 0 });
    expect(store.get().stats.satiety).toBeLessThan(100);
    expect(store.get().stats.satiety).toBeGreaterThanOrEqual(0);
  });

  it('订阅通知触发', () => {
    const store = new SyncPetStateStore(makeState());
    const listener = vi.fn();
    store.subscribe(listener);
    store.reduce({ type: 'unlock', id: 'skin:cat', at: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    store.reduce({ type: 'rename', name: '阿宝', at: 0 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('save/load 二进制往返无损', () => {
    const store = new SyncPetStateStore(makeState());
    store.reduce({ type: 'feed', item: FOODS[0]!, at: 0 });
    store.reduce({ type: 'unlock', id: 'game:memory-match', at: 0 });
    const bytes = store.save();
    const restored = new SyncPetStateStore();
    restored.mergeIncoming(bytes); // 新设备采纳
    expect(restored.get()).toEqual(store.get());
  });

  it('pristine 采纳：新设备收到远端直接以远端为基底', () => {
    const source = new SyncPetStateStore(makeState());
    source.reduce({ type: 'feed', item: FOODS[0]!, at: 0 }); // 80 → 上限 100（计数器 +20），exp +10
    const fresh = new SyncPetStateStore(); // 全新默认宠物
    const changed = fresh.mergeIncoming(source.save());
    expect(changed).toBe(true);
    expect(fresh.get().meta.id).toBe('pet-sync-1'); // 整体采纳（包括 meta/全部进展）
    expect(fresh.get().stats.satiety).toBe(100);
    expect(fresh.get().stats.exp).toBe(10);
  });

  it('两设备各自喂食 → 差分合并：饱食收敛到上限，经验无上限无损相加', () => {
    const { a, b } = twoDevices();
    a.reduce({ type: 'feed', item: FOODS[0]!, at: 0 }); // 饱食 +30→封顶，exp +10
    b.reduce({ type: 'feed', item: FOODS[1]!, at: 0 }); // 饱食 +20→封顶，exp +12
    b.mergeIncoming(a.save());
    a.mergeIncoming(b.save());
    // 饱食封顶 100（游戏语义）；经验无上限 → 双方 10+12=22（无丢失）
    expect(a.get().stats.satiety).toBe(100);
    expect(b.get().stats.satiety).toBe(100);
    expect(a.get().stats.exp).toBe(22);
    expect(b.get().stats.exp).toBe(22);
  });

  it('并发解锁合并：两边解锁都保留', () => {
    const { a, b } = twoDevices();
    a.reduce({ type: 'unlock', id: 'skin:cat', at: 0 });
    b.reduce({ type: 'unlock', id: 'skin:dog', at: 0 });
    b.mergeIncoming(a.save());
    a.mergeIncoming(b.save());
    expect(a.get().unlocks).toEqual(expect.arrayContaining(['skin:cat', 'skin:dog']));
    expect(b.get().unlocks).toEqual(expect.arrayContaining(['skin:cat', 'skin:dog']));
  });
});

describe('SyncEngine（本地优先，差分同步）', () => {
  it('A 变更 → B 拉取 → 两端收敛一致', async () => {
    const shared = new MemorySyncAdapter();
    const { a: storeA, b: storeB } = twoDevices();
    const bus = new EventBus();
    const changed = vi.fn();
    bus.on('sync:changed', changed);

    const engineA = new SyncEngine(storeA, [shared], { bus });
    const engineB = new SyncEngine(storeB, [shared], { bus, debounceMs: 5 });
    engineA.start();
    engineB.start();

    storeA.reduce({ type: 'feed', item: FOODS[0]!, at: 0 }); // 饱食 80→封顶 100，exp +10
    await engineA.pushAll();
    await engineB.pullAll();
    expect(storeB.get().stats.satiety).toBe(100);
    expect(storeB.get().stats.exp).toBe(10);

    storeB.reduce({ type: 'feed', item: FOODS[1]!, at: 0 }); // 饱食已封顶，exp +12
    await engineB.pushAll();
    await engineA.pullAll();
    expect(storeA.get().stats.satiety).toBe(100);
    expect(storeB.get().stats.satiety).toBe(100);
    expect(storeA.get().stats.exp).toBe(22); // 经验无上限合并：10+12 双向一致
    expect(storeB.get().stats.exp).toBe(22);
    expect(changed).toHaveBeenCalled(); // sync:changed 广播

    engineA.stop();
    engineB.stop();
  });

  it('远端变更经 watch 自动拉取合并', async () => {
    const shared = new MemorySyncAdapter();
    const { a: storeA, b: storeB } = twoDevices();
    const engineA = new SyncEngine(storeA, [shared]);
    const engineB = new SyncEngine(storeB, [shared]);
    engineA.start();
    engineB.start();

    storeA.reduce({ type: 'rename', name: '皮皮', at: 0 });
    await engineA.pushAll();
    shared.notify(); // 模拟远端推送 → B 的 watch 触发拉取

    await vi.waitFor(() => {
      expect(storeB.get().meta.name).toBe('皮皮');
    });

    engineA.stop();
    engineB.stop();
  });

  it('MemorySyncAdapter 差分合并：push 与存量合并保留双方', async () => {
    const genesis = new SyncPetStateStore(makeState()).save();
    const storeA = new SyncPetStateStore();
    storeA.mergeIncoming(genesis);
    const storeB = new SyncPetStateStore();
    storeB.mergeIncoming(genesis);

    const adapter = new MemorySyncAdapter();
    storeA.reduce({ type: 'unlock', id: 'x', at: 0 });
    storeB.reduce({ type: 'unlock', id: 'y', at: 0 });
    await adapter.push(storeA.save(), 'rev-a');
    await adapter.push(storeB.save(), 'rev-b');
    const remote = await adapter.pull();
    const merged = new SyncPetStateStore();
    merged.mergeIncoming(remote!.binary);
    expect(merged.get().unlocks).toEqual(expect.arrayContaining(['x', 'y']));
  });

  it('base64 往返正确', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});