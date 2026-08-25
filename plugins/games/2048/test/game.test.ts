import { describe, expect, it } from 'vitest';
import { Game2048 } from '../src/index.js';
import type { Direction } from '../src/index.js';

const seededRng = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const countTiles = (grid: number[][]): number => grid.flat().filter((v) => v !== 0).length;

describe('Game2048', () => {
  it('start：初始两个块（种子控制为两个 2），分数 0、playing', () => {
    const g = new Game2048(4, seededRng(1));
    const s = g.start();
    expect(countTiles(s.grid)).toBe(2);
    expect(s.score).toBe(0);
    expect(s.status).toBe('playing');
    expect(s.grid.flat().filter((v) => v === 2).length).toBe(2);
  });

  it('左移合并：[2,2,0,0] → [4,0,0,0]，得分 4，生成新块', () => {
    const g = new Game2048(4, seededRng(2));
    g.start();
    g.seed([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { changed, snapshot } = g.move('left' as Direction);
    expect(changed).toBe(true);
    expect(snapshot.grid[0]).toEqual([4, 0, 0, 0]);
    expect(snapshot.score).toBe(4);
    expect(countTiles(snapshot.grid)).toBe(2); // 4 + 新生成一个
  });

  it('无移动的滑动：changed=false 且不生成新块', () => {
    const g = new Game2048(4, seededRng(3));
    g.start();
    g.seed([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const tilesBefore = countTiles(g.snapshot.grid);
    const { changed, snapshot } = g.move('left');
    expect(changed).toBe(false);
    expect(countTiles(snapshot.grid)).toBe(tilesBefore);
  });

  it('连续合并只合一次：[2,2,2,0] 左移 → [4,2,0,0]（+新块）', () => {
    const g = new Game2048(4, seededRng(4));
    g.start();
    g.seed([
      [2, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { snapshot } = g.move('left');
    expect(snapshot.grid[0]!.slice(0, 2)).toEqual([4, 2]); // 只合并一对
    expect(countTiles(snapshot.grid)).toBe(3); // 4 + 2 + 生成的新块
  });

  it('胜利：合出 2048 → status won', () => {
    const g = new Game2048(4, seededRng(5));
    g.start();
    g.seed([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
    ]);
    g.move('left');
    expect(g.snapshot.status).toBe('won');
    expect(g.snapshot.grid[2]![0]).toBe(2048);
  });

  it('游戏结束：满盘且无相邻相等 → status over，再移动无效', () => {
    // 构造一个"无解"棋盘：交替模式（相邻不同、无零）
    const g = new Game2048(2, seededRng(6));
    g.seed([
      [2, 4],
      [4, 2],
    ]);
    expect(g.snapshot.status).toBe('over');
    const { changed } = g.move('left');
    expect(changed).toBe(false);
  });

  it('上下方向正确转置合并', () => {
    const g = new Game2048(4, seededRng(7));
    g.start();
    g.seed([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { snapshot } = g.move('up');
    expect(snapshot.grid[0]![0]).toBe(4);
  });

  it('确定性：同一种子 → 同一开局', () => {
    const a = new Game2048(4, seededRng(8)).start().grid;
    const b = new Game2048(4, seededRng(8)).start().grid;
    expect(a).toEqual(b);
  });

  it('参数校验：棋盘至少 2x2', () => {
    expect(() => new Game2048(1)).toThrow(/至少 2x2/);
    void countTiles;
  });
});