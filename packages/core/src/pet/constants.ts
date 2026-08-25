import type { FoodItem, PetState } from './types.js';

export const SCHEMA_VERSION = 1 as const;

export const STAT_MAX = 100;
export const START_LEVEL = 1;

/** 每秒属性衰减（约每天 satiety -86 / energy -43 / happiness -26，需喂食/睡觉补充） */
export const DECAY_PER_SECOND = {
  satiety: 1 / 60 / 60,
  energy: 0.5 / 60 / 60,
  happiness: 0.3 / 60 / 60,
} as const;

/** 从 level 升到 level+1 所需经验 */
export const expNeededForLevel = (level: number): number => 100 + (level - 1) * 50;

export const FOODS: readonly FoodItem[] = [
  { id: 'fish', name: '小鱼干', satiety: 30, happiness: 5, exp: 10 },
  { id: 'cake', name: '彩虹蛋糕', satiety: 20, happiness: 15, exp: 12 },
  { id: 'apple', name: '苹果', satiety: 15, happiness: 3, exp: 6 },
] as const;

/** 轻量 id 生成（避免依赖全局 crypto 类型） */
export function genId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function createInitialPetState(name = '皮皮', now = Date.now()): PetState {
  return {
    meta: { id: genId('pet'), name, createdAt: now, schemaVersion: SCHEMA_VERSION },
    stats: { satiety: 80, energy: 80, happiness: 70, exp: 0, level: START_LEVEL },
    mood: { emotion: 'content', since: now },
    unlocks: [],
    gameProgress: {},
    flags: {},
  };
}