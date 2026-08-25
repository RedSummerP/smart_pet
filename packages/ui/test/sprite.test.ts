import { describe, expect, it } from 'vitest';
import {
  CAT_HEIGHT,
  CAT_WIDTH,
  CLASSIC_PALETTE,
  countOpaque,
  renderCat,
} from '../src/render/sprite.js';

describe('程序化像素猫精灵', () => {
  it('尺寸与 RGBA 缓冲正确', () => {
    const sprite = renderCat(CLASSIC_PALETTE);
    expect(sprite.width).toBe(CAT_WIDTH);
    expect(sprite.height).toBe(CAT_HEIGHT);
    expect(sprite.pixels.length).toBe(CAT_WIDTH * CAT_HEIGHT * 4);
  });

  it('确定性：同输入同输出；有足够可见像素但非全满', () => {
    const a = renderCat(CLASSIC_PALETTE);
    const b = renderCat(CLASSIC_PALETTE);
    expect(a.pixels).toEqual(b.pixels);
    const opaque = countOpaque(a);
    expect(opaque).toBeGreaterThan(40);
    expect(opaque).toBeLessThan(CAT_WIDTH * CAT_HEIGHT);
  });

  it('pose 变体互不相同（眨眼/开心眼）', () => {
    const open = renderCat(CLASSIC_PALETTE, {});
    const blink = renderCat(CLASSIC_PALETTE, { blink: true });
    const happy = renderCat(CLASSIC_PALETTE, { happy: true });
    expect(blink.pixels).not.toEqual(open.pixels);
    expect(happy.pixels).not.toEqual(open.pixels);
  });

  it('自定调色板生效', () => {
    const gray: typeof CLASSIC_PALETTE = { ...CLASSIC_PALETTE, fur: [128, 128, 128] };
    const s = renderCat(gray);
    // 找一个属于身体/头部的像素应该接近灰色
    let foundGray = false;
    for (let y = 0; y < CAT_HEIGHT && !foundGray; y++) {
      for (let x = 0; x < CAT_WIDTH; x++) {
        const i = (y * CAT_WIDTH + x) * 4;
        if (s.pixels[i] === 128 && s.pixels[i + 1] === 128 && s.pixels[i + 2] === 128) {
          foundGray = true;
          break;
        }
      }
    }
    expect(foundGray).toBe(true);
  });
});