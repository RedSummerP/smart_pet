import type { PluginDefinition, SkinDefinition, SkinPalette } from '@smartpet/core';

/** 经典皮肤（默认） */
export const CLASSIC_SKIN: SkinDefinition = {
  id: 'classic',
  name: '经典橘猫',
  palette: {
    fur: [245, 166, 35],
    belly: [255, 236, 210],
    ear: [222, 90, 70],
    eye: [30, 30, 30],
    blush: [255, 140, 140],
  },
};

export const MOCHA_SKIN: SkinDefinition = {
  id: 'mocha',
  name: '奶茶布偶',
  palette: {
    fur: [222, 184, 152],
    belly: [255, 246, 236],
    ear: [188, 143, 110],
    eye: [70, 55, 48],
    blush: [255, 182, 162],
  },
};

export const SHADOW_SKIN: SkinDefinition = {
  id: 'shadow',
  name: '暗夜黑猫',
  palette: {
    fur: [62, 62, 72],
    belly: [120, 120, 132],
    ear: [96, 96, 108],
    eye: [245, 235, 120],
    blush: [150, 110, 130],
  },
};

export const MINT_SKIN: SkinDefinition = {
  id: 'mint',
  name: '薄荷蓝浣熊',
  palette: {
    fur: [145, 192, 170],
    belly: [226, 242, 232],
    ear: [96, 148, 128],
    eye: [40, 60, 52],
    blush: [235, 160, 180],
  },
};

const SKINS: SkinDefinition[] = [CLASSIC_SKIN, MOCHA_SKIN, SHADOW_SKIN, MINT_SKIN];

const plugin: PluginDefinition = {
  manifest: {
    id: '@smartpet/plugin-skins-classic',
    name: '经典皮肤包',
    version: '0.1.0',
    description: '四套程序化宠物皮肤：经典橘猫 / 奶茶布偶 / 暗夜黑猫 / 薄荷蓝浣熊',
    author: 'smartpet',
    requires: { pipet: '>=0.1.0' },
    capabilities: SKINS.map((skin) => ({ kind: 'skins', skinId: skin.id }) as const),
    permissions: [],
  },
  setup: (ctx) => {
    for (const skin of SKINS) {
      ctx.registerCapability({ kind: 'skins', skinId: skin.id }, { skins: [skin] } satisfies { skins: SkinDefinition[] });
    }
  },
};

export default plugin;

export type { SkinPalette } from '@smartpet/core';