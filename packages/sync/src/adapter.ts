import * as Automerge from '@automerge/automerge';
import type { Doc } from '@automerge/automerge';

/** 同步后端适配器接口（可插拔：memory / supabase / http ...） */
export interface SyncAdapter {
  readonly id: string;
  /** 推送当前文档二进制（服务端再做差分合并，见 MemorySyncAdapter） */
  push(binary: Uint8Array, rev: string): Promise<void>;
  /** 拉取远端最新文档；无则 null */
  pull(): Promise<{ binary: Uint8Array; rev: string } | null>;
  /** 订阅远端变更，返回取消函数 */
  watch(onChange: () => void): () => void;
  dispose(): Promise<void>;
}

/** 内存适配器（测试/调试）：按"变更差分"合并宿主已有的种子文档，模拟服务端语义 */
export class MemorySyncAdapter implements SyncAdapter {
  readonly id = 'memory';
  private stored: { binary: Uint8Array; rev: string } | null = null;
  private watchers = new Set<() => void>();

  async push(binary: Uint8Array, rev: string): Promise<void> {
    if (this.stored) {
      const current = Automerge.load<Doc<unknown>>(this.stored.binary);
      const incoming = Automerge.load<Doc<unknown>>(binary);
      const changes = Automerge.getChanges(current, incoming);
      if (changes.length > 0) {
        const [merged] = Automerge.applyChanges(current, changes);
        this.stored = { binary: Automerge.save(merged), rev };
      }
      // changes 为空：incoming 已包含于存量（或落后），保持现有
    } else {
      this.stored = { binary, rev };
    }
  }

  async pull(): Promise<{ binary: Uint8Array; rev: string } | null> {
    return this.stored ? { ...this.stored } : null;
  }

  watch(onChange: () => void): () => void {
    this.watchers.add(onChange);
    return () => this.watchers.delete(onChange);
  }

  /** 手动触发（测试/模拟远端变更推送） */
  notify(): void {
    for (const watcher of [...this.watchers]) watcher();
  }

  async dispose(): Promise<void> {
    this.watchers.clear();
  }
}

// ---- 二进制 ↔ base64（平台无关，不依赖 Buffer / btoa） ----

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2]!;
    out += B64[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)]!;
    if (b1 === undefined) {
      out += '==';
    } else {
      out += B64[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)]!;
      out += b2 === undefined ? '=' : B64[b2 & 0x3f]!;
    }
  }
  return out;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
  const length = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(length);
  let p = 0;
  const val = (ch: string): number => {
    const idx = B64.indexOf(ch);
    if (idx < 0) throw new Error(`非法 base64 字符 '${ch}'`);
    return idx;
  };
  for (let i = 0; i < clean.length; i += 4) {
    const a = val(clean[i]!);
    const b = clean[i + 1] === undefined ? 0 : val(clean[i + 1]!);
    const c = clean[i + 2] === undefined ? 0 : val(clean[i + 2]!);
    const d = clean[i + 3] === undefined ? 0 : val(clean[i + 3]!);
    bytes[p++] = (a << 2) | (b >> 4);
    if (clean[i + 2] !== undefined) bytes[p++] = ((b & 0x0f) << 4) | (c >> 2);
    if (clean[i + 3] !== undefined) bytes[p++] = ((c & 0x03) << 6) | d;
  }
  return bytes;
}

/** 云端后端的最小契约（应用层用 supabase-js / 自研 http 客户端实现，本包保持零依赖） */
export interface SyncBackend {
  fetchRow(): Promise<{ binary: string; rev: string } | null>;
  upsertRow(row: { rev: string; binary: string }): Promise<void>;
  subscribe(onChange: () => void): () => void;
}

/** 基于 SyncBackend 的通用远端适配器（跳板到 Supabase/HTTP） */
export class RemoteSyncAdapter implements SyncAdapter {
  readonly id: string;

  constructor(
    id: string,
    private readonly backend: SyncBackend,
  ) {
    this.id = id;
  }

  async push(binary: Uint8Array, rev: string): Promise<void> {
    await this.backend.upsertRow({ rev, binary: bytesToBase64(binary) });
  }

  async pull(): Promise<{ binary: Uint8Array; rev: string } | null> {
    const row = await this.backend.fetchRow();
    return row ? { binary: base64ToBytes(row.binary), rev: row.rev } : null;
  }

  watch(onChange: () => void): () => void {
    return this.backend.subscribe(onChange);
  }

  async dispose(): Promise<void> {
    // backend 订阅由应用层管理
  }
}