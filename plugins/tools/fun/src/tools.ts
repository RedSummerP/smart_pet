import { Type } from 'typebox';
import type { PetToolDef } from '@smartpet/ai';

/** 抛硬币 */
export const COIN_FLIP_TOOL: PetToolDef<{}> = {
  name: 'coin_flip',
  label: '抛硬币',
  description: '抛一枚硬币，返回「正」或「反」。适合帮主人做二选一决策。',
  parameters: Type.Object({}),
  handler: () => ({ text: Math.random() < 0.5 ? '硬币是「正」面！' : '硬币是「反」面！' }),
};

/** 掷骰子 */
export const DICE_TOOL: PetToolDef<{ sides?: number }> = {
  name: 'dice',
  label: '掷骰子',
  description: '掷一颗骰子（默认 6 面，可用 sides 指定 2-100 面），返回点数。',
  parameters: Type.Object({ sides: Type.Optional(Type.Number()) }),
  handler: (params) => {
    const sides = Math.min(100, Math.max(2, Math.floor(params.sides ?? 6)));
    const value = 1 + Math.floor(Math.random() * sides);
    return { text: `掷出了 ${value} 点（${sides} 面骰）`, details: { value, sides } };
  },
};

const FORTUNES = [
  '今天适合尝试新事物，小皮给你打气！',
  '运势平平但心情美丽，记得按时吃饭～',
  '会遇到小小的惊喜，留意身边人。',
  '适合整理房间和心情，运气立刻变好！',
  '大吉！出门可能有好事发生 ✅',
];

/** 今日运势 */
export const FORTUNE_TOOL: PetToolDef<{}> = {
  name: 'fortune',
  label: '今日运势',
  description: '给主人算一签今日运势（纯娱乐）。',
  parameters: Type.Object({}),
  handler: () => {
    const sign = FORTUNES[Math.floor(Math.random() * FORTUNES.length)]!;
    return { text: `🔮 ${sign}`, details: { sign } };
  },
};

export const FUN_TOOLS: PetToolDef[] = [COIN_FLIP_TOOL, DICE_TOOL, FORTUNE_TOOL];