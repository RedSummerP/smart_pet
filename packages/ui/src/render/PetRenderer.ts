import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { SkinPalette } from '@smartpet/core';
import { CLASSIC_SKIN } from '@smartpet/plugin-skins-classic';
import { AnimationController, type PetVisualInput, type FrameState } from './animation.js';
import { renderCat, type RenderedSprite } from './sprite.js';

export interface PetRendererOptions {
  canvas: HTMLCanvasElement;
  /** 初始皮肤（缺省经典橘猫） */
  palette?: SkinPalette;
  /** 注入时钟（测试可确定性推进） */
  now?: () => number;
}

function textureFromRendered(rendered: RenderedSprite): Texture {
  const canvas = new OffscreenCanvas(rendered.width, rendered.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2d 上下文');
  const image = ctx.createImageData(rendered.width, rendered.height);
  image.data.set(rendered.pixels);
  ctx.putImageData(image, 0, 0);
  return Texture.from(canvas as unknown as HTMLCanvasElement);
}

interface TextureSet {
  open: Texture;
  closed: Texture;
  happy: Texture;
}

/**
 * Pixi 宠物渲染器：把程序化像素精灵贴到 WebGL 画布，按动画状态机每帧更新。
 * 皮肤（palette）可随时切换 —— 重新生成贴图（换装随 PetState.flags.skin 跨端同步）。
 */
export class PetRenderer {
  private readonly app: Application;
  private readonly stage: Container;
  private readonly sprite: Sprite;
  private readonly controller: AnimationController;
  private textures!: TextureSet;

  constructor(options: PetRendererOptions) {
    this.controller = new AnimationController(options.now ?? (() => performance.now()));
    this.app = new Application({ canvas: options.canvas, backgroundAlpha: 0, antialias: false, resolution: 2 });
    this.stage = new Container();
    this.app.stage.addChild(this.stage);

    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.position.set(this.app.screen.width / 2, this.app.screen.height / 2 + 30);
    this.stage.addChild(this.sprite);

    this.setPalette(options.palette ?? CLASSIC_SKIN.palette);
  }

  /** 换肤：根据调色板重建三张贴图（睁眼/闭眼/开心眼） */
  setPalette(palette: SkinPalette): void {
    this.textures = {
      open: textureFromRendered(renderCat(palette, { blink: false })),
      closed: textureFromRendered(renderCat(palette, { blink: true })),
      happy: textureFromRendered(renderCat(palette, { happy: true })),
    };
  }

  update(input: PetVisualInput): FrameState {
    const frame = this.controller.update(input);
    const { bobY, squash, blink, flipX, mood } = frame;
    this.sprite.texture =
      mood === 'excited' || mood === 'happy'
        ? this.textures.happy
        : blink > 0.7
          ? this.textures.closed
          : this.textures.open;
    this.sprite.scale.set(2 * squash * (flipX ? -1 : 1), 2 * squash);
    this.sprite.position.y = this.app.screen.height / 2 + 30 + bobY;
    return frame;
  }

  triggerOnce(id: Parameters<AnimationController['triggerOnce']>[0], duration?: number): void {
    this.controller.triggerOnce(id, duration);
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: true });
  }
}