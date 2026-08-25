import type { Emotion, FoodItem, PetState, PetStats } from '../pet/types.js';

/**
 * 类型安全事件总线契约：插件可模块扩展（module augmentation）：
 * ```ts
 * declare module '@smartpet/core' { interface PetEventMap { 'my:thing': { x: number } } }
 * ```
 */
export interface PetEventMap {
  'pet:created': { state: PetState };
  'pet:fed': { item: FoodItem; state: PetState };
  'pet:played': { amount: number; state: PetState };
  'pet:level-up': { from: number; to: number; state: PetState };
  'pet:mood-change': { from: Emotion; to: Emotion; state: PetState };
  'pet:stat-changed': { stats: PetStats; state: PetState };
  'pet:rename': { name: string; state: PetState };
  'pet:tick': { dtMs: number; state: PetState };
  /** 游戏行为相关事件 */
  'game:score': { game: string; score: number };
  'game:unlocked': { game: string };
  /** 同步 */
  'sync:changed': { rev: string; state: PetState };
  /** AI / 工具 */
  'tool:called': { name: string; ok: boolean; ms: number };
  'ai:token': { delta: string };
  'ai:message': { text: string; streaming: boolean };
  'ai:tool-start': { name: string };
  'ai:tool-end': { name: string; ok: boolean };
}

export type PluginEventMap = PetEventMap;

export class EventBus<M = PetEventMap> {
  private listeners = new Map<keyof M, Set<(payload: never) => void>>();

  constructor(
    private readonly opts: { onListenerError?: (event: string, error: unknown) => void } = {},
  ) {}

  on<K extends keyof M>(event: K, listener: (payload: M[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => this.off(event, listener);
  }

  off<K extends keyof M>(event: K, listener: (payload: M[K]) => void): void {
    this.listeners.get(event)?.delete(listener as (payload: never) => void);
  }

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(payload as never);
      } catch (err) {
        // 单个监听器抛错不得中断其它监听器；错误经 onListenerError 上报（默认忽略）
        this.opts.onListenerError?.(String(event), err);
      }
    }
  }

  /** 移除某事件的全部监听；不带参数则清空（插件卸载时使用） */
  clear<K extends keyof M>(event?: K): void {
    if (event === undefined) this.listeners.clear();
    else this.listeners.delete(event);
  }

  listenerCount(event: keyof M): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}