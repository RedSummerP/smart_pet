<script lang="ts">
  import type { AppSnapshot } from '../app-state.js';
  import type { AppState } from '../app-state.js';

  let { app, state }: { app: AppState; state: AppSnapshot } = $props();

  let draft = $state(state.settingsText);

  const save = async () => {
    await app.saveSettings(draft);
    alert('已保存（重新启动后生效于真实 provider）');
  };
</script>

<div class="panel">
  <h3>AI Provider 配置</h3>
  <p class="note">
    与 DeepSeek Harness 的 <code>llm-pi-ai</code> 配置同构。key 只存引用（环境变量名或钥匙串别名），明文 key 只进系统钥匙串。
  </p>
  <textarea bind:value={draft} rows="16" spellcheck="false" class="yaml"></textarea>
  <div class="settings-actions">
    <button onclick={() => void save()}>保存配置</button>
    <span class="meta"
      >运行环境：{app.bridgeKind}（{app.platformLabel}）· 模型：{state.modelLabel} · 同步：{state.syncLabel}</span
    >
  </div>
</div>