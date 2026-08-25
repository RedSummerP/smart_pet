import { describe, expect, it, vi } from 'vitest';
import type { SyncBackend } from '../src/adapter.js';
import { RemoteSyncAdapter, base64ToBytes } from '../src/adapter.js';
import { createSupabaseSyncBackend, type SupabaseLike } from '../src/adapters/supabase.js';
import { SyncPetStateStore } from '../src/store.js';
import { SyncEngine } from '../src/sync.js';
import { createInitialPetState, FOODS } from '@smartpet/core';

/** 内存模拟的 supabase-like 客户端（select/upsert/postgres_changes） */
function fakeSupabase() {
  const rows = new Map<string, { pet_id: string; rev: string; binary: string; updated_at: string }>();
  const activeCallbacks = new Set<() => void>();
  let subscribed = false;

  const client: SupabaseLike = {
    from(table: string) {
      if (table !== 'pet_state') throw new Error(`未知表: ${table}`);
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              return {
                async maybeSingle() {
                  const row = rows.get(String(value));
                  return { data: row ? { rev: row.rev, binary: row.binary } : null, error: null };
                },
              };
            },
          };
        },
        upsert(row: Record<string, unknown>) {
          rows.set(String(row['pet_id']), {
            pet_id: String(row['pet_id']),
            rev: String(row['rev']),
            binary: String(row['binary']),
            updated_at: String(row['updated_at'] ?? ''),
          });
          return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
        },
      };
    },
    channel() {
      return {
        on(_event, _filter, callback: () => void) {
          return {
            subscribe: async () => {
              activeCallbacks.add(callback);
              subscribed = true;
            },
            unsubscribe: async () => {
              activeCallbacks.delete(callback);
              subscribed = false;
            },
          };
        },
      };
    },
  };

  return {
    client,
    rows,
    fireChange: () => {
      // 只有活跃订阅的 channel 才收到投递（与真实 Realtime 一致）
      for (const listener of [...activeCallbacks]) listener();
    },
    isSubscribed: () => subscribed,
  };
}

const PET_ID = 'pet-sync-supabase';

function makeState() {
  const base = createInitialPetState('小皮', 0);
  return { ...base, meta: { ...base.meta, id: PET_ID } };
}

describe('createSupabaseSyncBackend + RemoteSyncAdapter（离线模拟）', () => {
  it('push 落一行 / pull 取回（base64 ↔ 二进制）', async () => {
    const fake = fakeSupabase();
    const backend = createSupabaseSyncBackend(fake.client as SupabaseLike, PET_ID);
    const adapter = new RemoteSyncAdapter('supabase', backend);

    const store = new SyncPetStateStore(makeState());
    store.reduce({ type: 'feed', item: FOODS[0]!, at: 0 });
    const binary = store.save();
    const rev = store.heads().join(',');

    await adapter.push(binary, rev);
    expect(fake.rows.size).toBe(1);
    const row = fake.rows.get(PET_ID)!;
    expect(row.binary).toBeTypeOf('string');
    expect(base64ToBytes(row.binary)).toEqual(binary);

    const pulled = await adapter.pull();
    expect(pulled).not.toBeNull();
    expect(pulled!.rev).toBe(rev);
    const restored = new SyncPetStateStore();
    restored.mergeIncoming(pulled!.binary);
    expect(restored.get()).toEqual(store.get());
  });

  it('pull 无数据返回 null', async () => {
    const fake = fakeSupabase();
    const backend = createSupabaseSyncBackend(fake.client as SupabaseLike, PET_ID);
    expect(await backend.fetchRow()).toBeNull();
  });

  it('subscribe：远端 postgres_changes → onChange；退订后不再通知', async () => {
    const fake = fakeSupabase();
    const backend = createSupabaseSyncBackend(fake.client as SupabaseLike, PET_ID);
    const onChange = vi.fn();
    const stop = backend.subscribe(onChange);
    expect(fake.isSubscribed()).toBe(true);
    fake.fireChange();
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    expect(fake.isSubscribed()).toBe(false);
    fake.fireChange();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('SyncEngine + supabase backend：A 喂食 → B 经"云端"拉取收敛', async () => {
    const fake = fakeSupabase();
    const backend: SyncBackend = createSupabaseSyncBackend(fake.client as SupabaseLike, PET_ID);
    const a = new SyncPetStateStore(makeState());
    const b = new SyncPetStateStore(makeState());
    const engineA = new SyncEngine(a, [new RemoteSyncAdapter('supabase', backend)]);
    const engineB = new SyncEngine(b, [new RemoteSyncAdapter('supabase', backend)]);

    a.reduce({ type: 'feed', item: FOODS[0]!, at: 0 }); // exp +10
    await engineA.pushAll();
    await engineB.pullAll();
    expect(b.get().stats.exp).toBe(10);

    b.reduce({ type: 'feed', item: FOODS[1]!, at: 0 }); // exp +12
    await engineB.pushAll();
    await engineA.pullAll();
    expect(a.get().stats.exp).toBe(22);
    expect(b.get().stats.exp).toBe(22);
  });
});