import type { SyncBackend } from '../adapter.js';

/**
 * Supabase 同步后端：宠物状态文档存一行（pet_state 表）。
 * 本包保持零依赖 —— 通过鸭子类型接入 supabase-js（应用层注入客户端）。
 *
 * 表结构（SQL）：
 *  create table public.pet_state (
 *    pet_id     text primary key,
 *    rev        text not null,
 *    binary     text not null,   -- base64（Automerge 二进制）
 *    updated_at timestamptz not null default now()
 *  );
 *  -- RLS：alter table public.pet_state enable row level security;
 *  --      create policy "own" on public.pet_state for all using (auth.uid()::text = owner) ...
 */

/** supabase-js 的最小鸭子类型（v2 链式 API 的子集） */
export interface SupabaseLike {
  from(table: string): {
    select(columns?: string): {
      // select(columns).eq(col, value).maybeSingle()
      eq(column: string, value: unknown): {
        maybeSingle(): Promise<{ data: { rev: string; binary: string } | null; error: unknown }>;
      };
    };
    // upsert(row, { onConflict }).select().maybeSingle()
    upsert(
      row: Record<string, unknown>,
      options?: { onConflict?: string },
    ): { select(): { maybeSingle(): Promise<{ data: unknown; error: unknown }> } };
  };
  channel(name: string): {
    on(
      event: 'postgres_changes',
      filter: { event: '*' | 'INSERT' | 'UPDATE'; schema: 'public'; table: string; filter?: string },
      callback: (payload: unknown) => void,
    ): {
      subscribe(options?: unknown): unknown;
      unsubscribe(): unknown;
    };
  };
}

export interface SupabaseSyncOptions {
  table?: string;
}

export function createSupabaseSyncBackend(
  supabase: SupabaseLike,
  petId: string,
  options: SupabaseSyncOptions = {},
): SyncBackend {
  const table = options.table ?? 'pet_state';
  const channelName = `pet-${petId}`;

  return {
    async fetchRow() {
      const { data, error } = await supabase
        .from(table)
        .select('rev,binary')
        .eq('pet_id', petId)
        .maybeSingle();
      if (error) throw error;
      return data ? { binary: data.binary, rev: data.rev } : null;
    },

    async upsertRow(row) {
      const { error } = await supabase
        .from(table)
        .upsert(
          {
            pet_id: petId,
            rev: row.rev,
            binary: row.binary,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'pet_id' },
        )
        .select()
        .maybeSingle();
      if (error) throw error;
    },

    subscribe(onChange) {
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `pet_id=eq.${petId}` },
          () => onChange(),
        );
      void channel.subscribe();
      let unsubscribed = false;
      return () => {
        if (unsubscribed) return;
        unsubscribed = true;
        void channel.unsubscribe();
      };
    },
  };
}