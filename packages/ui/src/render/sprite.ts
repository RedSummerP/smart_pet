import type { SkinPalette } from '@smartpet/core';
import { CLASSIC_SKIN } from '@smartpet/plugin-skins-classic';

/** 程序化像素猫：确定性生成 RGBA 帧缓冲（无外部资源、纯逻辑、可单测） */
export type { SkinPalette };

/** 默认皮肤（经典橘猫） */
export const CLASSIC_PALETTE: SkinPalette = CLASSIC_SKIN.palette;

export const CAT_WIDTH = 22;
export const CAT_HEIGHT = 20;

export interface RenderedSprite {
  width: number;
  height: number;
  /** RGBA 字节序（直接可写入 ImageData） */
  pixels: Uint8Array;
}

export interface CatPose {
  /** 闭眼（眨眼帧） */
  blink?: boolean;
  /** 开心眼（^ ^） */
  happy?: boolean;
}

class Canvas {
  readonly pixels: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, c: [number, number, number], a = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.pixels[i] = c[0];
    this.pixels[i + 1] = c[1];
    this.pixels[i + 2] = c[2];
    this.pixels[i + 3] = a;
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: [number, number, number], a = 255): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }

  fillTriangle(
    ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
    color: [number, number, number], a = 255,
  ): void {
    const minX = Math.floor(Math.min(ax, bx, cx));
    const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));
    const sign = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number =>
      (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d1 = sign(x, y, ax, ay, bx, by);
        const d2 = sign(x, y, bx, by, cx, cy);
        const d3 = sign(x, y, cx, cy, ax, ay);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) this.set(x, y, color, a);
      }
    }
  }
}

function eyes(c: Canvas, palette: SkinPalette, pose: CatPose): void {
  const left = [
    [7, 6],
    [8, 6],
    [7, 7],
    [8, 7],
  ] as const;
  const right = [
    [12, 6],
    [13, 6],
    [12, 7],
    [13, 7],
  ] as const;
  if (pose.blink) {
    // 闭眼：横线
    c.set(7, 7, palette.eye, 255);
    c.set(8, 7, palette.eye, 255);
    c.set(12, 7, palette.eye, 255);
    c.set(13, 7, palette.eye, 255);
    return;
  }
  if (pose.happy) {
    // 开心眼：^ 形
    c.set(7, 7, palette.eye, 255);
    c.set(8, 6, palette.eye, 255);
    c.set(9, 7, palette.eye, 255);
    c.set(11, 7, palette.eye, 255);
    c.set(12, 6, palette.eye, 255);
    c.set(13, 7, palette.eye, 255);
    return;
  }
  for (const [x, y] of left) c.set(x, y, palette.eye, 255);
  c.set(7, 6, [255, 255, 255], 220); // 高光
  for (const [x, y] of right) c.set(x, y, palette.eye, 255);
  c.set(12, 6, [255, 255, 255], 220);
}

/** 渲染一帧像素猫 */
export function renderCat(palette: SkinPalette, pose: CatPose = {}): RenderedSprite {
  const c = new Canvas(CAT_WIDTH, CAT_HEIGHT);
  const { fur, belly, ear } = palette;

  // 尾巴
  c.set(16, 15, fur);
  c.set(17, 14, fur);
  c.set(18, 13, fur);
  c.set(19, 12, fur);
  c.set(20, 12, fur);
  c.set(21, 13, fur);

  // 身体
  c.fillEllipse(11, 15.5, 7, 4.6, fur);
  c.fillEllipse(12, 16.5, 4, 2.6, belly);

  // 头部
  c.fillEllipse(10, 7.2, 5.2, 4.6, fur);

  // 耳朵（左 + 内耳，右 + 内耳）
  c.fillTriangle(4, 5, 7, 0, 9, 5, fur);
  c.fillTriangle(5.5, 4.5, 7, 2, 8, 4.5, ear);
  c.fillTriangle(11, 5, 13, 0, 16, 5, fur);
  c.fillTriangle(12, 4.5, 13, 2, 14.5, 4.5, ear);

  // 脸（鼻子/嘴/腮红）
  c.set(9, 9, ear, 255);
  c.set(10, 9, ear, 255);
  c.set(9, 10, [120, 80, 60], 255);
  c.set(10, 10, [120, 80, 60], 255);
  c.set(5, 9, palette.blush, 130);
  c.set(6, 9, palette.blush, 130);
  c.set(14, 9, palette.blush, 130);
  c.set(15, 9, palette.blush, 130);

  // 眼睛
  eyes(c, palette, pose);

  return { width: c.width, height: c.height, pixels: c.pixels };
}

/** 不透明像素计数（健康检查 / 测试用） */
export function countOpaque(sprite: RenderedSprite): number {
  let n = 0;
  for (let i = 3; i < sprite.pixels.length; i += 4) if (sprite.pixels[i] !== 0) n++;
  return n;
}