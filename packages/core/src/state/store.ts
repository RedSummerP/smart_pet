import { createInitialPetState } from '../pet/constants.js';
import type { PetAction } from '../pet/reducer.js';
import { petReducer } from '../pet/reducer.js';
import type { PetState } from '../pet/types.js';

export type PetStateListener = (state: PetState, prev: PetState) => void;

/** 宠物状态存储抽象：本地（内存/持久化/同步）实现均可替换 */
export interface PetStateStore {
  get(): PetState;
  set(state: PetState): void;
  subscribe(listener: PetStateListener): () => void;
  reduce(action: PetAction): PetState;
}

/** 内存实现（默认；同步/持久化实现位于 @smartpet/sync） */
export class InMemoryPetStateStore implements PetStateStore {
  private state: PetState;
  private listeners = new Set<PetStateListener>();

  constructor(initial?: PetState) {
    this.state = initial ?? createInitialPetState();
  }

  get(): PetState {
    return this.state;
  }

  set(state: PetState): void {
    const prev = this.state;
    this.state = state;
    for (const listener of this.listeners) listener(state, prev);
  }

  subscribe(listener: PetStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reduce(action: PetAction): PetState {
    const next = petReducer(this.state, action);
    if (next !== this.state) this.set(next);
    return this.state;
  }
}