<script lang="ts">
  import { FOODS } from '@smartpet/core';
  import type { AppSnapshot } from '../app-state.js';
  import type { AppState } from '../app-state.js';

  let { app, state }: { app: AppState; state: AppSnapshot } = $props();

  const BARS = [
    { key: 'satiety', label: '饱食' },
    { key: 'energy', label: '精力' },
    { key: 'happiness', label: '心情' },
  ] as const;
</script>

<div class="panel">
  <h3>{state.pet.meta.name} · Lv {state.pet.stats.level}</h3>
  <div class="bars">
    {#each BARS as bar}
      <div class="bar-row">
        <span class="bar-label">{bar.label}</span>
        <div class="bar">
          <div
            class="bar-fill"
            style="width: {Math.min(100, Math.round(state.pet.stats[bar.key]))}%"
          ></div>
        </div>
        <span class="bar-value">{Math.round(state.pet.stats[bar.key])}</span>
      </div>
    {/each}
  </div>

  <div class="mood">情绪：{state.pet.mood.emotion}</div>

  <div class="actions">
    {#each FOODS as food}
      <button class="food" onclick={() => app.feed(food)}>{food.name}</button>
    {/each}
    <button onclick={() => app.play()}>陪它玩</button>
  </div>

  <div class="skins">
    <span class="bar-label">皮肤</span>
    {#each state.skins as skin}
      <button
        class:active={skin.id === state.skinId}
        class="skin-btn"
        onclick={() => app.applySkin(skin.id)}
      >
        {skin.name}
      </button>
    {/each}
  </div>

  <div class="unlocks">
    已解锁：
    {#if state.pet.unlocks.length === 0}
      <span class="muted">暂无</span>
    {:else}
      {#each state.pet.unlocks as u}<span class="chip">{u}</span>{/each}
    {/if}
  </div>
</div>