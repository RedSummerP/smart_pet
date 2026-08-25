import * as Automerge from '@automerge/automerge';
import { createInitialPetState, petReducer, type PetAction, type PetStateStore, type PetState, type PetStateListener } from '@smartpet/core';
import { applyPlain, createDoc, docHeads, snapshot, type PetDoc } from './document.js';

/**
 * 基于 Automerge 文档的宠物状态存储（实现 @smartpet/core 的 PetStateStore）。
 *
 * 同步语义：
 * - 未做任何本地变更（pristine）时收到远端 → 整体采纳（新设备加入既有宠物）
 * - 已有本地变更后的远端合并 → 变更差分（getChanges/applyChanges），绝不整库 merge（避免 genesis 重复计数）
 */
export class SyncPetStateStore implements PetStateStore {
  private doc: Automerge.Doc<PetDoc>;
  private touched = false;
  private listeners = new Set<PetStateListener>();

  constructor(initial?: PetState) {
    this.doc = createDoc(initial ?? createInitialPetState());
  }

  get(): PetState {
    return snapshot(this.doc);
  }

  set(state: PetState): void {
    const prev = snapshot(this.doc);
    this.doc = applyPlain(this.doc, prev, state);
    this.touched = true;
    this.notify(snapshot(this.doc), prev);
  }

  reduce(action: PetAction): PetState {
    const prev = snapshot(this.doc);
    const next = petReducer(prev, action);
    if (next === prev) return prev;
    this.doc = applyPlain(this.doc, prev, next);
    this.touched = true;
    this.notify(next, prev);
    return next;
  }

  subscribe(listener: PetStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---- 同步扩展 ----

  getDoc(): Automerge.Doc<PetDoc> {
    return this.doc;
  }

  /** 序列化为二进制（Automerge 自带压缩与版本） */
  save(): Uint8Array {
    return Automerge.save(this.doc);
  }

  /** 当前头部标识（rev） */
  heads(): string[] {
    return docHeads(this.doc);
  }

  /**
   * 用远端二进制合并。
   * - pristine 且 genesis 不同 → 整体采纳远端（新设备加入）
   * - 否则差分应用 getChanges(local, remote)
   */
  mergeIncoming(bytes: Uint8Array): boolean {
    const prev = snapshot(this.doc);
    const remote = Automerge.load<PetDoc>(bytes);

    if (!this.touched && !sameHeads(asBytes(Automerge.getHeads(this.doc)), asBytes(Automerge.getHeads(remote)))) {
      // 新设备：以远端为基底（包含其 genesis 与全部进展）
      this.doc = remote;
      this.notify(snapshot(this.doc), prev);
      return true;
    }

    const changes = Automerge.getChanges(this.doc, remote);
    if (changes.length === 0) return false;
    const [merged] = Automerge.applyChanges(this.doc, changes);
    this.doc = merged;
    this.notify(snapshot(this.doc), prev);
    return true;
  }

  private notify(next: PetState, prev: PetState): void {
    for (const listener of this.listeners) listener(next, prev);
  }
}

/** Heads（类型来自 automerge-wasm）→ 字节数组，规避 TS 5.7 typed-array 泛型噪音 */
function asBytes(heads: unknown): Uint8Array[] {
  return heads as Uint8Array[];
}

/** 头部（二进制 hash 数组）逐一相等比较 */
function sameHeads(a: Uint8Array[], b: Uint8Array[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((ha, i) => {
    const hb = b[i];
    if (!hb || ha.length !== hb.length) return false;
    for (let j = 0; j < ha.length; j++) if (ha[j] !== hb[j]) return false;
    return true;
  });
}