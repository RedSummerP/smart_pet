import { DECAY_PER_SECOND, STAT_MAX, expNeededForLevel } from './constants.js';
import type { Emotion, FoodItem, GameProgress, JsonValue, PetState, PetStats } from './types.js';

export type PetAction =
  | { type: 'feed'; item: FoodItem; at?: number }
  | { type: 'play'; amount?: number; at?: number }
  | { type: 'tick'; dtMs: number; at?: number }
  | { type: 'rename'; name: string; at?: number }
  | { type: 'unlock'; id: string; at?: number }
  | { type: 'setGameProgress'; game: string; progress: GameProgress; at?: number }
  | { type: 'setFlag'; key: string; value: JsonValue; at?: number };

const clamp = (v: number, lo = 0, hi = STAT_MAX): number => Math.min(hi, Math.max(lo, v));

/** 由属性推导情绪（纯函数） */
export function deriveEmotion(stats: Pick<PetStats, 'satiety' | 'energy' | 'happiness'>): Emotion {
  if (stats.satiety < 20) return 'hungry';
  if (stats.energy < 20) return 'sleepy';
  if (stats.happiness < 30) return 'sad';
  if (stats.happiness > 80) return 'excited';
  if (stats.satiety > 70 && stats.energy > 70) return 'happy';
  return 'content';
}

/** 情绪随状态推导；变化时更新 since，未变化返回原引用 */
function withMood(state: PetState, at: number): PetState {
  const emotion = deriveEmotion(state.stats);
  if (emotion === state.mood.emotion) return state;
  return { ...state, mood: { emotion, since: at } };
}

/** 经验结算：满足升级条件时连续升级（纯函数） */
function gainExp(state: PetState): PetState {
  let { exp, level } = state.stats;
  let need = expNeededForLevel(level);
  while (exp >= need) {
    exp -= need;
    level += 1;
    need = expNeededForLevel(level);
  }
  if (exp === state.stats.exp && level === state.stats.level) return state;
  return {
    ...state,
    stats: { ...state.stats, exp, level, happiness: clamp(state.stats.happiness + (level - state.stats.level) * 10) },
  };
}

/**
 * 宠物状态纯函数 reducer：`petReducer(state, action) → state'`
 * - 无副作用、平台无关、可单测
 * - 相同输入必得相同输出（除 at 时间参数外）
 */
export function petReducer(state: Readonly<PetState>, action: PetAction): PetState {
  const at = action.at ?? Date.now();
  switch (action.type) {
    case 'feed': {
      const s = state.stats;
      const next: PetState = {
        ...state,
        stats: {
          ...s,
          satiety: clamp(s.satiety + action.item.satiety),
          happiness: clamp(s.happiness + action.item.happiness),
          exp: s.exp + action.item.exp,
        },
      };
      return withMood(gainExp(next), at);
    }
    case 'play': {
      const amount = action.amount ?? 10;
      const next: PetState = {
        ...state,
        stats: {
          ...state.stats,
          happiness: clamp(state.stats.happiness + amount),
          energy: clamp(state.stats.energy - amount * 0.5),
          exp: state.stats.exp + 3,
        },
      };
      return withMood(gainExp(next), at);
    }
    case 'tick': {
      const dt = Math.max(0, action.dtMs) / 1000;
      const next: PetState = {
        ...state,
        stats: {
          ...state.stats,
          satiety: clamp(state.stats.satiety - DECAY_PER_SECOND.satiety * dt),
          energy: clamp(state.stats.energy - DECAY_PER_SECOND.energy * dt),
          happiness: clamp(state.stats.happiness - DECAY_PER_SECOND.happiness * dt),
        },
      };
      return withMood(next, at);
    }
    case 'rename':
      return state.meta.name === action.name ? state : { ...state, meta: { ...state.meta, name: action.name } };
    case 'unlock':
      return state.unlocks.includes(action.id) ? state : { ...state, unlocks: [...state.unlocks, action.id] };
    case 'setGameProgress': {
      const prev = state.gameProgress[action.game];
      if (prev && prev.updatedAt === action.progress.updatedAt && prev.score === action.progress.score) return state;
      return { ...state, gameProgress: { ...state.gameProgress, [action.game]: action.progress } };
    }
    case 'setFlag':
      return state.flags[action.key] === action.value ? state : { ...state, flags: { ...state.flags, [action.key]: action.value } };
    default:
      return state;
  }
}