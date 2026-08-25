# 同步协议（Sync Protocol）

SmartPet 采用**本地优先（local-first）**同步：宠物状态先写本地，离线可用，联网后与其它端合并。

## 1. 数据模型

**整个 `PetState` 就是一个 Automerge 文档**（`@smartpet/sync` 负责映射）：

```ts
doc = {
  meta: { id: string, name: string, createdAt: number, schemaVersion: 1 },
  stats: { satiety: Counter, energy: Counter, happiness: Counter, exp: Counter, level: Counter },
  mood: { emotion: string, since: number },
  unlocks: string[],            // 数组 append-only（merge 合并去重）
  gameProgress: { [gameId]: GameProgress },  // map（按 gameId merge）
  flags: { [key]: JsonValue },  // map
}
```

- **计数器**：`satiety/energy/happiness/exp/level` 用 Automerge Counter —— 两台设备各喂一条鱼，最终值 = 双方增量之和，**不丢喂食**。
  - **封顶语义**：饱食/精力/心情 0..100 是有上限的游戏属性，计数器记录"有效增益"（封顶后不再增长）；exp/level 无上限、无损合并。
  - **整数计数器 + 进位寄存器**：Automerge 计数器为整数，tick 衰减等小数增量进文档内 `carried` 寄存器累计，达到 ±1 进位/借位到计数器；快照读数 = 计数器 + carried。
- **map/数组**：Automerge 默认合并；重名冲突按 last-writer-wins；unlocks 为 append-only（并发解锁都保留）。
- 每次应用 `PetAction` 后的状态变更 → 差量合入文档 → 本地落盘 + 标记待同步。

## 2. 变更流程

```
UI/插件 ──PetAction──► PetRuntime.dispatch
                           │  petReducer（纯函数）
                           ▼
                    新 PetState ──► 差量合入 Automerge doc（计数器 increment / map set）
                                        │
                     ┌──────────────────┼──────────────────┐
                     ▼                  ▼                  ▼
              本地快照（JSON）    变更差分（changes）    SyncAdapter.push(二进制)
              ~/.smartpet/state/     快照保存                  （在线的端）
```

- **同步粒度**：传输用二进制快照，合并用**变更差分**（`getChanges(本地, 远端)` + `applyChanges`）——**绝不整库 `Automerge.merge`**（会重复计入双方 genesis 的初始值）。
- **genesis 采纳**：宠物由一台设备创建，其文档即 genesis；新设备首次收到远端且本地未做任何变更（pristine）→ 整体采纳远端为基底。
- **同步顺序（先拉后推）**：`syncNow()` 先 `pullAll` 再 `pushAll`——新设备先拉取采纳远端为基底，再推本地增量；若颠倒，新设备会把自己的 genesis 合并进远程，造成计数器翻倍。
- **远端合并安全网**：`RemoteSyncAdapter.push` 时与存量做差分合并（远程行是 CRDT 合并目标），并发双写（如两台设备同时喂食）不互相覆盖。
- **并发调用排队**：`syncNow()` 进行中再调用不会静默丢弃，排队重跑一轮。
- **本地持久化**：宠物文档经 bridge 落盘（桌面端 `~/.smartpet/pet.bin.b64`、浏览器 localStorage），进程重启后恢复；与远程同步正交（本地优先）。
- 断线：变更进 Automerge 历史，重连后随下次 pull/push 携带。
- 上线：`adapter.pull()` → 差分应用 → 广播 `sync:changed { rev, state }` → 合并产物回推。

## 3. SyncAdapter 接口（可插拔）

```ts
interface SyncAdapter {
  readonly id: string;
  /** 推送本地文档变更 */
  push(doc: Uint8Array | { bytes: Uint8Array; rev: string }): Promise<void>;
  /** 拉取远端文档；无则返回 null */
  pull(): Promise<Uint8Array | null>;
  /** 订阅远端变更（Supabase Realtime / WebSocket），返回取消函数 */
  watch(onChange: () => void): () => void;
  dispose(): Promise<void>;
}
```

内置适配器：

| adapter | 说明 |
|---|---|
| `memory` | 测试/调试 |
| `supabase` | **已实现**（`@smartpet/sync` 的 `createSupabaseSyncBackend`，鸭子类型接入 supabase-js，应用层注入客户端）：`pet_state` 表一行一宠物（`pet_id` 主键 / `rev` / `binary` base64 / `updated_at`），Realtime 订阅远端变更；RLS 按用户隔离 |
| `http`（规划） | 自托管极简 Node/Go 服务，版本化 JSON 存储（M2 后） |

`pet_state` 建表 SQL：

```sql
create table if not exists public.pet_state (
  pet_id     text primary key,
  rev        text not null,
  binary     text not null,
  updated_at timestamptz not null default now()
);
alter table public.pet_state enable row level security;
```

## 4. 冲突策略

- 同字段并发写：Automerge 规则（计数器相加、map last-writer-wins、数组 append）
- 业务级冲突（如两端同时改名）：last-writer-wins + `pet:rename` 事件让 UI 提示
- 升级迁移：`schemaVersion` 变化 → 迁移函数注册表（`migrations: {1: (doc) => doc}`），升级前备份
- 边界：两台设备各自"从零创建"同一宠物（离线双新装）不受支持——由 genesis 采纳规则决定以先到达者为准（文档化限制）

## 5. 隐私与安全

- 同步内容**仅 PetState**；对话记录/插件重数据默认留本机
- 传输 TLS；Supabase RLS `user_id = auth.uid()`
- 可选端到端加密（doc 加密后存储，M5 规划）

## 6. 版本与兼容

- Automerge 二进制格式自带版本兼容；订阅 `sync:changed` 以驱动 UI 刷新
- 跨端 schema 差异：未知字段保留透传，已知字段按当前 schema 读取