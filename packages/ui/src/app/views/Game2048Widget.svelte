<script lang="ts">
  import { Game2048, type Direction, type Game2048Snapshot } from '@smartpet/plugin-game-2048';
  import type { AppState } from '../app-state.js';

  let { app, onExit }: { app: AppState; onExit: () => void } = $props();

  let game = $state<Game2048>(new Game2048(4));
  let snap = $state<Game2048Snapshot>(game.start());

  const move = (direction: Direction) => {
    if (snap.status !== 'playing') return;
    const result = game.move(direction);
    if (!result.changed) return;
    snap = result.snapshot;
    if (snap.status !== 'playing') {
      app.bus.emit('game:score', { game: '2048', score: snap.score });
    }
  };

  const restart = () => {
    snap = game.start();
  };

  const cellClass = (value: number): string => {
    if (value === 0) return 'cell empty';
    if (value >= 4096) return 'cell v4096';
    if (value >= 2048) return 'cell v2048';
    return `cell v${String(value).length}`;
  };
</script>

<div class="game-widget">
  <div class="game-head">
    <strong>2048</strong>
    <span>分数：{snap.score} · {snap.status === 'won' ? '🎉 胜利' : snap.status === 'over' ? '💀 结束' : '滑动合并'}</span>
  </div>

  <div class="board">
    {#each snap.grid as row, rowIndex (rowIndex)}
      <div class="row">
        {#each row as cell, colIndex (colIndex)}
          <div class={cellClass(cell)}>{cell === 0 ? '' : cell}</div>
        {/each}
      </div>
    {/each}
  </div>

  <div class="controls">
    <button class="dir up" onclick={() => move('up')}>↑</button>
    <div class="lr">
      <button class="dir" onclick={() => move('left')}>←</button>
      <button class="dir" onclick={() => move('right')}>→</button>
    </div>
    <button class="dir down" onclick={() => move('down')}>↓</button>
  </div>

  <div class="game-foot">
    <button class="ghost" onclick={restart}>重新开始</button>
    <button class="ghost" onclick={onExit}>退出</button>
  </div>
</div>

<style>
  .game-widget {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
  }
  .game-head {
    display: flex;
    justify-content: space-between;
    width: 100%;
    font-size: 13px;
  }
  .game-head span {
    color: var(--muted);
  }
  .board {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    max-width: 240px;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .cell {
    flex: 1;
    aspect-ratio: 1;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 17px;
  }
  .cell.v1 { background: rgba(255, 167, 38, 0.55); color: #3a2505; }
  .cell.v2 { background: rgba(255, 167, 38, 0.75); color: #3a2505; }
  .cell.v3 { background: rgba(240, 130, 40, 0.8); color: #2a1c04; }
  .cell.v4 { background: rgba(220, 90, 50, 0.85); color: #fff; }
  .cell.v2048 { background: #ffd54f; color: #3a2505; font-size: 13px; }
  .cell.v4096 { background: #ff8f00; color: #fff; font-size: 12px; }
  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .lr {
    display: flex;
    gap: 30px;
  }
  .dir {
    width: 52px;
    height: 40px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--text);
    font-size: 15px;
    padding: 0;
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