import * as Automerge from '@automerge/automerge';
import type { PetState } from '@smartpet/core';

/**
 * PetState ↔ Automerge 文档映射。
 * 属性计数（satiety/energy/happiness/exp/level）用 Counter —— 多端并发增量可无损合并；
 * unlocks 用 append-only 数组（并发解锁都保留）；gameProgress/flags 用 map（按 key 合并）。
 *
 * 同步语义（见 docs/sync-protocol.md）：
 * - 宠物由一台设备创建，其文档即 genesis；新设备/新端先拉取采纳既有文档为基底
 * - 之后全部走"变更差分"（getChanges/applyChanges），绝不全量 merge（避免 genesis 重复计数）
 */

export interface PetDoc {
  meta: { id: string; name: string; createdAt: number; schemaVersion: 1 };
  stats: {
    satiety: Automerge.Counter;
    energy: Automerge.Counter;
    happiness: Automerge.Counter;
    exp: Automerge.Counter;
    level: Automerge.Counter;
  };
  /**
   * 小数进位寄存器：Automerge 计数器为整数，衰减/微调的小数部分在此累计，
   * 达到 ±1 时进位/借位到计数器。快照读数 = 计数器 + carried。
   */
  carried: Record<'satiety' | 'energy' | 'happiness' | 'exp' | 'level', number>;
  mood: { emotion: string; since: number };
  unlocks: string[];
  gameProgress: Record<string, { score: number; completed: number; best: number; updatedAt: number; flags?: Record<string, unknown> }>;
  flags: Record<string, unknown>;
}

const counterValue = (counter: Automerge.Counter): number => Number(counter);

/** 深拷贝（数据均为 JSON 安全值；避免依赖 structuredClone/buffer） */
export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 从 PetState 创建 Automerge 文档（仅宠物创建者使用；新端请通过 mergeIncoming 采纳） */
export function createDoc(state: PetState): Automerge.Doc<PetDoc> {
  const doc = Automerge.init<PetDoc>();
  return Automerge.change(doc, (d) => {
    d.meta = { ...state.meta };
    d.stats = {
      satiety: new Automerge.Counter(state.stats.satiety),
      energy: new Automerge.Counter(state.stats.energy),
      happiness: new Automerge.Counter(state.stats.happiness),
      exp: new Automerge.Counter(state.stats.exp),
      level: new Automerge.Counter(state.stats.level),
    };
    d.mood = { ...state.mood };
    d.unlocks = [...state.unlocks];
    d.gameProgress = jsonClone(state.gameProgress) as PetDoc['gameProgress'];
    d.flags = jsonClone(state.flags) as Record<string, unknown>;
    d.carried = { satiety: 0, energy: 0, happiness: 0, exp: 0, level: 0 };
  });
}

/** Counter（可能以对象形态出现）→ 数字 */
const counterToNumber = (v: unknown): number => {
  const maybe = v as { value?: number } | null;
  return maybe && typeof maybe === 'object' ? maybe.value ?? NaN : Number(v);
};

/** 文档 → 普通 PetState 快照（Counter → number） */
export function snapshot(doc: Automerge.Doc<PetDoc>): PetState {
  const d = Automerge.toJS(doc) as unknown as {
    meta: PetState['meta'];
    stats: Record<keyof PetDoc['stats'], unknown>;
    carried: PetDoc['carried'];
    mood: PetState['mood'];
    unlocks: string[];
    gameProgress: PetDoc['gameProgress'];
    flags: PetDoc['flags'];
  };
  const carried = d.carried ?? { satiety: 0, energy: 0, happiness: 0, exp: 0, level: 0 };
  const read = (key: keyof PetDoc['stats']): number => counterToNumber(d.stats[key]) + (carried[key] ?? 0);
  return {
    meta: d.meta,
    stats: {
      // 饱食/精力/心情有 0..100 上限（游戏语义，计数器记录"有效增益"）；exp/level 无上限
      satiety: Math.min(100, read('satiety')),
      energy: Math.min(100, read('energy')),
      happiness: Math.min(100, read('happiness')),
      exp: read('exp'),
      level: read('level'),
    },
    mood: d.mood,
    unlocks: d.unlocks,
    gameProgress: d.gameProgress as PetState['gameProgress'],
    flags: d.flags as PetState['flags'],
  };
}

const jsonEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 把 plain 差量合入文档：计数器走 increment（保留并发增量），小数衰减走 carried 进位寄存器 */
export function applyPlain(doc: Automerge.Doc<PetDoc>, prev: PetState, next: PetState): Automerge.Doc<PetDoc> {
  return Automerge.change(doc, (d) => {
    // meta（只 name 可变）
    if (next.meta.name !== prev.meta.name) d.meta.name = next.meta.name;
    // stats：整数进计数器，小数进 carried（跨 tick 累计）
    (['satiety', 'energy', 'happiness', 'exp', 'level'] as const).forEach((key) => {
      const delta = next.stats[key] - prev.stats[key];
      if (delta === 0) return;
      const current = Number(d.stats[key]) + (d.carried[key] ?? 0);
      const target = current + delta;
      const intPart = Math.trunc(target);
      d.carried[key] = target - intPart;
      const counterDelta = intPart - Number(d.stats[key]);
      if (counterDelta !== 0) d.stats[key].increment(counterDelta);
    });
    // mood
    if (next.mood.emotion !== prev.mood.emotion || next.mood.since !== prev.mood.since) {
      d.mood = { emotion: next.mood.emotion, since: next.mood.since };
    }
    // unlocks：append-only（幂等）
    for (const id of next.unlocks) {
      if (!d.unlocks.includes(id)) d.unlocks.push(id);
    }
    // gameProgress：按 key 更新
    for (const [game, progress] of Object.entries(next.gameProgress)) {
      const old = d.gameProgress[game];
      if (!old || old.score !== progress.score || old.updatedAt !== progress.updatedAt || !jsonEqual(old.flags, progress.flags)) {
        d.gameProgress[game] = jsonClone(progress) as PetDoc['gameProgress'][string];
      }
    }
    for (const game of Object.keys(d.gameProgress)) {
      if (!(game in next.gameProgress)) delete d.gameProgress[game];
    }
    // flags：按 key 差量
    for (const [key, value] of Object.entries(next.flags)) {
      if (!jsonEqual(d.flags[key], value)) d.flags[key] = jsonClone(value);
    }
    for (const key of Object.keys(d.flags)) {
      if (!(key in next.flags)) delete d.flags[key];
    }
  });
}

/** 文档头部标识（用于比对是否变化 / 作为 rev） */
export function docHeads(doc: Automerge.Doc<PetDoc>): string[] {
  // getHeads 的 Heads 类型依赖 automerge-wasm（TS 5.7 泛型 typed-array 类型噪音，cast 后按字节迭代）
  const heads = Automerge.getHeads(doc) as unknown as Uint8Array[];
  return heads.map((h) => {
    let hex = '';
    for (let i = 0; i < h.length; i++) hex += (h[i] as number).toString(16).padStart(2, '0');
    return hex;
  });
}

export { counterValue };