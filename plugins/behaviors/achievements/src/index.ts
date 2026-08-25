import type { PluginDefinition } from '@smartpet/core';

export interface AchievementDef {
  id: string;
  name: string;
}

/** 成就清单（计数存插件私有 KV，跨会话持久） */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'achievement:feeder-5', name: '新手饲主' },
  { id: 'achievement:feeder-15', name: '美食家' },
  { id: 'achievement:player-1', name: '初次游戏' },
  { id: 'achievement:playful-10', name: '玩伴' },
];

export const ACHIEVEMENT_THRESHOLDS: Record<string, { def: AchievementDef; when: (count: number) => boolean }> = {
  'achievement:feeder-5': { def: ACHIEVEMENTS[0]!, when: (n) => n >= 5 },
  'achievement:feeder-15': { def: ACHIEVEMENTS[1]!, when: (n) => n >= 15 },
  'achievement:player-1': { def: ACHIEVEMENTS[2]!, when: (n) => n >= 1 },
  'achievement:playful-10': { def: ACHIEVEMENTS[3]!, when: (n) => n >= 10 },
};

/**
 * 成就系统插件：演示 hooks capability —— 宿主把宠物行为事件派发到钩子，
 * 插件计数并在里程碑处广播 achievement:unlocked（宿主写入 unlocks 并多端同步）。
 */
const plugin: PluginDefinition = {
  manifest: {
    id: '@smartpet/plugin-achievements',
    name: '成就系统',
    version: '0.1.0',
    description: '喂养 / 游戏 / 玩耍里程碑成就',
    author: 'smartpet',
    requires: { pipet: '>=0.1.0' },
    capabilities: [{ kind: 'hooks', hookNames: ['onFed', 'onPlayed', 'onGameScore'] }],
    permissions: [],
  },
  setup: (ctx) => {
    let feeds = 0;
    let plays = 0;
    let games = 0;
    const granted = new Set<string>();

    const loadCount = async (key: string, apply: (v: number) => void): Promise<void> => {
      apply((await ctx.storage.get<number>(key)) ?? 0);
    };
    void loadCount('feeds', (v) => (feeds = v));
    void loadCount('plays', (v) => (plays = v));
    void loadCount('games', (v) => (games = v));
    void ctx.storage.list().then((keys) => {
      for (const key of keys) {
        if (key.startsWith('granted:')) granted.add(key.slice('granted:'.length));
      }
    });

    const consider = async (countKey: string, counter: () => number): Promise<void> => {
      for (const [, rule] of Object.entries(ACHIEVEMENT_THRESHOLDS)) {
        if (rule.def.id.startsWith(`achievement:${countKey}`)) {
          if (!rule.when(counter())) continue;
          if (!rule.def || granted.has(rule.def.id)) continue;
          granted.add(rule.def.id);
          await ctx.storage.set(`granted:${rule.def.id}`, true);
          ctx.bus.emit('achievement:unlocked', { id: rule.def.id, name: rule.def.name });
        }
      }
    };

    const hooks = {
      async onFed() {
        feeds += 1;
        await ctx.storage.set('feeds', feeds);
        await consider('feeder', () => feeds);
      },
      async onPlayed() {
        plays += 1;
        await ctx.storage.set('plays', plays);
        await consider('playful', () => plays);
      },
      async onGameScore() {
        games += 1;
        await ctx.storage.set('games', games);
        await consider('player', () => games);
      },
    };

    ctx.registerCapability({ kind: 'hooks', hookNames: ['onFed', 'onPlayed', 'onGameScore'] }, { hooks });
    return {
      async start() {
        // 预载计数（setup 里已触发）
      },
    };
  },
};

export default plugin;