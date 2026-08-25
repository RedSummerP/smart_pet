import {
  EventBus,
  PluginRegistry,
  PetRuntime,
  FOODS,
  type GameCapabilityImpl,
  type PetState,
  type PluginDefinition,
  type SkinDefinition,
} from '@smartpet/core';
import {
  buildModels,
  createModels,
  createPetAgent,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  parseSettings,
  personalityPrompt,
  type AgentEvent,
  type FauxProviderHandle,
  type MutableModels,
  type PetAgent,
} from '@smartpet/ai';
import {
  MemorySyncAdapter,
  SyncEngine,
  SyncPetStateStore,
} from '@smartpet/sync';
import memoryMatchPlugin from '@smartpet/plugin-memory-match';
import skinsPlugin, { CLASSIC_SKIN } from '@smartpet/plugin-skins-classic';
import type { SkinPalette } from '@smartpet/core';
import type { PlatformBridge } from '../bridge/types.js';

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'notice';
  text: string;
  at: number;
  streaming?: boolean;
}

export interface GameInfo {
  id: string;
  title: string;
  description?: string;
  minLevel?: number;
}

/** 对外快照（UI 订阅后整体替换，天然响应式） */
export interface AppSnapshot {
  pet: PetState;
  messages: ChatEntry[];
  games: GameInfo[];
  skins: Array<{ id: string; name: string }>;
  skinId: string;
  settingsText: string;
  busy: boolean;
  ready: boolean;
  modelLabel: string;
}

export interface SkinEntry {
  id: string;
  name: string;
}

let seq = 0;
const nextId = (): string => `m${Date.now().toString(36)}-${seq++}`;

/** 浏览器 mock：根据输入返回脚本化响应（展示真实 agent 循环 + 工具调用） */
function scriptedFor(
  text: string,
): ReturnType<typeof fauxAssistantMessage>[] {
  if (/喂|饿|吃/.test(text)) {
    return [
      fauxAssistantMessage([fauxToolCall('pet_actions', { action: 'feed', item: 'fish' })]),
      fauxAssistantMessage('呼噜呼噜～小鱼干真香！饱食度 +30，我可太满足了 (>ω<)'),
    ];
  }
  if (/算|几|多少/.test(text)) {
    return [
      fauxAssistantMessage([fauxToolCall('calc', { expression: '7*8' })]),
      fauxAssistantMessage('7 × 8 = 56，我数得快吧！(*^▽^*)'),
    ];
  }
  if (/名|叫/.test(text)) return [fauxAssistantMessage('我叫小皮呀 (*^▽^*)')];
  return [
    fauxAssistantMessage(`我在浏览器里也跑着真正的 pi agent 循环呢！你说了：「${text.slice(0, 30)}」`),
  ];
}

/**
 * 应用状态装配层（纯 TS，无 Svelte/Pixi 依赖，可单测）：
 * 桥 → CRDT 状态存储 → 宠物运行时 → 插件注册表 → ai agent → 对外快照
 */
export class AppState {
  readonly bus = new EventBus();
  readonly store = new SyncPetStateStore();
  readonly runtime: PetRuntime;
  readonly registry: PluginRegistry;
  readonly sync: SyncEngine;

  agent?: PetAgent;
  ready = false;
  busy = false;
  settingsText = '';

  private _version = 0;
  private _messages: ChatEntry[] = [];
  private _games: GameInfo[] = [];
  private _skins: SkinEntry[] = [];
  private _tabRequest: 'panel' | 'chat' | 'games' | 'settings' | null = null;
  private skinPalettes = new Map<string, SkinPalette>();
  private gamesByPlugin = new Map<string, string[]>();
  private skinsByPlugin = new Map<string, string[]>();
  private listeners = new Set<() => void>();
  private faux: FauxProviderHandle | undefined;
  private mockMode = false;

