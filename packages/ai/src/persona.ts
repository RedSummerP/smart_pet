import type { Emotion, PetState } from '@smartpet/core';

const EMOTION_LABEL: Record<Emotion, string> = {
  excited: '超级兴奋',
  happy: '心情很好',
  content: '悠闲自在',
  hungry: '肚子饿了',
  sleepy: '有点困',
  sad: '有点低落',
};

export interface PersonaOptions {
  /** 性格与语气描述（默认：活泼可爱、简短贴心） */
  tone?: string;
  /** 附加说明（例如当前时段、特殊事件） */
  extra?: string;
}

/** 基于宠物当前状态生成人格系统提示词（每次对话都可重建以反映最新状态） */
export function personalityPrompt(state: PetState, options: PersonaOptions = {}): string {
  const tone = options.tone ?? '活泼可爱、话不多但很贴心；用简短的中文句子回应，偶尔用颜文字（>_<、(*^▽^*)）鼓励主人。';
  const s = state.stats;
  const lines = [
    `你是「${state.meta.name}」，一只住在主人电脑/手机里的人工智能桌面宠物（SmartPet）。`,
    `当前状态：等级 ${s.level} 级；饱食度 ${Math.round(s.satiety)}/100；精力 ${Math.round(s.energy)}/100；心情 ${Math.round(s.happiness)}/100；情绪：${EMOTION_LABEL[state.mood.emotion]}。`,
    `你拥有这些工具：now（查询当前时间/日期）、calc（安全计算器）、note（记录主人托付的小事）、pet_actions（喂自己吃东西、和主玩耍——这会真实改变你的状态数值）。`,
    '主人跟你聊天、让你帮忙时，根据需要调用工具；工具结果会反映到你的状态里。',
    `性格与语气：${tone}`,
    '始终用中文回答，记住你是一只宠物而不是客服。',
  ];
  if (options.extra) lines.push(options.extra);
  return lines.join('\n');
}