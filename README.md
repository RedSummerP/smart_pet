# SmartPet — 全平台 AI 桌面宠物

基于 [pi (earendil-works/pi)](https://github.com/earendil-works/pi) Agent Harness 构建的全平台桌面宠物：
**Windows / Linux / macOS / Android** · 宠物状态**多端同步** · 内置**益智小游戏** · 接入**任意 AI API key** · **Agent 工具调用** · **DSH 式插件体系（万物可插件）**。

## ✨ 特性

| 维度 | 说明 |
|---|---|
| 🖥️ 全平台 | Tauri 2 宿主：无边框透明置顶悬浮窗（桌面）+ Android 悬浮/全屏；同一套 Web UI（Svelte 5 + PixiJS 8） |
| 🤖 AI 驱动 | pi-ai 统一多厂商 API（40+ 内置厂商 + 自定义 OpenAI 兼容端点/Ollama/vLLM…）；宠物人格注入 + pi-agent-core 工具调用闭环（`now`/`calc`/`note`/`pet_actions`…） |
| 🔄 多端同步 | 本地优先：Automerge CRDT（计数器/差分合并/基因采纳），可插拔同步后端（memory / **Supabase**），状态落盘重启不丢 |
| 🎮 小游戏 | 记忆翻牌、2048……以插件装载，成绩写入宠物状态跨端同步 |
| 🧩 万物可插件 | games / skins / tools / providers / sync-adapters / hooks / schemas 七类能力 + 插件市场（远程目录、下载、sha256 校验、白名单装载） |
| 🔐 安全 | API key 只存引用（环境变量/钥匙串），明文不入配置不入日志；插件权限声明 + 白名单；钩子/监听器异常隔离 |

## 📦 仓库结构

| 包 | 说明 |
|---|---|
| `packages/core` | 宠物领域模型 + 类型安全事件总线 + **插件系统**（manifest/依赖/生命周期/能力 sink/隔离 KV）+ 游戏/皮肤契约 |
| `packages/ai` | pi 集成：provider 配置（兼容 DSH `llm-pi-ai`）、Models 构建、PetAgent（人格+工具）、工具注册表与内置工具 |
| `packages/sync` | Automerge CRDT 本地优先存储（genesis 采纳 + 变更差分）、SyncEngine（先拉后推/并发排队）、适配器（memory/Supabase/远程契约） |
| `packages/ui` | Svelte 5 + PixiJS 8 界面：程序化像素猫渲染、动画状态机、聊天/状态/小游戏/设置、bridge（Tauri ↔ 浏览器 mock）、本地持久化、主循环 tick |
| `packages/plugins` | 插件市场骨架：目录发现（@scope 嵌套）、安装/卸载、NodePluginLoader、**远程市场**（tarball + sha256）、信任白名单 |
| `apps/desktop` | Tauri 2 壳：透明置顶窗口、托盘（喂食/玩耍/导航）、原生命令（settings/宠物文档/keyring 通道） |
| `plugins/games/…` | 记忆翻牌、2048（games capability） |
| `plugins/skins/classic` | 4 套皮肤（skins capability） |
| `plugins/tools/fun` | 娱乐工具包（tools capability，AI 可调用） |
| `plugins/behaviors/achievements` | 成就系统（hooks capability） |

## 🚀 快速开始

```bash
pnpm install
pnpm dev        # Web UI 浏览器直接跑（mock bridge + faux agent 全链路演示；试试说「喂我」或「算」）
pnpm test       # 全仓单元测试（10 包，100+ 用例）
scripts/ci-local.sh   # 本地 CI 预检（安装/构建/测试全管道）
```

> 浏览器演示模式无需任何 key：宠物使用 pi 官方 faux provider 跑**真实 agent 循环**（含工具调用闭环）。

## 🧩 插件体系（DSH 式）

插件 = 一个 npm 包，默认导出 `PluginDefinition`（manifest + setup）。宿主按 capability 消费：

```
games 记忆翻牌/2048    skins 4 套皮肤     tools 娱乐工具（AI 可调）
providers provider 预设  sync-adapters 同步后端  hooks 成就/行为钩子
```

规范见 [docs/plugin-spec.md](docs/plugin-spec.md)。安装：本地目录/远程市场（目录 JSON + tarball + sha256），装载走信任白名单。

## 🌐 AI 与同步配置

`settings.yaml`（`~/.smartpet/`，与 DSH `llm-pi-ai` 块同构）：

```yaml
llm-pi-ai:
  providers:
    deepseek-official:  # 任意 OpenAI 兼容端点 / 内置厂商
      apiKeyEnv: DEEPSEEK_API_KEY     # key 只存引用
      models: [{ id: deepseek-chat, contextWindow: 131072, input: [text] }]
  default: { provider: deepseek-official, model: deepseek-chat }
# sync:
#   adapter: supabase
#   supabase: { url: https://xxx.supabase.co, anonKey: eyJ..., table: pet_state }
```

建表 SQL 与同步协议见 [docs/sync-protocol.md](docs/sync-protocol.md)；密钥通道见 [docs/provider-config.md](docs/provider-config.md)。

## 🛠️ 桌面构建与 CI

本机（Orange Pi）缺 webkit2gtk-4.1 且根分区只读，窗口构建走 CI / 具备系统依赖的机器：

```bash
# 桌面（Ubuntu 22.04+）
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
pnpm --filter smartpet-desktop tauri icon apps/desktop/src-tauri/icons/icon.png
pnpm --filter smartpet-desktop tauri build
# Android（JDK 17 + Android SDK）
pnpm --filter smartpet-desktop tauri android init --ci
pnpm --filter smartpet-desktop tauri android build apk
```

`apps/desktop/src-tauri` 结构：透明置顶窗口（360×620）、托盘菜单、5 个原生命令（settings 读写 / 宠物文档持久化 / key 解析 / platform / notify）。

`.github/workflows/build.yml`：Linux / macOS / Windows 桌面 + Android APK 四作业矩阵（push main 或手动触发）。

## 🔬 真实 provider 冒烟（需自有 key）

```bash
DEEPSEEK_API_KEY=sk-xxx SMART_PET_SMOKE=1 pnpm --filter @smartpet/ai test
# 跑完会在终端打印脱敏摘要；冒烟测试绝不读取/打印密钥文件
```

## 📚 文档

- [docs/architecture.md](docs/architecture.md) — 总体架构与里程碑
- [docs/plugin-spec.md](docs/plugin-spec.md) — 插件规范
- [docs/sync-protocol.md](docs/sync-protocol.md) — 同步协议（建表 SQL）
- [docs/provider-config.md](docs/provider-config.md) — AI provider 配置与密钥安全

## ✅ 里程碑状态

| 里程碑 | 状态 |
|---|---|
| M1 壳 + AI 对话 + 插件骨架 + 小游戏 + Tauri/CI | ✅ 完成（10 包，107+ 测试全绿） |
| M2 多端同步（Supabase 适配器 + 本地持久化 + 竞态修复） | ✅ 完成（实盘需建 Supabase 项目） |
| M3 Android/皮肤/托盘/续程 | ✅ 完成（Android 构建走 CI） |
| M4 插件市场（本地目录 + **远程安装**） | ✅ 完成 |
| 真机验证（CI 实跑 / 真实 provider / Supabase 在线） | 🕐 需配合（git remote / key / supabase 项目） |