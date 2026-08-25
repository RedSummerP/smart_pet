/** 宠物情绪 */
export type Emotion = 'excited' | 'happy' | 'content' | 'hungry' | 'sleepy' | 'sad';

/** 基础属性：satiety/energy/happiness 均为 0..100，exp>=0，level>=1 */
export interface PetStats {
  /** 饱食度 */
  satiety: number;
  /** 精力 */
  energy: number;
  /** 心情 */
  happiness: number;
  /** 经验（累计，用于升级） */
  exp: number;
  /** 等级（>=1） */
  level: number;
}

export interface Mood {
  emotion: Emotion;
  /** 情绪开始时间（Unix ms） */
  since: number;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** 单款游戏的进度存档（key = 游戏插件 capability 提交的 game id） */
export interface GameProgress {
  score: number;
  completed: number;
  best: number;
  updatedAt: number;
  flags?: Record<string, JsonValue>;
}

/** 宠物完整状态（本地优先同步单元即整个 PetState 文档） */
export interface PetState {
  meta: { id: string; name: string; createdAt: number; schemaVersion: 1 };
  stats: PetStats;
  mood: Mood;
  unlocks: string[];
  gameProgress: Record<string, GameProgress>;
  /** 插件扩展区：由 schemas capability 声明并受限读写 */
  flags: Record<string, JsonValue>;
}

/** 食物 */
export interface FoodItem {
  id: string;
  name: string;
  satiety: number;
  happiness: number;
  exp: number;
}