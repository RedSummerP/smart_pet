import { Application, Container, Sprite, Texture } from 'pixi.js';
import { AnimationController, type PetVisualInput, type FrameState } from './animation.js';
import { CLASSIC_PALETTE, renderCat, type RenderedSprite } from './sprite.js';

export interface PetRendererOptions {
  canvas: HTMLCanvasElement;
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

/**
 * Pixi 宠物渲染器：把程序化像素精灵贴到 WebGL 画布，按动画状态机每帧更新
 * （浮动/缩放/眨眼/翻转）。纯逻辑在 animation.ts / sprite.ts，本类只做上屏。
 */
export class PetRenderer {
  private readonly app: Application;
  private readonly stage: Container;
  private readonly sprite: Sprite;
  private readonly controller: AnimationController;

  constructor(options: PetRendererOptions) {
    this.controller = new AnimationController(options.now ?? (() => performance.now()));
    this.app = new Application({ canvas: options.canvas, backgroundAlpha: 0, antialias: false, resolution: 2 });
    this.stage = new Container();
    this.app.stage.addChild(this.stage);

    const open = textureFromRendered(renderCat(CLASSIC_PALETTE, { blink: false }));
    const closed = textureFromRendered(renderCat(CLASSIC_PALETTE, { blink: true }));
    const happy = textureFromRendered(renderCat(CLASSIC_PALETTE, { happy: true }));
    this.sprite = new Sprite(open);
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.position.set(this.app.screen.width / 2, this.app.screen.height / 2 + 30);
    this.stage.addChild(this.sprite);

    // 缓存闭眼/开心纹理以便切换
    this.textures = { open, closed, happy };
  }

  private readonly textures: { open: Texture; closed: Texture; happy: Texture };

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