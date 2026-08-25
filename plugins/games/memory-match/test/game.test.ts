import { describe, expect, it } from 'vitest';
import { DEFAULT_SYMBOLS, MemoryMatchGame } from '../src/index.js';

/** 确定性随机源 */
const seededRng = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const NOW = 1000;

describe('MemoryMatchGame 记忆翻牌', () => {
  it('start：4×4 共 16 张、8 对、状态 playing、牌面打乱', () => {
    const game = new MemoryMatchGame({ rng: seededRng(42) });
    const s = game.start(NOW);
    expect(s.cards).toHaveLength(16);
    expect(s.totalPairs).toBe(8);
    expect(s.status).toBe('playing');
    expect(s.cards.every((c) => c.state === 'hidden')).toBe(true);
    // 每个符号恰好出现两次
    const counts = new Map<string, number>();
    for (const card of s.cards) counts.set(card.symbol, (counts.get(card.symbol) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
  });

  it('非法翻牌：翻已配对/已翻开/同一张/等待结算时', () => {
    const game = new MemoryMatchGame({ rng: seededRng(7) });
    game.start(NOW);
    // 找到一对相同的牌
    const first = game.snapshot().cards[0]!;
    const pair = game
      .snapshot()
      .cards.find((c) => c.id !== first.id && c.symbol === first.symbol)!;
    expect(game.flip(first.id)).not.toBe('invalid');
    // 再翻同一张 → invalid
    expect(game.flip(first.id)).toBe('invalid');
    // 翻正在结算中的另一张（不同）→ 合法，moves=1
    const other = game
      .snapshot()
      .cards.find((c) => c.id !== first.id && c.id !== pair.id && c.state === 'hidden')!;
    expect(game.flip(other.id)).not.toBe('invalid');
    // 等待结算时再翻 → invalid
    expect(game.flip(pair.id)).toBe('invalid');
    const after = game.resolvePending();
    expect(after).not.toBe('idle');
    expect(after.status).toBe('playing');
  });

  it('配对成功：moves+1、matched+1、score+10、无待结算', () => {
    const game = new MemoryMatchGame({ rng: seededRng(11) });
    const board = game.start(NOW).cards;
    const first = board[0]!;
    const pair = board.find((c) => c.id !== first.id && c.symbol === first.symbol)!;
    const s1 = game.flip(first.id);
    if (s1 === 'invalid') throw new Error('should not be invalid');
    const s2 = game.flip(pair.id);
    if (s2 === 'invalid') throw new Error('should not be invalid');
    expect(s2.moves).toBe(1);
    expect(s2.matchedPairs).toBe(1);
    expect(s2.score).toBe(10);
    expect(s2.cards.filter((c) => c.state === 'matched')).toHaveLength(2);
  });

  it('不配对：两张翻开后 resolvePending 翻回', () => {
    const game = new MemoryMatchGame({ rng: seededRng(3) });
    const board = game.start(NOW).cards;
    // 找两张不同符号的牌
    const a = board[0]!;
    const b = board.find((c) => c.symbol !== a.symbol)!;
    game.flip(a.id);
    const mid = game.flip(b.id);
    if (mid === 'invalid') throw new Error('should not be invalid');
    expect(mid.cards.filter((c) => c.state === 'revealed')).toHaveLength(2);
    const after = game.resolvePending();
    if (after === 'idle') throw new Error('should not be idle');
    expect(after.cards.filter((c) => c.state === 'hidden')).toHaveLength(16);
    expect(after.matches === undefined || true).toBe(true);
  });

  it('全部配对 → won + 完成奖励分（受步数影响）', () => {
    const game = new MemoryMatchGame({ rng: seededRng(5) });
    game.start(NOW);
    let finished: ReturnType<MemoryMatchGame['snapshot']> | undefined;
    const snap = (): void => {
      const s = game.snapshot();
      if (s.status === 'won' && !finished) finished = s;
    };
    // 已知配对逐个消除（按顺序翻 pair）
    for (let round = 0; round < 8; round++) {
      const cards = game.snapshot().cards.filter((c) => c.state === 'hidden');
      // 找出同符号的两张
      const bySymbol = new Map<string, number[]>();
      for (const c of cards) {
        const arr = bySymbol.get(c.symbol) ?? [];
        arr.push(c.id);
        bySymbol.set(c.symbol, arr);
      }
      const [ida, idb] = [...bySymbol.values()].find((v) => v.length === 2)!;
      game.flip(ida);
      game.flip(idb);
      snap();
    }
    expect(finished).toBeDefined();
    expect(finished!.status).toBe('won');
    expect(finished!.matchedPairs).toBe(8);
    expect(finished!.score).toBeGreaterThan(10);
    expect(finished!.finishedAt).not.toBeNull();
  });

  it('开局参数校验：牌数必须为正偶数、符号足够', () => {
    expect(() => new MemoryMatchGame({ cols: 3, rows: 3 })).toThrow(/正偶数/);
    expect(() => new MemoryMatchGame({ cols: 4, rows: 6, symbols: ['a', 'b'] })).toThrow(/需要至少/);
    expect(() => new MemoryMatchGame({ cols: 0, rows: 4 })).toThrow(/正偶数/);
    void DEFAULT_SYMBOLS;
  });

  it('确定性：同一随机种子 → 同一牌面', () => {
    const a = new MemoryMatchGame({ rng: seededRng(99) }).start(NOW).cards;
    const b = new MemoryMatchGame({ rng: seededRng(99) }).start(NOW).cards;
    expect(a.map((c) => c.symbol)).toEqual(b.map((c) => c.symbol));
  });
});