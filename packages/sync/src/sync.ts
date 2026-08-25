import type { EventBus } from '@smartpet/core';
import type { SyncAdapter } from './adapter.js';
import type { SyncPetStateStore } from './store.js';

export interface SyncEngineOptions {
  /** 本地变更后推送上行 debounce（ms） */
  debounceMs?: number;
  /** 事件总线：广播 sync:changed */
  bus?: EventBus;
}

/**
 * 本地优先同步引擎：本地变更 → 上行推送；远端变更（watch）→ 拉取合并 → 广播。
 * 失败静默（下次机会重试），单文档小，MVP 采用全量二进制 + 服务端合并，够用且稳。
 */
export class SyncEngine {
  private readonly debounceMs: number;
  private readonly bus?: EventBus;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private unsubscribes: Array<() => void> = [];
  private syncing = false;
  private syncQueued = false;

  constructor(
    private readonly store: SyncPetStateStore,
    private readonly adapters: SyncAdapter[],
    options: SyncEngineOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 800;
    this.bus = options.bus;
  }

  start(): void {
    this.unsubscribes.push(this.store.subscribe(() => this.schedulePush()));
    for (const adapter of this.adapters) {
      const stopWatch = adapter.watch(() => {
        void this.pullAll();
      });
      this.unsubscribes.push(stopWatch);
    }
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes = [];
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  /**
   * 立即同步一轮。顺序：先拉后推 ——
   * - 新设备先拉取采纳远端为基底（避免把自己的 genesis 合并进远程造成计数器翻倍）
   * - 再推本地增量（adapter 层面仍做差分合并，作为并发安全网）
   * 并发调用排队重跑，不静默丢弃。
   */
  async syncNow(): Promise<void> {
    if (this.syncing) {
      this.syncQueued = true;
      return;
    }
    this.syncing = true;
    try {
      do {
        this.syncQueued = false;
        await this.pullAll();
        await this.pushAll();
      } while (this.syncQueued);
    } finally {
      this.syncing = false;
    }
  }

  async pushAll(): Promise<void> {
    const binary = this.store.save();
    const rev = this.store.heads().join(',');
    for (const adapter of this.adapters) {
      try {
        await adapter.push(binary, rev);
      } catch (err) {
        this.bus?.emit('sync:changed', { rev: 'push-failed', state: this.store.get() });
        console.warn('[smartpet-sync] push failed', adapter.id, err);
      }
    }
  }

  async pullAll(): Promise<void> {
    for (const adapter of this.adapters) {
      try {
        const remote = await adapter.pull();
        if (!remote) continue;
        const localRev = this.store.heads().join(',');
        if (remote.rev === localRev) continue;
        const changed = this.store.mergeIncoming(remote.binary);
        if (changed) {
          const state = this.store.get();
          this.bus?.emit('sync:changed', { rev: this.store.heads().join(','), state });
          // 合并产物回推（其它端可见）
          await adapter.push(this.store.save(), this.store.heads().join(','));
        }
      } catch (err) {
        console.warn('[smartpet-sync] pull failed', adapter.id, err);
      }
    }
  }

  private schedulePush(): void {
    for (const adapter of this.adapters) {
      const existing = this.timers.get(adapter.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        this.timers.delete(adapter.id);
        void this.pushAll();
      }, this.debounceMs);
      this.timers.set(adapter.id, timer);
    }
  }
}