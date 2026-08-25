<script lang="ts">
  import type { AppSnapshot } from '../app-state.js';
  import type { AppState } from '../app-state.js';

  let { app, state }: { app: AppState; state: AppSnapshot } = $props();

  let input = $state('');

  const send = async () => {
    const text = input.trim();
    if (!text || state.busy) return;
    input = '';
    await app.send(text);
  };
</script>

<div class="chat">
  <div class="messages">
    {#each state.messages as m (m.id)}
      <div class="msg {m.role}">
        {#if m.role === 'user'}<strong>你：</strong>{:else if m.role === 'assistant'}<strong>小皮：</strong>{/if}
        {m.text}{#if m.streaming}<span class="cursor">▍</span>{/if}
      </div>
    {/each}
    {#if state.messages.length === 0}
      <div class="hint">跟小皮打个招呼吧～ 试试说「喂我」或「帮我算点东西」体验工具调用</div>
    {/if}
  </div>
  <div class="composer">
    <input
      bind:value={input}
      placeholder="说点什么…"
      disabled={state.busy}
      onkeydown={(e) => {
        if (e.key === 'Enter') void send();
      }}
    />
    <button onclick={() => void send()} disabled={state.busy || !input.trim()}>发送</button>
  </div>
</div>