/**
 * 宠物动画状态机（纯逻辑、可单测）：
 * - 事件触发的短动画（吃/玩/思考/升级）优先于基础动画
 * - 基础动画由情绪推导（困→睡眠、兴奋/开心→弹跳…）
 * - 周期性眨眼；注入时钟（now）保证确定性
 */

export type MoodInput = 'excited' | 'happy' | 'content' | 'hungry' | 'sleepy' | 'sad';
export type AnimationId = 'idle' | 'sleep' | 'play' | 'eat' | 'think' | 'levelup';

export interface FrameState {
  animation: AnimationId;
  /** 0..1 单次动画进度 */
  t: number;
  /** 垂直浮动（像素，正=下） */
  bobY: number;
  /** 缩放（呼吸） */
  squash: number;
  /** 0..1，>0.7 表示闭眼 */
  blink: number;
  flipX: boolean;
  mood: MoodInput;
}

export interface PetVisualInput {
  mood: MoodInput;
  /** 显式睡眠（精力低） */
  sleeping?: boolean;
}

const BLINK_PERIOD_MS = 3200;
const BLINK_DURATION_MS = 200;
const BASE_PERIOD_MS = 1200;

export class AnimationController {
  private trigger?: { id: AnimationId; at: number; duration: number };

  constructor(private readonly now: () => number) {}

  /** 触发一次性动画（吃/玩/思考/升级） */
  triggerOnce(id: AnimationId, duration = 900): void {
    this.trigger = { id, at: this.now(), duration };
  }

  update(input: PetVisualInput): FrameState {
    const now = this.now();

    // 触发动画优先
    if (this.trigger) {
      const elapsed = now - this.trigger.at;
      if (elapsed < this.trigger.duration) {
        return this.frame(this.trigger.id, elapsed / this.trigger.duration, input.mood, 0);
      }
      this.trigger = undefined;
    }

    // 眨眼：按时间轴相位（无状态、确定性：每 3200ms 闭 200ms）
    const phase = now % BLINK_PERIOD_MS;
    const blink = phase < BLINK_DURATION_MS ? 1 - phase / BLINK_DURATION_MS : 0;

    // 基础动画：情绪驱动
    let id: AnimationId = 'idle';
    let amplitude = 1.2;
    if (input.sleeping || input.mood === 'sleepy') {
      id = 'sleep';
      amplitude = 0.4;
    } else if (input.mood === 'excited' || input.mood === 'happy') {
      id = 'play';
      amplitude = 2.4;
    } else if (input.mood === 'hungry' || input.mood === 'sad') {
      amplitude = 0.6;
    }

    const t = (now % BASE_PERIOD_MS) / BASE_PERIOD_MS;
    return {
      animation: id,
      t,
      bobY: Math.round(Math.sin(t * Math.PI * 2) * amplitude),
      squash: 1 + Math.sin(t * Math.PI * 2) * 0.02,
      blink: id === 'sleep' ? 1 : blink,
      flipX: false,
      mood: input.mood,
    };
  }

  private frame(id: AnimationId, t: number, mood: MoodInput, customBlink: number): FrameState {
    const p = Math.min(1, Math.max(0, t));
    let bobY = 0;
    let squash = 1;
    let flipX = false;
    let blink = customBlink;
    if (id === 'levelup') {
      bobY = -Math.round(Math.sin(p * Math.PI) * 14); // 跳起
      squash = 1 + Math.sin(p * Math.PI) * 0.25;
    } else if (id === 'play') {
      bobY = Math.round(Math.sin(p * Math.PI * 2) * 2.5);
      flipX = Math.sin(p * Math.PI * 2) > 0;
    } else if (id === 'eat') {
      bobY = Math.round(Math.sin(p * Math.PI * 4) * 0.6); // 抖动（嚼）
    } else if (id === 'think') {
      bobY = Math.round(Math.sin(p * Math.PI * 2) * 0.8);
    } else if (id === 'sleep') {
      blink = 1;
      bobY = Math.round(Math.sin(p * Math.PI * 2) * 0.4);
    }
    return { animation: id, t: p, bobY, squash, blink, flipX, mood };
  }
}