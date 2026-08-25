import type { GameCapabilityImpl, PluginDefinition } from '@smartpet/core';

/**
 * 记忆翻牌插件：演示 "万物可插件" —— 游戏元数据 + 玩法引擎由插件提供，
 * UI 端按 games capability 的 entry 挂载对应组件。
 */
const plugin: PluginDefinition = {
  manifest: {
    id: '@smartpet/plugin-memory-match',
    name: '记忆翻牌',
    version: '0.1.0',
    description: '经典记忆配对小游戏：翻两张，配对消灭，全部消除即胜利',
    author: 'smartpet',
    requires: { pipet: '>=0.1.0' },
    capabilities: [{ kind: 'games' }],
    permissions: [],
  },
  setup: (ctx) => {
    const gameImpl: GameCapabilityImpl = {
      games: [
        {
          id: 'memory-match',
          title: '记忆翻牌',
          description: '4×4 配对：翻两张相同则消除，全部消除即胜利（分数计入宠物状态并多端同步）',
          entry: 'memory-match',
          minLevel: 1,
        },
      ],
    };
    ctx.registerCapability({ kind: 'games' }, gameImpl);
    return {
      start() {
        // 游戏引擎无后台任务，无需额外 start 逻辑
      },
      stop() {
        /* no-op */
      },
    };
  },
};

export default plugin;

export { DEFAULT_SYMBOLS, MemoryMatchGame, type MemoryCard, type MemorySnapshot } from './game.js';