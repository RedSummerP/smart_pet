/** 平台桥接口：UI 不直接接触 Tauri / 浏览器差异，全部走 bridge */

export type Platform = 'linux' | 'windows' | 'macos' | 'android' | 'web';

export interface PlatformBridge {
  readonly kind: 'tauri' | 'mock';
  platform: Platform;
  /** 读取 settings.yaml 文本 */
  readSettings(): Promise<string>;
  /** 保存 settings.yaml 文本 */
  saveSettings(text: string): Promise<void>;
  /** keyring 别名解析（apiKeyRef）；未配置/无钥匙串返回 undefined */
  resolveKey(ref: string): Promise<string | undefined>;
  /** 桌面通知（可选） */
  notify?(title: string, body: string): Promise<void>;
  /** 托盘菜单事件订阅（桌面端；action: feed/play/games/...） */
  onTrayAction?(handler: (action: string) => void): void;
}

/** 浏览器中检测是否运行在 Tauri WebView */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function guessPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'macos';
  if (/Linux/i.test(ua)) return 'linux';
  return 'web';
}