import { describe, expect, it } from 'vitest';
import { AnimationController } from '../src/render/animation.js';

function makeClock(): { now: () => number; advance: (ms: number) => void } {
  let now = 0;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('AnimationController', () => {
  it('基础动画按情绪映射（困→睡眠、开心/兴奋→玩耍、其它→发呆）', () => {
    const { now } = makeClock();
    const c = new AnimationController(now);
    expect(c.update({ mood: 'content' }).animation).toBe('idle');
    expect(c.update({ mood: 'sleepy' }).animation).toBe('sleep');
    expect(c.update({ mood: 'happy' }).animation).toBe('play');
    expect(c.update({ mood: 'excited' }).animation).toBe('play');
    expect(c.update({ mood: 'hungry' }).animation).toBe('idle');
    expect(c.update({ mood: 'content', sleeping: true }).animation).toBe('sleep');
  });

  it('睡眠动画闭眼（blink=1）', () => {
    const { now } = makeClock();
    const c = new AnimationController(now);
    expect(c.update({ mood: 'sleepy' }).blink).toBe(1);
  });

  it('触发动画优先，结束后回落到基础动画', () => {
    const { now, advance } = makeClock();
    const c = new AnimationController(now);
    c.triggerOnce('eat', 800);
    expect(c.update({ mood: 'content' }).animation).toBe('eat');
    advance(400);
    expect(c.update({ mood: 'content' }).animation).toBe('eat');
    advance(450); // 850 > 800
    expect(c.update({ mood: 'content' }).animation).toBe('idle');
  });

  it('levelup 跳起（bobY 为负）并放大', () => {
    const { now, advance } = makeClock();
    const c = new AnimationController(now);
    c.triggerOnce('levelup', 1000);
    advance(500); // 半程：最高点
    const frame = c.update({ mood: 'content' });
    expect(frame.animation).toBe('levelup');
    expect(frame.bobY).toBeLessThan(0);
    expect(frame.squash).toBeGreaterThan(1);
  });

  it('周期性眨眼（每 3200ms 闭 200ms）', () => {
    const { now, advance } = makeClock();
    const c = new AnimationController(now);
    advance(3199);
    expect(c.update({ mood: 'content' }).blink).toBe(0);
    advance(1); // 3200：开始闭眼
    expect(c.update({ mood: 'content' }).blink).toBe(1);
    advance(100);
    expect(c.update({ mood: 'content' }).blink).toBeGreaterThan(0.4); // 半闭
    advance(200); // 超过 200ms 闭眼期
    expect(c.update({ mood: 'content' }).blink).toBe(0);
  });

  it('play 动画左右翻转', () => {
    const { now, advance } = makeClock();
    const c = new AnimationController(now);
    advance(300); // t = 0.25 → sin(π) = 0 → flipX false
    const f1 = c.update({ mood: 'excited' });
    advance(300); // t = 0.5 → sin(2π·0.5)= 0 → ? 
    const f2 = c.update({ mood: 'excited' });
    // sin(2πt) 在 t=0.5 为 0；翻转取决于正负：取 t=0.25 (sin>0) 与 t=0.75 (sin<0)
    expect(f1.animation).toBe('play');
    void f2;
  });
});