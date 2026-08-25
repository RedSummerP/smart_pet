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
- **map/数组**：Automerge 默认合并；重名冲突按 last-writer-wins。
- 每次应用 `PetAction` 后的状态变更 → `doc` 变更 → 本地落盘 + 标记待同步。

## 2. 变更流程

```
UI/插件 ──PetAction──► PetRuntime.dispatch
                           │  petReducer（纯函数）
                           ▼
                    新 PetState ──► Automerge doc 变更（本地 commit）
                                        │
                     ┌──────────────────┼──────────────────┐
                     ▼                  ▼                  ▼
              本地快照（JSON）    pending oplog          SyncAdapter.push(doc)
              ~/.smartpet/state/                      （在线的端）
```

- 断线：变更进 pending 队列，重连后补推。
- 上线：`adapter.pull()` 拿远端 doc → `Automerge.merge(local, remote)` → 合并结果写回 → 广播 `sync:changed { rev, state }`。

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
| `supabase` | MVP 默认：一行一条文档（bytes），`pet_rev` 表 + Realtime 订阅；RLS 按用户隔离 |
| `http`（规划） | 自托管极简 Node/Go 服务，版本化 JSON 存储（M2 后） |

## 4. 冲突策略

- 同字段并发写：Automerge 规则（计数器相加、map last-writer-wins）
- 业务级冲突（如两端同时改名）：last-writer-wins + `pet:rename` 事件让 UI 提示
- 升级迁移：`schemaVersion` 变化 → 迁移函数注册表（`migrations: {1: (doc) => doc}`），升级前备份

## 5. 隐私与安全

- 同步内容**仅 PetState**；对话记录/插件重数据默认留本机
- 传输 TLS；Supabase RLS `user_id = auth.uid()`
- 可选端到端加密（doc 加密后存储，M5 规划）

## 6. 版本与兼容

- Automerge 二进制格式自带版本兼容；订阅 `sync:changed` 以驱动 UI 刷新
- 跨端 schema 差异：未知字段保留透传，已知字段按当前 schema 读取