/**
 * 2048 游戏引擎（纯 TS 状态机，无 UI 依赖、可注入随机源，可单测）。
 * 规则：上下左右滑动合并相同数字（2 合 4 得 4 分），出现 2048 即胜利；
 * 无法移动（满盘且无相邻相等）则游戏结束。
 */

export type Direction = 'up' | 'down' | 'left' | 'right';
export type Game2048Status = 'playing' | 'won' | 'over';

export interface Game2048Snapshot {
  grid: number[][];
  score: number;
  status: Game2048Status;
}

export interface MoveResult {
  changed: boolean;
  snapshot: Game2048Snapshot;
}

const SPAWN_TWO_RATE = 0.9;

export class Game2048 {
  private grid: number[][] = [];
  private score = 0;
  private status: Game2048Status = 'playing';

  constructor(
    private readonly size = 4,
    private readonly rng: () => number = Math.random,
    private readonly winValue = 2048,
  ) {
    if (size < 2) throw new Error('棋盘至少 2x2');
    this.grid = emptyGrid(size);
  }

  get snapshot(): Game2048Snapshot {
    return {
      grid: this.grid.map((row) => [...row]),
      score: this.score,
      status: this.status,
    };
  }

  /** 开局（放两个初始快块） */
  start(): Game2048Snapshot {
    this.grid = emptyGrid(this.size);
    this.score = 0;
    this.status = 'playing';
    this.spawn();
    this.spawn();
    return this.snapshot;
  }

  /** 恢复（测试/存档还原钩子） */
  seed(grid: number[][], score = 0): Game2048Snapshot {
    if (grid.length !== this.size || grid.some((row) => row.length !== this.size)) {
      throw new Error('棋盘尺寸不符');
    }
    this.grid = grid.map((row) => [...row]);
    this.score = score;
    this.status = this.grid.some((row) => row.some((v) => v >= this.winValue))
      ? 'won'
      : this.canMove() ? 'playing' : 'over';
    return this.snapshot;
  }

  /** 滑动：有移动/合并返回 changed=true 并生成新块 */
  move(direction: Direction): MoveResult {
    if (this.status !== 'playing') return { changed: false, snapshot: this.snapshot };

    const lines = extractLines(this.grid, direction);
    let moved = false;
    let gained = 0;
    const newLines: number[][] = [];
    for (const line of lines) {
      const result = collapse(line);
      moved = moved || result.changed;
      gained += result.gained;
      newLines.push(result.line);
    }
    if (!moved) return { changed: false, snapshot: this.snapshot };

    this.grid = rebuild(this.grid, newLines, direction);
    this.score += gained;
    this.spawn();

    if (this.grid.some((row) => row.some((v) => v >= this.winValue))) {
      this.status = 'won';
    } else if (!this.canMove()) {
      this.status = 'over';
    }
    return { changed: true, snapshot: this.snapshot };
  }

  private spawn(): void {
    const empty: Array<[number, number]> = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r]![c] === 0) empty.push([r, c]);
      }
    }
    if (empty.length === 0) return;
    const [r, c] = empty[Math.floor(this.rng() * empty.length)]!;
    this.grid[r]![c] = this.rng() < SPAWN_TWO_RATE ? 2 : 4;
  }

  private canMove(): boolean {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const value = this.grid[r]![c]!;
        if (value === 0) return true;
        if (c + 1 < this.size && this.grid[r]![c + 1] === value) return true;
        if (r + 1 < this.size && this.grid[r + 1]![c] === value) return true;
      }
    }
    return false;
  }
}

const emptyGrid = (size: number): number[][] => Array.from({ length: size }, () => Array(size).fill(0));

interface CollapseResult {
  line: number[];
  changed: boolean;
  gained: number;
}

/** 单行折叠：去零 → 相邻相同合并（只合并一次/对）→ 补零 */
function collapse(line: number[]): CollapseResult {
  const values = line.filter((v) => v !== 0);
  const merged: number[] = [];
  let gained = 0;
  for (let i = 0; i < values.length; i++) {
    const current = values[i]!;
    const next = values[i + 1];
    if (next !== undefined && next === current) {
      merged.push(current * 2);
      gained += current * 2;
      i++; // 跳过被合并的
    } else {
      merged.push(current);
    }
  }
  while (merged.length < line.length) merged.push(0);
  // changed 判定：与移动前逐位比较（带零未动 ≠ 移动）
  const changed = merged.some((v, i) => v !== line[i]);
  return { line: merged, changed, gained };
}

/** 按方向抽取行/列（方向归一化为从左到右折叠） */
function extractLines(grid: number[][], direction: Direction): number[][] {
  const size = grid.length;
  const lines: number[][] = [];
  if (direction === 'left') {
    for (let r = 0; r < size; r++) lines.push([...grid[r]!]);
  } else if (direction === 'right') {
    for (let r = 0; r < size; r++) lines.push([...grid[r]!].reverse());
  } else if (direction === 'up') {
    for (let c = 0; c < size; c++) {
      const col: number[] = [];
      for (let r = 0; r < size; r++) col.push(grid[r]![c]!);
      lines.push(col);
    }
  } else {
    for (let c = 0; c < size; c++) {
      const col: number[] = [];
      for (let r = 0; r < size; r++) col.push(grid[r]![c]!);
      lines.push(col.reverse());
    }
  }
  return lines;
}

/** 折叠结果写回棋盘 */
function rebuild(grid: number[][], lines: number[][], direction: Direction): number[][] {
  const size = grid.length;
  const next = emptyGrid(size);
  if (direction === 'left') {
    for (let r = 0; r < size; r++) next[r] = [...lines[r]!];
  } else if (direction === 'right') {
    for (let r = 0; r < size; r++) next[r] = [...lines[r]!].reverse();
  } else if (direction === 'up') {
    for (let c = 0; c < size; c++) {
      for (let r = 0; r < size; r++) next[r]![c] = lines[c]![r]!;
    }
  } else {
    for (let c = 0; c < size; c++) {
      const col = [...lines[c]!].reverse();
      for (let r = 0; r < size; r++) next[r]![c] = col[r]!;
    }
  }
  return next;
}