import { describe, expect, it, vi } from 'vitest';
import { createInitialPetState, FOODS } from '../src/pet/constants.js';
import { deriveEmotion, petReducer } from '../src/pet/reducer.js';
import { PetRuntime } from '../src/pet/runtime.js';
import { EventBus } from '../src/events/bus.js';
import { InMemoryPetStateStore } from '../src/state/store.js';

describe('petReducer', () => {
  it('初始状态形状正确', () => {
    const s = createInitialPetState('小皮', 1000);
    expect(s.meta.name).toBe('小皮');
    expect(s.meta.schemaVersion).toBe(1);
    expect(s.stats).toEqual({ satiety: 80, energy: 80, happiness: 70, exp: 0, level: 1 });
    expect(s.mood.emotion).toBe('content');
  });

  it('喂食增加饱食/心情/经验，属性 100 封顶，经验够则升级', () => {
    let s = createInitialPetState('x', 0);
    const fish = FOODS[0]!;
    for (let i = 0; i < 10; i++) s = petReducer(s, { type: 'feed', item: fish, at: i });
    expect(s.stats.satiety).toBe(100); // 80 + 300 被 clamp
    expect(s.stats.happiness).toBe(100); // 70 + 50 被 clamp
    // 第 10 条鱼触发升级：100 经验 → level 2、经验回滚为 0
    expect(s.stats.level).toBe(2);
    expect(s.stats.exp).toBe(0);
  });

  it('升级：经验达到需求后 level+1、经验回滚、心情加成', () => {
    let s = createInitialPetState('x', 0);
    s = { ...s, stats: { ...s.stats, exp: 96 } };
    s = petReducer(s, { type: 'feed', item: { id: 'f', name: 'x', satiety: 0, happiness: 0, exp: 10 }, at: 0 });
    expect(s.stats.level).toBe(2); // 96+10=106 >= 100 -> level 2, exp 6
    expect(s.stats.exp).toBe(6);
    expect(s.stats.happiness).toBe(80); // 70 + 升级加成 10
  });

  it('tick 随时间衰减且可多次叠加', () => {
    let s = createInitialPetState('x', 0);
    s = petReducer(s, { type: 'tick', dtMs: 60_000, at: 0 });
    expect(s.stats.satiety).toBeLessThan(80);
    expect(s.stats.energy).toBeLessThan(80);
    const s2 = petReducer(s, { type: 'tick', dtMs: 60_000, at: 0 });
    expect(s2.stats.satiety).toBeLessThan(s.stats.satiety);
    expect(s2.stats.satiety).toBeGreaterThanOrEqual(0);
  });

  it('情绪由属性推导', () => {
    const base = { level: 1, exp: 0 };
    expect(deriveEmotion({ satiety: 10, energy: 80, happiness: 70, ...base })).toBe('hungry');
    expect(deriveEmotion({ satiety: 80, energy: 10, happiness: 70, ...base })).toBe('sleepy');
    expect(deriveEmotion({ satiety: 80, energy: 80, happiness: 20, ...base })).toBe('sad');
    expect(deriveEmotion({ satiety: 80, energy: 80, happiness: 90, ...base })).toBe('excited');
    expect(deriveEmotion({ satiety: 85, energy: 85, happiness: 75, ...base })).toBe('happy');
    expect(deriveEmotion({ satiety: 50, energy: 50, happiness: 50, ...base })).toBe('content');
  });

  it('tick 使情绪变化时更新 since', () => {
    let s = createInitialPetState('x', 0);
    // 每小时 1 次 tick × 90 小时：饱食 80 → 0（< 20 触发 hungry）
    for (let i = 0; i < 90; i++) s = petReducer(s, { type: 'tick', dtMs: 3_600_000, at: 0 });
    expect(s.mood.emotion).toBe('hungry');
    expect(s.mood.since).toBe(0);
  });

  it('rename/unlock/setGameProgress/setFlag 幂等与写入', () => {
    let s = createInitialPetState('x', 0);
    s = petReducer(s, { type: 'rename', name: '阿宝', at: 0 });
    expect(s.meta.name).toBe('阿宝');
    const same = petReducer(s, { type: 'rename', name: '阿宝', at: 0 });
    expect(same).toBe(s); // 幂等：同引用

    s = petReducer(s, { type: 'unlock', id: 'skin:cat', at: 0 });
    expect(s.unlocks).toContain('skin:cat');
    const again = petReducer(s, { type: 'unlock', id: 'skin:cat', at: 0 });
    expect(again.unlocks.length).toBe(1);

    s = petReducer(s, {
      type: 'setGameProgress',
      game: 'memory-match',
      progress: { score: 120, completed: 1, best: 120, updatedAt: 1 },
      at: 0,
    });
    expect(s.gameProgress['memory-match']?.best).toBe(120);

    s = petReducer(s, { type: 'setFlag', key: 'pot', value: { coins: 7 }, at: 0 });
    expect(s.flags['pot']).toEqual({ coins: 7 });
  });
});

describe('PetRuntime', () => {
  it('喂食广播 pet:fed / mood-change / stat-changed', () => {
    const bus = new EventBus();
    const store = new InMemoryPetStateStore(createInitialPetState('x', 0));
    const rt = new PetRuntime(store, bus);
    const fed = vi.fn();
    const stat = vi.fn();
    bus.on('pet:fed', fed);
    bus.on('pet:stat-changed', stat);

    rt.dispatch({ type: 'feed', item: { id: 'apple', name: '苹果', satiety: 15, happiness: 3, exp: 6 }, at: 0 });
    expect(fed).toHaveBeenCalledTimes(1);
    expect(stat).toHaveBeenCalledTimes(1);
    expect(rt.state.stats.satiety).toBe(95);
  });

  it('升级时广播 pet:level-up（from/to）', () => {
    const bus = new EventBus();
    const store = new InMemoryPetStateStore(createInitialPetState('x', 0));
    const rt = new PetRuntime(store, bus);
    const lvl = vi.fn();
    bus.on('pet:level-up', lvl);

    store.set({ ...store.get(), stats: { ...store.get().stats, exp: 96 } });
    rt.dispatch({ type: 'feed', item: { id: 'apple', name: '苹果', satiety: 15, happiness: 3, exp: 6 }, at: 0 });
    expect(lvl).toHaveBeenCalledWith({ from: 1, to: 2, state: expect.anything() });
  });

  it('EventBus off 取消订阅；监听器抛错不阻断其它监听器，且可经 onListenerError 上报', () => {
    const errs: unknown[] = [];
    const bus = new EventBus({ onListenerError: (event, err) => errs.push({ event, err: String(err) }) });
    const a = vi.fn();
    const b = vi.fn(() => {
      throw new Error('boom');
    });
    const c = vi.fn();
    const offA = bus.on('pet:fed', a);
    bus.on('pet:fed', b);
    bus.on('pet:fed', c);
    bus.emit('pet:fed', { item: FOODS[0]!, state: createInitialPetState('x') });
    expect(a).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1); // b 抛错不阻断 c
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ event: 'pet:fed', err: 'Error: boom' });
    offA();
    bus.emit('pet:fed', { item: FOODS[0]!, state: createInitialPetState('x') });
    expect(a).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(2);
  });
});