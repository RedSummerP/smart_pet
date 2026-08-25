import type { PluginDefinition } from '@smartpet/core';
import { FUN_TOOLS } from './tools.js';

/**
 * 娱乐工具包插件：演示 AI 工具插件化 —— 插件注册 tools capability，
 * 宿主收集后合并进 PetAgent 的工具集，AI 对话时可直接调用。
 */
const plugin: PluginDefinition = {
  manifest: {
    id: '@smartpet/plugin-tools-fun',
    name: '娱乐工具包',
    version: '0.1.0',
    description: '抛硬币 / 掷骰子 / 今日运势 —— 小皮给主人的小确幸',
    author: 'smartpet',
    requires: { pipet: '>=0.1.0' },
    capabilities: [
      {
        kind: 'tools',
        toolNames: FUN_TOOLS.map((t) => t.name),
      },
    ],
    permissions: [],
  },
  setup: (ctx) => {
    ctx.registerCapability({ kind: 'tools', toolNames: FUN_TOOLS.map((t) => t.name) }, {
      tools: FUN_TOOLS,
    });
  },
};

export default plugin;

export { FUN_TOOLS, COIN_FLIP_TOOL, DICE_TOOL, FORTUNE_TOOL } from './tools.js';