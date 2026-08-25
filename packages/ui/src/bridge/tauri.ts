import type { PlatformBridge, Platform } from './types.js';
import { guessPlatform, isTauriRuntime } from './types.js';

/**
 * Tauri bridge：通过 invoke 调用 Rust 宿主命令，并订阅托盘/系统事件。
 * 动态 import @tauri-apps/api，浏览器构建不触碰。
 */
export async function createTauriBridge(): Promise<PlatformBridge> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  let platform: Platform = guessPlatform();
  void invoke<string>('platform')
    .then((value) => {
      if (value) platform = value as Platform;
    })
    .catch(() => undefined);

  return {
    kind: 'tauri',
    platform,
    readSettings: () => invoke<string>('read_settings'),
    saveSettings: (text) => invoke('save_settings', { text }),
    resolveKey: (ref) => invoke<string | null>('resolve_key', { ref }).then((v) => v ?? undefined),
    notify: (title, body) => invoke('notify', { title, body }),
    onTrayAction: (handler) => {
      void listen('tray:action', (event) => {
        const payload = event.payload as { action?: string };
        handler(payload.action ?? '');
      }).catch(() => undefined);
    },
  };
}

export { isTauriRuntime } from './types.js';