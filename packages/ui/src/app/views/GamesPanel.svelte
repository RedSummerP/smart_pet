<script lang="ts">
  import MemoryMatchWidget from './MemoryMatchWidget.svelte';
  import type { AppSnapshot } from '../app-state.js';
  import type { AppState } from '../app-state.js';

  let { app, state }: { app: AppState; state: AppSnapshot } = $props();

  let activeEntry = $state<string | null>(null);
</script>

<div class="panel">
  <h3>益智小游戏</h3>

  {#if activeEntry === 'memory-match'}
    <MemoryMatchWidget {app} onExit={() => (activeEntry = null)} />
  {:else}
    {#if state.games.length === 0}
      <div class="hint">
        还没有小游戏插件。<br />
        小游戏走「万物可插件」体系（games capability）：插件市场在 M4 上线。
      </div>
    {/if}
    <div class="game-list">
      {#each state.games as g}
        <div class="game-card">
          <strong>{g.title}</strong>
          <p>{g.description}</p>
          <div class="game-card-actions">
            {#if g.entry === 'memory-match'}
              <button onclick={() => (activeEntry = g.entry)}>开始游戏</button>
            {:else}
              <button onclick={() => alert(`游戏「${g.title}」的 UI 组件将随插件版本上线（entry: ${g.entry}）`)}>
                开始（占位）
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>