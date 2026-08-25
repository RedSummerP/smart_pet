# smart-pet — 架构文档

> 全平台桌面宠物 · 基于 [pi (earendil-works/pi)](https://github.com/earendil-works/pi) Agent Harness · DSH 式插件体系
>
> **Mode:** Architect（本文档）+ Planner（里程碑拆分）

## 1. 目标与约束

### 产品目标

- **跨平台**：Windows / Linux / macOS / Android 四端一致的桌面宠物体验
- **AI 驱动**：宠物接入 LLM Agent，能对话、能调工具（查时间、记事、计算、控制宠物动作等），基于 pi 的 `pi-ai` + `pi-agent-core`
- **多端同步**：宠物状态（等级/心情/饱食度/解锁项/游戏进度）本地优先 + 可插拔同步后端
- **益智小游戏**：内置小游戏（记忆翻牌、数独等），以插件形式装载
- **万物可插件**：沿用 DSH 的模块化思路 —— 游戏、皮肤、AI 工具、AI 提供商、同步后端、UI 面板全部是插件
- **多 AI 提供商**：复用 pi-ai 现成的 40+ 内置厂商，并支持自定义 OpenAI 兼容端点

### 硬约束（决定技术路线的事实）

| 事实 | 推论 |
|---|---|
| pi (`pi-ai` / `pi-agent-core`) 是 **TypeScript/Node** 生态 | AI 运行时以纯 JS 形态跑在 WebView 里（无 Node 进程） |
| 目标平台含 **Android** | Android 不能原生跑 Node 进程 → 所有 AI 逻辑必须是"浏览器可运行"的 JS；原生能力强能力走宿主桥接 |
| 桌面宠物需要**透明、置顶、无边框**窗口 | 应用壳必须支持 frameless+transparent+always-on-top |
| 三端桌面 + 移动端一套代码 | 应用壳选 Tauri 2（官方支持 Win/Linux/macOS/Android/iOS），UI 全在 Web |
| 状态同步要离线可用、冲突可合并 | 本地优先 + CRDT（Automerge） |
| API key 敏感 | key 只进平台安全存储（OS keyring / Android Keystore），不进配置、不进日志 |

### 既定决策（用户已确认）

1. AI 核心 = [earendil-works/pi](https://github.com/earendil-works/pi)（`@earendil-works/pi-ai` + `@earendil-works/pi-agent-core`）
2. 应用壳 = **Tauri 2**（Rust 内核 + Web UI）
3. 同步 = **本地优先 + 可插拔同步后端**，MVP 用 Supabase adapter，可换自托管
4. MVP 优先级 = **壳 + AI 对话 + 插件骨架**，再叠小游戏与同步
5. UI 技术 = TypeScript + **Svelte 5** + **PixiJS 8**（渲染层），Vite 构建

## 2. 总体架构

```
┌───────────────────────────── 应用进程 ─────────────────────────────┐
│                                                                     │
│  ┌──────────────┐   ┌─────────────────┐   ┌──────────────────────┐  │
│  │  WebView UI  │   │  @smartpet/core    │   │  @smartpet/ai           │  │
│  │  (Svelte+Pixi)│──▶│  宠物领域模型    │──▶│  pi-ai Models        │  │
│  │  对话/设置/游戏│   │  插件注册表      │   │  pi-agent PetAgent   │  │
│  └──────┬───────┘   │  事件总线        │   │  工具注册            │  │
│         │           └──────┬──────────┘   └──────────┬───────────┘  │
│         │                  │                         │              │
│  ┌──────▼───────┐   ┌──────▼──────────┐   ┌──────────▼───────────┐  │
│  │ Tauri bridge │   │  @smartpet/sync    │   │ 安全存储 & 原生能力    │  │
│  │ invoke/RPC   │   │ Automerge+adapter│   │ keyring / Keystore   │  │
│  └──────┬───────┘   └─────────────────┘   └──────────────────────┘  │
└─────────┼────────────────────────────────────────────────────────────┘
          │ tauri-ipc (invoke / events)
┌─────────▼────────────────────────────────────────────────────────────┐
│ Rust 宿主 (apps/desktop/src-tauri)                                    │
│  · 窗口：frameless + transparent + always-on-top + skip-taskbar       │
│  · 托盘 + 右键菜单                                                    │
│  · 原生命令：fs(沙箱目录) / clipboard / 截图 / 通知                    │
│  · Android：悬浮窗插件（WindowManager overlay + WebView）              │
└───────────────────────────────────────────────────────────────────────┘
```

### 分层原则

- **依赖方向**：`ui → core/ai/sync → (pi 库)`；`core` 不依赖任何 UI/平台包（纯 TS，可单测）
- **core 是领域核心**（DDD 术语）：宠物状态、动作、插件契约都在这里，平台无关
- **ai 包是 pi 与应用的适配层**：pi 升级不渗透到 UI；插件工具在此注册
- **一切可插拔项都走 capability**（见 §5），内置功能即内置插件

## 3. 目录结构（monorepo）

```
smart-pet/
├── package.json · pnpm-workspace.yaml · tsconfig.base.json · .gitignore
├── docs/                    # architecture / plugin-spec / sync-protocol / provider-config
├── packages/
│   ├── core/                # @smartpet/core —— 宠物领域模型 + 插件系统 + 事件总线（纯 TS）
│   ├── ai/                  # @smartpet/ai   —— pi 集成：provider 配置、PetAgent、工具注册
│   ├── sync/                # @smartpet/sync —— 本地优先状态 + Automerge + SyncAdapter
│   └── ui/                  # @smartpet/ui   —— Svelte + PixiJS 渲染与视图
├── apps/
│   └── desktop/             # Tauri 2 应用（含 android/ 工程目录）
├── plugins/                 # 官方插件（独立包，均可单独发布）
│   ├── games/memory-match/
│   ├── games/sudoku/
│   └── skins/smartpet-classic/
└── .github/workflows/       # 三平台 desktop + android 构建矩阵
```

## 4. 核心领域模型（@smartpet/core）

### 4.1 宠物状态（可同步、可合并）

```ts
interface PetState {
  meta: { id: string; name: string; createdAt: number; schemaVersion: 1 };
  stats: PetStats;          // 见下
  mood: { emotion: Emotion; since: number };
  unlocks: string[];        // 解锁的皮肤/游戏/成就
  gameProgress: Record<string, GameProgress>;  // 每款游戏进度（key=游戏插件 id）
  flags: Record<string, JsonValue>;            // 插件自由扩展区（受 schema 约束）
}
```

`PetStats`（随时间衰减、随动作增长的属性）作为 **Automerge 计数器**处理，多端喂食不丢失：

```ts
interface PetStats {
  satiety: number;   // 饱食 0..100，随时间下降
  energy: number;    // 精力 0..100
  happiness: number; // 心情 0..100
  exp: number;       // 经验（升级依据）
  level: number;     // 等级
}
```

- 状态变化一律走**纯函数 reducer**：`petReducer(state, action) → state'`
- reducer 产生的变更同时写入本地 Automerge 文档 → 同步（§6）
- 宠物每秒 tick（饿/困/无聊衰减）由宿主驱动，多端各自执行但**只有该端在线期间产生增量**，离线端上线后合并（CRDT 保证不丢）

### 4.2 动作与事件（动作 = 命令，事件 = 通知）

```ts
type PetAction =
  | { type: 'feed'; item: FoodItem }
  | { type: 'play'; with: string }
  | { type: 'talk'; text: string }      // 触发 AI 对话
  | { type: 'startGame'; game: string }
  | { type: 'custom'; plugin: string; action: string; payload?: JsonValue };

interface PetEventMap { /* 类型安全事件总线（§5.3） */ }
```

## 5. 插件体系（DSH 式模块化）

灵感来自 DSH 的"万物可扩展"：**内置功能 = 内置插件**，扩展点就是插件能力（capability）。

### 5.1 插件清单（manifest）

```ts
interface PluginManifest {
  id: string;               // '@smartpet/plugin-memory-match'
  name: string;
  version: string;          // semver
  description?: string;
  author?: string;
  requires: {
    smart-pet: string;          // 兼容的 smart-pet 版本范围，如 '>=0.1.0'
    plugins?: Record<string, string>;  // 依赖的其他插件版本范围
  };
  capabilities: CapabilitySpec[];      // 声明提供的能力
  permissions?: string[];   // 请求的原生权限（见 §5.5）
}
```

### 5.2 能力（capability）类型

| capability | 提供什么 | 示例 |
|---|---|---|
| `games` | 小游戏（manifest + 入口组件 + 进度读写） | 记忆翻牌、数独 |
| `skins` | 宠物外观（精灵图集 + 动画定义 + 配饰） | smartpet-classic、二次元猫 |
| `tools` | Agent 工具（name/description/参数 schema/handler） | 时钟、记事、计算器 |
| `providers` | AI 提供商配置扩展 | 自定义网关 preset |
| `sync-adapters` | 同步后端实现 | supabase、自托管 http |
| `widgets` | UI 面板（设置页/侧边栏/托盘菜单项） | 天气面板 |
| `hooks` | 宠物行为钩子（onTick/onFed/onPlayed/onLevelUp…） | 成就系统 |
| `schemas` | 自定义 `PetState.flags` 子 schema（鉴权读写） | 游戏存档 |

### 5.3 类型安全事件总线

插件之间**不互相 import**，只通过事件通信（解耦，避免循环依赖）：

```ts
interface PluginEvents {
  'pet:fed':      { item: FoodItem; satiety: number };
  'pet:level-up': { from: number; to: number };
  'game:score':   { game: string; score: number };
  'sync:changed': { rev: string };
  'tool:called':  { name: string; ok: boolean; ms: number };
  // 插件可扩展：declare module '@smartpet/core' { interface PluginEvents { 'my:event': X } }
}
```

### 5.4 生命周期

```
resolve(依赖) → load(import manifest) → authorize(permissions) → enable(注册 capability)
→ start(拿到宿主 API) ⇄ stop → disable → unload
```

- 每个插件拿到一个**宿主句柄 `PluginHostApi`**：`bus`、`state`（受限读）、`registerCapability`、`storage`（插件私有 KV）
- 中止/失败回滚：任何阶段抛错 → 插件被标记 disabled 并记录原因，不影响宿主

### 5.5 权限模型

- 插件的原生能力强能力需在 manifest `permissions` 声明，宿主（Rust）按清单授权
- 危险工具（shell、任意 fs）默认拒绝；用户可在设置里逐插件批准
- **AI 工具与插件工具是同一注册表**（§7.3），因此插件想要"让宠物用计算器"就注册一个 `tools` capability

## 6. 同步协议（@smartpet/sync，本地优先）

```
[端 A] petReducer → Automerge doc 本地提交 ─┐
                                           ├─→ SyncAdapter（可插拔）──→ 远端
[端 B] 同一 doc 本地提交 ────────────────────┘        ▲
                                   pull/merge ◄───────┘
```

- **单一真相**：整个 `PetState` 是一个 Automerge 文档；stat 用计数器 merge，flags 按 map 合并
- **SyncAdapter 接口**：`push(doc)` / `pull() → doc | null` / `watch(cb)`；内置 memory（测试）、supabase（MVP，存 doc bytes 到一行，Realtime 订阅变更）；未来 `http`（自托管）
- **冲突**：CRDT 天然合并；无法自动合并的（如改名）按 `last-writer-wins`（Automerge 默认），事件总线广播 `sync:changed`
- **隐私**：同步内容仅 PetState；对话记录默认本地（可选加密上云，后置）

## 7. AI 集成（@smartpet/ai，基于 pi）

### 7.1 Provider 配置（兼容 DSH `llm-pi-ai` 风格）

```yaml
# ~/.smartpet/settings.yaml —— 与 ~/.dsh/settings.yaml 的 provider 块同构
llm-pi-ai:
  providers:
    deepseek-official:
      displayName: DeepSeek 官方
      apiKeyEnv: DEEPSEEK_API_KEY        # 或 keyring 别名 apiKeyRef: keyring://smart-pet/deepseek
      api: openai-completions
      baseURL: https://api.deepseek.com
      models:
        - id: deepseek-chat
          name: DeepSeek Chat
          contextWindow: 131072
          input: [text]
    sensenova-gateway:                    # 自定义 OpenAI 兼容网关
      api: openai-completions
      baseURL: https://token.sensenova.cn/v1
      apiKeyEnv: SENSENOVA_API_KEY
  default:
    provider: deepseek-official
    model: deepseek-chat
```

- 载体：`~/.smartpet/settings.yaml`（默认）+ 环境变量；key 不存文件本体，只在运行时从 keyring/环境变量解析（复用 dsh-api-probe 的凭据安全经验）
- 构建期：`buildModels()` = `createModels()` + `builtinProviders()` + 自定义 provider（`createProvider({api: openai-completions, baseUrl, auth: envApiKeyAuth(...), models})`）
- 未来：**provider 插件**可注册任意 preset

### 7.2 PetAgent（pi-agent-core 封装）

```ts
const agent = new PetAgent({
  models,                 // pi-ai Models
  modelId,                // 默认模型
  systemPrompt: personalityPrompt(petState),  // 宠物人格 + 当前状态注入
  tools,                  // 内置工具 + 插件工具（同一注册表）
  onStream: (event) => bus.emit('ai:token', ...),
});
```

- 人格提示词把宠物当前状态（名字、心情、等级、此时时间段）注入系统提示；饭后/玩耍后动作会更新上下文，形成"有记忆"的宠物
- 基于 pi 的 `Agent` 类 / agent-loop；`Models.streamSimple` 即其 StreamFn（pi 官方约定，见 pi-agent-core `types.ts StreamFn`）
- 流式输出 → 对话气泡 + 说话动画；`toolcall_end` 事件 → UI 显示"宠物正在用 XX 工具…"

### 7.3 工具注册表

- 统一注册：`registerTool({ name, description, parameters, handler, environments? })`
- 内置工具（`@smartpet/ai/tools/builtin`）：
  - `now` 当前时间（宠物报时）
  - `calc` 计算器（沙箱表达式求值）
  - `note` 记事（写插件私有 KV / 宠物"日记"）
  - `pet_actions` —— 让 AI 直接驱动宠物：喂食/玩耍/换肤/开游戏（经 core reducer），**AI ↔ 游戏 ↔ 状态闭环**
  - `search`（可选，走 provider 网关或 Ollama 本地，默认关闭）
- 插件 `tools` capability 追加工具；**pi 的 Tool schema（typebox TSchema）** 即参数校验标准

### 7.4 多端一致

- WebView 内直接跑 JS 版 pi（vite 打包进 bundle）；不引入 Node 专用 API
- 需要原生能力的工具（截图/文件）注册为"需要宿主"工具：Rust 侧命令经 Tauri invoke 暴露，JS 侧 handler `await invoke(...)`
- Android 上无 Node/无普通 fs —— 工具白名单自动降级（`environments: ['desktop']` / `['mobile']`）

## 8. UI / 渲染（@smartpet/ui）

### 8.1 宠物窗口（桌面）

- Tauri 窗口属性：`decorations: false, transparent: true, alwaysOnTop: true, skipTaskbar: true`
- PixiJS 渲染宠物精灵 + 动画状态机（idle/walk/sleep/eat/play/think/levelup），支持 skin 插件换装
- 拖拽移动；点击 → 对话气泡；右键/托盘 → 菜单（喂食、玩耍、小游戏、设置、退出）
- 聊天展开为独立面板窗口（或内嵌气泡展开）

### 8.2 视图

- `ChatView`：对话流 + 流式渲染 + 工具调用提示
- `PetPanel`：状态仪表（饱食/精力/心情/等级进度条）+ 快捷动作
- `GamesView`：游戏列表（来自 `games` capability），启动即载入插件入口组件
- `SettingsView`：provider 管理（增删改、keyring 写入、默认模型）、人格设置、插件管理（启用/禁用/权限）、同步状态
- `PluginView`：已装插件列表 + 权限开关

### 8.3 Android

- 悬浮窗：原生插件（WindowManager overlay + WebView 加载同一 UI）；点击展开全屏 Activity
- 桌面缺省的托盘/右键由悬浮窗菜单替代

## 9. 安全模型

| 面 | 措施 |
|---|---|
| API key | 只进 OS keyring / Android Keystore；配置里只存引用（env 名 或 keyring 别名）；日志脱敏（复用 dsh-api-probe 的 mask 思路） |
| 配置 | `settings.yaml` 可含 provider 定义但不含明文 key |
| 插件 | manifest 权限声明 + 运行期授权；危险能力默认拒绝；插件 KV 隔离 |
| AI 工具 | 每个工具独立授权；shell/fs 级工具默认禁用，需用户显式批准；工具结果进 LLM 前可截断 |
| 传输 | 同步走 HTTPS；Supabase RLS 按用户隔离 |
| 输入 | 所有 LLM 输出按文本渲染（不执行 HTML）；插件组件在宿主作用域运行并由 manifest 约束 |

## 10. 里程碑

| 里程碑 | 内容 | 验收 |
|---|---|---|
| **M1（当前）** | monorepo 骨架；core（状态 reducer + 事件总线 + 插件注册表）；ai（provider 配置 + PetAgent + 内置工具）；ui（Pixi 渲染 + 聊天 + 设置）；Tauri Linux 壳；示例插件（记忆翻牌、经典皮肤） | Linux 上宠物能跑、能聊天、能喂食、能开游戏 |
| **M2** | 同步：Automerge 本地 + Supabase adapter + 合并测试；多端状态一致 | 两台设备喂食互不丢失 |
| **M3** | Android：悬浮窗插件 + 全屏 UI + 构建流水线（GitHub Actions 出 APK） | Android 跑起来并同步 |
| **M4** | 插件分发：远程安装/更新、插件市场骨架、更多游戏（数独/2048）与皮肤 | 装插件像装 App |
| **M5** | 打磨：Windows/macOS 特有问题（Wayland 透明、Dock 图标、开机自启）、性能、多语言 | 三平台发版 |

> 构建事实：本机为 aarch64 Orange Pi（Linux），桌面目标在本机跑 Linux 版做开发验证；Windows/macOS/Android 由 GitHub Actions `tauri-action` 矩阵产出（M3 起）。

## 11. 关键风险与对策

| 风险 | 对策 |
|---|---|
| pi 包在 WebView 环境的兼容性（依赖 Node 内建？） | 早期就做"纯浏览器 bundle"冒烟测试；pi 核心是 fetch/EventStream，风险中低；必要时把 pi-ai 跑在 Web Worker |
| Tauri 透明窗口在 Wayland/X11 差异 | 提供 fallback（不透明底 + 圆角描边）；记录 per-平台配置 |
| Android 悬浮窗权限（SYSTEM_ALERT_WINDOW） | 首次引导授权流程；无权限时降级为桌面图标模式 |
| pi 版本迭代快（0.84.x 仍在快速演进） | ai 包作为唯一适配层，锁版本 + 升级只动适配层 |
| Automerge 体积 | 只同步 PetState 主文档（小）；对话/游戏重数据留在插件私有存储 |