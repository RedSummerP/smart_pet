/** 皮肤体系（skins capability）：调色板类型放核心层，插件提供皮肤定义，渲染层消费 */

/** RGB 调色板（0-255） */
export interface SkinPalette {
  fur: [number, number, number];
  belly: [number, number, number];
  ear: [number, number, number];
  eye: [number, number, number];
  blush: [number, number, number];
}

export interface SkinDefinition {
  id: string;
  name: string;
  palette: SkinPalette;
}

/** skins capability 的实现形状（插件通过 registerCapability({kind:'skins', skinId}, impl) 提供） */
export interface SkinCapabilityImpl {
  skins: SkinDefinition[];
}