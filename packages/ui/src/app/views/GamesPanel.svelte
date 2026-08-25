<script lang="ts">
  import type { AppSnapshot } from '../app-state.js';
  import type { AppState } from '../app-state.js';

  let { app, state }: { app: AppState; state: AppSnapshot } = $props();
</script>

<div class="panel">
  <h3>益智小游戏</h3>
  {#if state.games.length === 0}
    <div class="hint">
      还没有小游戏插件。<br />
      小游戏走「万物可插件」体系（games capability）：仓库 plugins/ 将内置官方游戏（记忆翻牌/数独…），插件市场在 M4 上线。
    </div>
  {/if}
  <div class="game-list">
    {#each state.games as g}
      <div class="game-card">
        <strong>{g.title}</strong>
        <p>{g.description}</p>
        <button onclick={() => alert(`游戏「${g.title}」的完整 UI 将随小游戏插件包提供（entry: ${g.entry}）`)}>
          开始（占位）
        </button>
      </div>
    {/each}
  </div>
</div>