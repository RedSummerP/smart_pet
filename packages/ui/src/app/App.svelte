<script lang="ts">
  import ChatPanel from './views/ChatPanel.svelte';
  import GamesPanel from './views/GamesPanel.svelte';
  import PetPanel from './views/PetPanel.svelte';
  import SettingsPanel from './views/SettingsPanel.svelte';
  import { PetRenderer } from '../render/PetRenderer.js';
  import type { AppSnapshot } from './app-state.js';
  import type { AppState } from './app-state.js';

  let { app }: { app: AppState } = $props();

  let tab = $state<'panel' | 'chat' | 'games' | 'settings'>('panel');
  let canvasEl: HTMLCanvasElement | undefined = $state();
  let renderer: PetRenderer | undefined = $state();
  let snap = $state<AppSnapshot>({
    pet: app.pet,
    messages: [],
    games: [],
    skins: [],
    skinId: app.skinId,
    settingsText: '',
    busy: false,
    ready: false,
    modelLabel: '',
    syncLabel: 'memory',
  });

  $effect(() => {
    const unsub = app.subscribe(() => {
      const requestedTab = app.tabRequest;
      if (requestedTab) {
        tab = requestedTab;
        app.consumeTab();
      }
      snap = {
        pet: app.pet,
        messages: app.messages,
        games: app.games,
        skins: app.skins,
        skinId: app.skinId,
        settingsText: app.settingsText,
        busy: app.busy,
        ready: app.ready,
        modelLabel: app.modelLabel,
        syncLabel: app.syncLabel,
      };
    });
    return unsub;
  });

  $effect(() => {
    if (!canvasEl || renderer) return;
    renderer = new PetRenderer({ canvas: canvasEl, palette: app.getSkinPalette(app.skinId) });
  });

  // 换肤：皮肤变化时通知渲染器重建贴图
  $effect(() => {
    if (!renderer) return;
    renderer.setPalette(app.getSkinPalette(snap.skinId));
  });

  $effect(() => {
    if (!renderer) return;
    let raf = 0;
    const loop = () => {
      const pet = app.pet;
      renderer!.update({ mood: pet.mood.emotion, sleeping: pet.stats.energy < 20 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
</script>

<main class="app-shell">
  <header class="app-header">
    <strong class="brand">SmartPet</strong>
    <span class="model-badge">{snap.modelLabel || '等待配置…'}</span>
    <span class="bridge-badge">{app.bridgeKind === 'mock' ? '演示模式' : app.platformLabel}</span>
  </header>

  <section class="pet-stage">
    <canvas
      bind:this={canvasEl}
      width="320"
      height="280"
      class="pet-canvas"
      aria-label="宠物"
    ></canvas>
    {#if !snap.ready}
      <div class="loading">正在唤醒小皮…</div>
    {/if}
  </section>

  <nav class="tabs">
    <button class:active={tab === 'panel'} onclick={() => (tab = 'panel')}>状态</button>
    <button class:active={tab === 'chat'} onclick={() => (tab = 'chat')}>聊天</button>
    <button class:active={tab === 'games'} onclick={() => (tab = 'games')}>小游戏</button>
    <button class:active={tab === 'settings'} onclick={() => (tab = 'settings')}>设置</button>
  </nav>

  <div class="tab-body">
    {#if tab === 'panel'}
      <PetPanel {app} state={snap} />
    {:else if tab === 'chat'}
      <ChatPanel {app} state={snap} />
    {:else if tab === 'games'}
      <GamesPanel {app} state={snap} />
    {:else}
      <SettingsPanel {app} state={snap} />
    {/if}
  </div>
</main>