  constructor(private readonly bridge: PlatformBridge) {
    this.runtime = new PetRuntime(this.store, this.bus);

    const kvMaps = new Map<string, Map<string, unknown>>();
    this.registry = new PluginRegistry({
      bus: this.bus,
      state: this.store,
      storage: (id) => {
        let map = kvMaps.get(id);
        if (!map) {
          map = new Map();
          kvMaps.set(id, map);
        }
        return {
          get: async <T>(key: string): Promise<T | undefined> => map!.get(key) as T | undefined,
          set: async (key: string, value: unknown) => void map!.set(key, value),
          delete: async (key: string) => void map!.delete(key),
          list: async () => [...map!.keys()],
        };
      },
      sink: {
        onCapability: (pluginId, spec, impl) => {
          if (spec.kind === 'games') {
            const gameImpl = impl as GameCapabilityImpl;
            const ids = gameImpl.games.map((g) => g.id);
            this.gamesByPlugin.set(pluginId, ids);
            this._games = [...this._games, ...gameImpl.games.map((g) => ({ ...g }))];
            this.emit();
          } else if (spec.kind === 'skins') {
            const skinImpl = impl as { skins: SkinDefinition[] };
            this.skinsByPlugin.set(
              pluginId,
              skinImpl.skins.map((s) => s.id),
            );
            for (const skin of skinImpl.skins) this.skinPalettes.set(skin.id, skin.palette);
            this._skins = [...this._skins, ...skinImpl.skins.map((s) => ({ id: s.id, name: s.name }))];
            this.emit();
          }
        },
        onCapabilityRemoved: (pluginId) => {
          const ids = this.gamesByPlugin.get(pluginId);
          if (ids) {
            this.gamesByPlugin.delete(pluginId);
            this._games = this._games.filter((g) => !ids.includes(g.id));
            this.emit();
          }
          const skinIds = this.skinsByPlugin.get(pluginId);
          if (skinIds) {
            this.skinsByPlugin.delete(pluginId);
            for (const id of skinIds) this.skinPalettes.delete(id);
            this._skins = this._skins.filter((s) => !skinIds.includes(s.id));
            this.emit();
          }
        },
      },
    });

    this.sync = new SyncEngine(this.store, [new MemorySyncAdapter()], {
      bus: this.bus,
      debounceMs: 1000,
    });
    this.sync.start();

    // 游戏成绩 → 宠物状态（gameProgress 随 CRDT 多端同步）
    this.bus.on('game:score', ({ game, score }) => {
      const prev = this.store.get().gameProgress[game];
      this.store.reduce({
        type: 'setGameProgress',
        game,
        progress: {
          score,
          completed: (prev?.completed ?? 0) + 1,
          best: Math.max(prev?.best ?? 0, score),
          updatedAt: Date.now(),
        },
      });
      this.emit();
    });
  }

  get version(): number {
    return this._version;
  }

  get pet(): PetState {
    return this.store.get();
  }

  get messages(): ChatEntry[] {
    return this._messages;
  }

  get games(): GameInfo[] {
    return this._games;
  }

  get skins(): SkinEntry[] {
    return this._skins;
  }

  /** 当前皮肤 id（存于 PetState.flags.skin，随 CRDT 多端同步） */
  get skinId(): string {
    const value = this.pet.flags['skin'];
    return typeof value === 'string' && this.skinPalettes.has(value) ? value : CLASSIC_SKIN.id;
  }

  getSkinPalette(skinId?: string): SkinPalette {
    const id = skinId ?? this.skinId;
    return this.skinPalettes.get(id) ?? CLASSIC_SKIN.palette;
  }

  /** 换肤：写入宠物状态（跨端同步） */
  applySkin(skinId: string): void {
    if (!this.skinPalettes.has(skinId)) return;
    this.store.reduce({ type: 'setFlag', key: 'skin', value: skinId });
    this.emit();
  }

  get bridgeKind(): string {
    return this.bridge.kind;
  }

  get platformLabel(): string {
    return this.bridge.platform;
  }

  /** 待消费的导航请求（托盘/系统入口发起） */
  get tabRequest(): 'panel' | 'chat' | 'games' | 'settings' | null {
    return this._tabRequest;
  }

  requestTab(tab: 'panel' | 'chat' | 'games' | 'settings'): void {
    this._tabRequest = tab;
    this.emit();
  }

  consumeTab(): void {
    this._tabRequest = null;
  }

