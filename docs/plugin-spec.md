# 插件规范（Plugin Spec）

SmartPet 的插件体系参考 DSH（DeepSeek Harness）的模块化思路：**一切可扩展点都是 capability**，内置功能即内置插件。本文档定义插件作者需要知道的一切。

## 1. 插件是什么

一个插件是一个 **npm 包**（或一个 JS 模块），导出 `PluginDefinition`：

```ts
// 约定：默认导出
export default {
  manifest: {
    id: '@smartpet/plugin-memory-match',
    name: '记忆翻牌',
    version: '0.1.0',
    requires: { pipet: '>=0.1.0' },
    capabilities: [{ kind: 'games' }],
  },
  setup(ctx) {
    ctx.registerCapability({ kind: 'games' }, {
      games: [{ id: 'memory-match', title: '记忆翻牌', entry: 'memory-match-game', minLevel: 1 }],
    });
    return {
      start() { /* 可选 */ },
      stop() { /* 可选 */ },
    };
  },
} satisfies PluginDefinition;
```

## 2. Manifest 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一 id（npm 风格 `@scope/name`），决定加载/依赖/存储 key |
| `name` | string | 展示名 |
| `version` | semver | 插件版本 |
| `description` / `author` | string? | 元信息 |
| `requires.pipet` | string | host 版本范围（支持 `*` / `>=x.y.z` / 精确），不满足拒绝注册 |
| `requires.plugins` | `Record<id, range>`? | 依赖的其它插件版本范围（拓扑启用，环检测） |
| `capabilities` | CapabilitySpec[] | 声明提供的能力 |
| `permissions` | string[] | 请求的原生权限（宿主授权后可用） |

校验由 `pluginManifestSchema`（zod）在注册时完成。

## 3. 能力（capability）种类与实现形状

| kind | spec 附加字段 | `registerCapability(spec, impl)` 的 impl 形状 |
|---|---|---|
| `games` | — | `GameCapabilityImpl { games: GameDefinition[]; createSession? }` |
| `skins` | `skinId` | `SkinCapabilityImpl { skins: SkinDefinition[] }`（`SkinDefinition = { id, name, palette: SkinPalette }`，调色板类型在 `@smartpet/core`） |
| `tools` | `toolNames` | `Record<name, ToolImpl>`（`ToolImpl = { description, parameters(JSON Schema), handler }`，合入 AI 工具注册表） |
| `providers` | `providerId` | `ProviderPreset`（配置好 baseURL/auth 的 provider preset，供设置页一键添加） |
| `sync-adapters` | `adapterId` | `SyncAdapter`（`push/pull/watch`） |
| `widgets` | `widgetId`, `mount` | `WidgetImpl`（Svelte 组件 + 挂载点 `settings/panel/tray`） |
| `hooks` | `hookNames` | `Record<hookName, (payload) => void>`（`onTick/onFed/onPlayed/onLevelUp/onMoodChange/onGameScore` 等） |
| `schemas` | `flagKey` | `FlagSchemaDef`（声明对 `PetState.flags.<flagKey>` 的读写结构） |

## 4. 生命周期与状态机

```
pending ─注册→ pending ─enable→ enabled ─start→ started ─stop→ enabled
   │             │                          │
   └─ load ─→ loaded ──enable──►            └─disable─→ disabled ─unload→ (移除)
```

- `load`：宿主 `import` 插件模块，校验 `manifest.id` 与 setup 存在
- `enable`：先启用依赖（拓扑、环检测），再构造 `PluginHostApi`，执行 `setup(ctx)` 拿到生命周期钩子；scope 内的任何失败 → 插件标记 `error`（不影响其它插件）
- `start/stop`：可选生命周期钩子（如游戏插件连接后台任务）
- `disable`：调用 `stop()`，并向 sink 注销全部能力（`onCapabilityRemoved`）
- `unload`：禁用 + 丢弃定义/加载器

## 5. 宿主句柄（PluginHostApi）

| 成员 | 说明 |
|---|---|
| `manifest` | 本插件声明 |
| `bus` | 全局类型安全事件总线（`PetEventMap`，可 `declare module` 扩展） |
| `state` | 宠物状态只读视图 + 订阅 |
| `storage` | 插件私有 KV（按插件 id 隔离；桌面端落盘 `~/.smartpet/plugins/<id>/`） |
| `grantedPermissions` | 已授权权限集合 |
| `registerCapability(spec, impl)` | 注册能力（重复注册抛错） |
| `unregisterCapability(spec)` | 注销能力 |

插件之间**只用事件通信**，不互相 import（避免耦合与循环依赖）。

## 6. 权限模型

- manifest 声明 `permissions`；宿主可提供 `PermissionPolicy` 覆盖（默认全授 manifest 声明项）
- 危险能力（shell、任意 fs 等工具）依赖用户显式批准，未获批的工具不进入 AI 工具注册表
- Android 端自动降级：工具带 `environments: ['desktop']` 的默认不注册

## 7. 装载方式（路线图）

1. **内置插件**：仓库 `plugins/` 下，随应用打包，自动注册
2. **本地开发插件**：`~/.smartpet/plugins/<id>/`（文件或目录），宿主扫描 manifest 装载
3. **远程安装**（M4）：插件市场，下载 → 校验 hash/签名 → 权限确认 → 安装（同 npm 包结构）

## 8. 编写插件的最小清单

- 一个 `package.json`（`name` = manifest.id）
- 默认导出 `PluginDefinition`
- manifest 声明 capabilities 与 permissions
- 用 `PluginDefinition` 类型做 `satisfies` 检查（类型即文档）
- 单元测试：用 `@smartpet/core` 的 `PluginRegistry` + 内存 KV 直接测 `setup`