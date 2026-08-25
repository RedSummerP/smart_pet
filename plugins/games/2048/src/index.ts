import type { GameCapabilityImpl, PluginDefinition } from '@smartpet/core';

const plugin: PluginDefinition = {
  manifest: {
    id: '@smartpet/plugin-game-2048',
    name: '2048',
    version: '0.1.0',
    description: '经典数字合并：相同数字合成更大数字，合出 2048 即胜利',
    author: 'smartpet',
    requires: { pipet: '>=0.1.0' },
    capabilities: [{ kind: 'games' }],
    permissions: [],
  },
  setup: (ctx) => {
    const gameImpl: GameCapabilityImpl = {
      games: [
        {
          id: '2048',
          title: '2048',
          description: '上下左右滑动合并相同数字，合出 2048 即胜利（分数计入宠物状态）',
          entry: 'game-2048',
          minLevel: 1,
        },
      ],
    };
    ctx.registerCapability({ kind: 'games' }, gameImpl);
  },
};

export default plugin;

export { Game2048, type Direction, type Game2048Snapshot } from './game.js';