import type { EventBus } from '../events/bus.js';
import type { PetStateStore } from '../state/store.js';
import type { PetAction } from './reducer.js';
import type { FoodItem, PetState } from './types.js';

/**
 * 宠物聚合根：把动作应用到状态存储，并依据前后差异广播领域事件。
 * 事件全部由 prev/next 差异推导，保证"事件真实、无重复、无伪造"。
 */
export class PetRuntime {
  constructor(
    readonly store: PetStateStore,
    readonly bus: EventBus,
  ) {}

  get state(): PetState {
    return this.store.get();
  }

  dispatch(action: PetAction): PetState {
    const prev = this.store.get();
    const next = this.store.reduce(action);
    if (next === prev) return next;

    switch (action.type) {
      case 'feed': {
        this.bus.emit('pet:fed', { item: action.item, state: next });
        if (next.stats.level > prev.stats.level) {
          this.bus.emit('pet:level-up', { from: prev.stats.level, to: next.stats.level, state: next });
        }
        break;
      }
      case 'play': {
        this.bus.emit('pet:played', { amount: action.amount ?? 10, state: next });
        if (next.stats.level > prev.stats.level) {
          this.bus.emit('pet:level-up', { from: prev.stats.level, to: next.stats.level, state: next });
        }
        break;
      }
      case 'tick':
        this.bus.emit('pet:tick', { dtMs: action.dtMs, state: next });
        break;
      case 'rename':
        this.bus.emit('pet:rename', { name: next.meta.name, state: next });
        break;
      default:
        break;
    }

    if (next.mood.emotion !== prev.mood.emotion) {
      this.bus.emit('pet:mood-change', { from: prev.mood.emotion, to: next.mood.emotion, state: next });
    }
    if (JSON.stringify(next.stats) !== JSON.stringify(prev.stats)) {
      this.bus.emit('pet:stat-changed', { stats: next.stats, state: next });
    }
    return next;
  }

  /** 主循环 tick：每帧由宿主调用 */
  tick(dtMs: number): PetState {
    return this.dispatch({ type: 'tick', dtMs });
  }

  feed(item: FoodItem): PetState {
    return this.dispatch({ type: 'feed', item });
  }

  play(amount?: number): PetState {
    return this.dispatch({ type: 'play', amount });
  }

  rename(name: string): PetState {
    return this.dispatch({ type: 'rename', name });
  }
}