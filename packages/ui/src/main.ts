import { mount } from 'svelte';
import App from './app/App.svelte';
import { AppState } from './app/app-state.js';
import { createMockBridge } from './bridge/mock.js';
import { createTauriBridge } from './bridge/tauri.js';
import { isTauriRuntime } from './bridge/types.js';
import './styles.css';

async function bootstrap(): Promise<void> {
  const bridge = isTauriRuntime() ? await createTauriBridge() : createMockBridge();
  const appState = new AppState(bridge);
  await appState.init();
  const target = document.getElementById('app');
  if (!target) throw new Error('缺少 #app 挂载点');
  mount(App, { target, props: { app: appState } });
}

void bootstrap();