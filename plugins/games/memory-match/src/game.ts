/**
 * 记忆翻牌游戏引擎（纯 TS 状态机，无 UI 依赖、可注入随机源与时钟，可单测）。
 * 规则：牌面翻两张，相同则配对成功，否则自动翻回；全部配对即胜利。
 */

export type MemoryCardState = 'hidden' | 'revealed' | 'matched';

export interface MemoryCard {
  id: number;
  symbol: string;
  state: MemoryCardState;
}

export type MemoryStatus = 'idle' | 'playing' | 'won';

export interface MemorySnapshot {
  cards: MemoryCard[];
  moves: number;
  matchedPairs: number;
  totalPairs: number;
  score: number;
  status: MemoryStatus;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface MemoryMatchOptions {
  cols?: number;
  rows?: number;
  symbols?: string[];
  /** 随机源（测试注入种子） */
  rng?: () => number;
}

export const DEFAULT_SYMBOLS = ['🐟', '🐱', '🍎', '🌈', '🍪', '🌙', '⭐', '🎮'] as const;

const MATCH_SCORE = 10;
const WIN_BONUS_BASE = 60;

export class MemoryMatchGame {
  private readonly cols: number;
  private readonly rows: number;
  private readonly symbols: string[];
  private readonly rng: () => number;

  private deck: MemoryCard[] = [];
  private pending: MemoryCard[] = [];
  private moves = 0;
  private matched = 0;
  private score = 0;
  private status: MemoryStatus = 'idle';
  private startedAt: number | null = null;
  private finishedAt: number | null = null;

  constructor(options: MemoryMatchOptions = {}) {
    this.cols = options.cols ?? 4;
    this.rows = options.rows ?? 4;
    const total = this.cols * this.rows;
    if (total <= 0 || total % 2 !== 0) throw new Error(`牌面 ${this.cols}×${this.rows} 必须为正偶数`);
    this.symbols = [...(options.symbols ?? DEFAULT_SYMBOLS)];
    if (this.symbols.length < total / 2) {
      throw new Error(`需要至少 ${total / 2} 个不同符号，实际 ${this.symbols.length}`);
    }
    this.rng = options.rng ?? Math.random;
  }

  get totalPairs(): number {
    return (this.cols * this.rows) / 2;
  }

  start(now = Date.now()): MemorySnapshot {
    const total = this.cols * this.rows;
    const pairSymbols = this.symbols.slice(0, this.totalPairs);
    const rawCards: MemoryCard[] = [];
    for (let i = 0; i < this.totalPairs; i++) {
      rawCards.push({ id: i * 2, symbol: pairSymbols[i]!, state: 'hidden' });
      rawCards.push({ id: i * 2 + 1, symbol: pairSymbols[i]!, state: 'hidden' });
    }
    // Fisher–Yates
    for (let i = rawCards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [rawCards[i], rawCards[j]] = [rawCards[j]!, rawCards[i]!];
    }
    this.deck = rawCards.map((card, index) => ({ ...card, id: index }));
    this.pending = [];
    this.moves = 0;
    this.matched = 0;
    this.score = 0;
    this.status = 'playing';
    this.startedAt = now;
    this.finishedAt = null;
    return this.snapshot();
  }

  /** 翻牌。非法操作返回 'invalid'（保持原状态） */
  flip(id: number): MemorySnapshot | 'invalid' {
    if (this.status !== 'playing') return 'invalid';
    const card = this.deck[id];
    if (!card || card.state !== 'hidden') return 'invalid';
    if (this.pending.length >= 2) return 'invalid'; // 等待本轮结算（resolvePending）

    if (this.pending.length === 0) {
      card.state = 'revealed';
      this.pending.push(card);
    } else {
      const first = this.pending[0]!;
      if (first.id === id) return 'invalid';
      card.state = 'revealed';
      this.pending.push(card);
      this.moves += 1;
      if (first.symbol === card.symbol) {
        first.state = 'matched';
        card.state = 'matched';
        this.matched += 1;
        this.score += MATCH_SCORE;
        this.pending = [];
        if (this.matched === this.totalPairs) {
          this.status = 'won';
          this.finishedAt = Date.now();
        }
      }
    }
    return this.snapshot();
  }

  /** 结算未配对的待处理翻牌（UI 在延迟后调用，把两张翻回） */
  resolvePending(): MemorySnapshot | 'idle' {
    if (this.pending.length !== 2) return 'idle';
    if (this.pending[0]!.state === 'matched' || this.pending[1]!.state === 'matched') {
      this.pending = [];
      return this.snapshot();
    }
    for (const card of this.pending) card.state = 'hidden';
    this.pending = [];
    return this.snapshot();
  }

  snapshot(): MemorySnapshot {
    const bonus = this.status === 'won' ? Math.max(0, WIN_BONUS_BASE - this.moves * 2) : 0;
    return {
      cards: this.deck.map((c) => ({ ...c })),
      moves: this.moves,
      matchedPairs: this.matched,
      totalPairs: this.totalPairs,
      score: this.score + bonus,
      status: this.status,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }
}