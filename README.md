# SmartPet — 全平台 AI 桌面宠物

基于 [pi (earendil-works/pi)](https://github.com/earendil-works/pi) Agent Harness 构建的全平台桌面宠物：

- **全平台**：Windows / Linux / macOS / Android（Tauri 2）
- **AI 驱动**：接入任意 AI API key（pi-ai 统一多厂商 API，40+ 内置提供商 + 自定义 OpenAI 兼容端点），宠物基于 pi-agent-core 完成对话与工具调用
- **多端同步**：宠物状态本地优先（CRDT），可插拔同步后端（MVP：Supabase）
- **益智小游戏**：记忆翻牌 / 数独……以插件形式装载
- **万物可插件**：DSH 式插件体系 —— 小游戏、皮肤、AI 工具、AI 提供商、同步后端、UI 面板全部是插件

> 设计文档：[docs/architecture.md](docs/architecture.md) · 插件规范：[docs/plugin-spec.md](docs/plugin-spec.md) · 同步协议：[docs/sync-protocol.md](docs/sync-protocol.md)

## 仓库结构

| 包 | 说明 |
|---|---|
| `packages/core` （`@smartpet/core`） | 宠物领域模型（状态/动作/情绪）+ 插件系统 + 类型安全事件总线（纯 TS，平台无关） |
| `packages/ai` （`@smartpet/ai`） | pi 集成层：provider 配置（兼容 DSH `llm-pi-ai` 风格）、PetAgent、工具注册表 |
| `packages/sync` （`@smartpet/sync`） | 本地优先状态存储（Automerge）+ SyncAdapter 接口 + 内置适配器 |
| `packages/ui` （`@smartpet/ui`） | Svelte 5 + PixiJS 8 渲染与视图 |
| `apps/desktop` | Tauri 2 宿主（Win/Linux/macOS + Android 工程） |
| `plugins/` | 官方插件（小游戏 / 皮肤 / 工具） |

## 开发

```bash
pnpm install
pnpm test          # 逻辑包单元测试（vitest）
pnpm typecheck     # 全量类型检查
pnpm dev           # Web UI 开发服务器（浏览器 + mock bridge）
```

> 本机（Orange Pi）根分区只读且缺 webkit2gtk-4.1，无法编译 Tauri 窗口版；逻辑包与 Web UI 在本机验证，窗口构建由 CI / 具备系统依赖的机器执行。
> 本机工具链 writable 目录：`.tools/`（pnpm store、npm cache、rustup/cargo）。