  get modelLabel(): string {
    return this.agent?.modelName ?? '未配置';
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async init(): Promise<void> {
    this.settingsText = await this.bridge.readSettings();
    let settings: ReturnType<typeof parseSettings>;
    try {
      settings = parseSettings(this.settingsText);
    } catch {
      settings = { providers: [], default: undefined };
    }

    this.mockMode = this.bridge.kind === 'mock';
    this.bridge.onTrayAction?.((action) => this.handleTrayAction(action));
    if (this.mockMode) {
      await this.initMockAgent();
    } else {
      await this.initRealAgent(settings);
    }
    await this.registerBuiltinPlugins();
    this.ready = true;
    this.emit();
  }

  // ---- 宠物动作 ----

  feed(food: import('@smartpet/core').FoodItem = FOODS[0]!): void {
    this.runtime.feed(food);
    this.refreshPersona();
    this.emit();
  }

  play(amount = 10): void {
    this.runtime.play(amount);
    this.refreshPersona();
    this.emit();
  }

  rename(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.runtime.rename(trimmed);
    this.refreshPersona();
    this.emit();
  }

  // ---- 对话 ----

  async send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || !this.agent || this.busy) return;
    this.pushEntry({ id: nextId(), role: 'user', text: content, at: Date.now() });
    if (this.mockMode && this.faux) {
      this.faux.setResponses(scriptedFor(content) as never);
    }
    this.busy = true;
    this.emit();
    try {
      await this.agent.prompt(content);
    } catch (err) {
      this.pushEntry({
        id: nextId(),
        role: 'notice',
        text: `（出错了：${err instanceof Error ? err.message : String(err)}）`,
        at: Date.now(),
      });
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async saveSettings(text: string): Promise<void> {
    this.settingsText = text;
    await this.bridge.saveSettings(text);
    this.emit();
  }

  // ---- 内部 ----

  /** 托盘/系统入口动作（桌面端 tray:action） */
  private handleTrayAction(action: string): void {
    switch (action) {
      case 'feed':
        this.feed();
        break;
      case 'play':
        this.play();
        break;
      case 'games':
        this.requestTab('games');
        break;
      case 'chat':
        this.requestTab('chat');
        break;
      case 'settings':
        this.requestTab('settings');
        break;
      default:
        break;
    }
  }

  private async initMockAgent(): Promise<void> {
    const faux = fauxProvider({ models: [{ id: 'faux', name: 'Faux 演示', contextWindow: 4096 }] });
    this.faux = faux;
    const models: MutableModels = createModels();
    models.setProvider(faux.provider);
    const created = createPetAgent({
      models,
      providerId: faux.provider.id,
      modelId: 'faux',
      state: this.store.get(),
      runtime: this.runtime,
      onEvent: (event) => this.handleAgentEvent(event),
    });
    this.agent = created.agent;
  }

  private async initRealAgent(settings: {
    providers: Array<{ id: string; /* 其余字段透传 */ [k: string]: unknown }>;
    default?: { provider: string; model: string };
  }): Promise<void> {
    const models = buildModels({
      providers: settings.providers as never,
      keyResolver: (ref) => this.bridge.resolveKey(ref),
    });
    const def = settings.default;
    if (!def || !models.getModel(def.provider, def.model)) {
      this.pushEntry({
        id: nextId(),
        role: 'notice',
        text: '未配置可用的 AI 模型：请在「设置」里配置 provider 并设置默认模型。',
        at: Date.now(),
      });
      return;
    }
    const created = createPetAgent({
      models,
      providerId: def.provider,
      modelId: def.model,
      state: this.store.get(),
      runtime: this.runtime,
      onEvent: (event) => this.handleAgentEvent(event),
    });
    this.agent = created.agent;
  }

  private handleAgentEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'message_start':
        if (event.message.role === 'assistant') {
          this.pushEntry({ id: nextId(), role: 'assistant', text: '', streaming: true, at: Date.now() });
        }
        break;
      case 'message_end':
        this.finalizeAssistant(event.message as { content: unknown });
        break;
      case 'tool_execution_start':
        this.pushEntry({ id: nextId(), role: 'tool', text: `🔧 使用 ${event.toolName}…`, at: Date.now() });
        break;
      case 'tool_execution_end':
        this.pushEntry({
          id: nextId(),
          role: 'tool',
          text: `${event.isError ? '⚠️' : '✅'} ${event.toolName}`,
          at: Date.now(),
        });
        break;
      default:
        break;
    }
  }

  private finalizeAssistant(message: { content: unknown }): void {
    const blocks = message.content as Array<{ type: string; text?: string }> | undefined;
    const text = (blocks ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
    const last = this._messages[this._messages.length - 1];
    if (last && last.role === 'assistant' && last.streaming) {
      this._messages = [...this._messages.slice(0, -1), { ...last, text, streaming: false }];
    } else {
      this.pushEntry({ id: nextId(), role: 'assistant', text, at: Date.now() });
    }
    this.emit();
  }

  private pushEntry(entry: ChatEntry): void {
    this._messages = [...this._messages, entry];
    this.emit();
  }

  private refreshPersona(): void {
    if (this.agent) this.agent.setSystemPrompt(personalityPrompt(this.store.get()));
  }

  private async registerBuiltinPlugins(): Promise<void> {
    const demo: PluginDefinition = {
      manifest: {
        id: '@smartpet/plugin-inline-demo',
        name: '内置演示',
        version: '0.1.0',
        requires: { pipet: '>=0.1.0' },
        capabilities: [{ kind: 'games' }],
        permissions: [],
      },
      setup: (ctx) => {
        ctx.registerCapability(
          { kind: 'games' },
          {
            games: [
              {
                id: 'guess-number',
                title: '猜数字',
                description: '1-100 里猜一个数字（完整 UI 版随小游戏插件上线）',
                entry: 'guess',
                minLevel: 1,
              },
            ],
          } satisfies GameCapabilityImpl,
        );
      },
    };
    // 官方插件走正式插件体系：记忆翻牌 + 皮肤包
    for (const def of [demo, memoryMatchPlugin, skinsPlugin]) {
      await this.registry.register(def.manifest, async () => def);
      await this.registry.enable(def.manifest.id);
    }
  }

  private emit(): void {
    this._version += 1;
    for (const listener of [...this.listeners]) listener();
  }
}