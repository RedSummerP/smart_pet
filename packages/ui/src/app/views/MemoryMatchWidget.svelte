<script lang="ts">
  import { MemoryMatchGame, type MemorySnapshot } from '@smartpet/plugin-memory-match';
  import type { AppState } from '../app-state.js';

  let { app, onExit }: { app: AppState; onExit: () => void } = $props();

  let game = $state<MemoryMatchGame>(new MemoryMatchGame());
  let snap = $state<MemorySnapshot>(game.start());
  let busy = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined = $state();

  const flip = (id: number) => {
    if (busy || snap.status !== 'playing') return;
    const result = game.flip(id);
    if (result === 'invalid') return;
    snap = result;
    const revealed = snap.cards.filter((c) => c.state === 'revealed');
    if (revealed.length === 2) {
      busy = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const resolved = game.resolvePending();
        if (resolved !== 'idle') snap = resolved;
        busy = false;
      }, 700);
    }
    if (snap.status === 'won') {
      app.bus.emit('game:score', { game: 'memory-match', score: snap.score });
    }
  };

  const restart = () => {
    snap = game.start();
    busy = false;
  };

  $effect(() => () => {
    if (timer) clearTimeout(timer);
  });
</script>

<div class="game-widget">
  <div class="game-head">
    <strong>记忆翻牌</strong>
    <span>步数：{snap.moves} · 配对：{snap.matchedPairs}/{snap.totalPairs} · 分数：{snap.score}</span>
  </div>

  {#if snap.status === 'won'}
    <div class="win-panel">
      <div class="win-title">🎉 全部配对完成！</div>
      <div class="win-score">得分 {snap.score}（步数 {snap.moves}）</div>
      <div class="win-actions">
        <button onclick={restart}>再来一局</button>
        <button class="ghost" onclick={onExit}>返回</button>
      </div>
    </div>
  {:else}
    <div class="board">
      {#each snap.cards as card (card.id)}
        <button
          class="card {card.state}"
          disabled={busy || card.state !== 'hidden'}
          onclick={() => flip(card.id)}
        >
          {#if card.state !== 'hidden'}{card.symbol}{/if}
        </button>
      {/each}
    </div>
    <div class="game-foot">
      <button class="ghost" onclick={restart}>重新开始</button>
      <button class="ghost" onclick={onExit}>退出</button>
    </div>
  {/if}
</div>

<style>
  .game-widget {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .game-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  }
  .game-head span {
    color: var(--muted);
  }
  .board {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .card {
    aspect-ratio: 1;
    min-height: 44px;
    border-radius: 10px;
    background: linear-gradient(160deg, rgba(255, 167, 38, 0.75), rgba(255, 167, 38, 0.45));
    color: #241a05;
    font-size: 20px;
    font-weight: 700;
    padding: 0;
  }
  .card.hidden {
    background: rgba(255, 255, 255, 0.10);
    color: transparent;
  }
  .card.matched {
    background: rgba(102, 187, 106, 0.30);
    color: var(--text);
    pointer-events: none;
  }
  .win-panel {
    text-align: center;
    padding: 20px 0;
  }
  .win-title {
    font-size: 17px;
    margin-bottom: 6px;
  }
  .win-score {
    color: var(--muted);
    margin-bottom: 14px;
    font-size: 13px;
  }
  .win-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
  }
  .ghost {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text);
  }
  .game-foot {
    display: flex;
    gap: 10px;
  }
</style>