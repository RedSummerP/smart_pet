import type { PlatformBridge, Platform } from './types.js';

/** 默认 settings.yaml（与 DSH llm-pi-ai 配置同构；key 只存引用） */
export const DEFAULT_SETTINGS_YAML = `# SmartPet AI 提供商配置（key 只存引用，明文 key 进系统钥匙串）
llm-pi-ai:
  providers:
    deepseek-official:
      displayName: DeepSeek 官方
      apiKeyEnv: DEEPSEEK_API_KEY
      api: openai-completions
      baseURL: https://api.deepseek.com
      models:
        - id: deepseek-chat
          name: DeepSeek Chat
          contextWindow: 131072
          input: [text]
    sensenova-gateway:
      displayName: 商汤网关
      api: openai-completions
      baseURL: https://token.sensenova.cn/v1
      apiKeyEnv: SENSENOVA_API_KEY
      models:
        - id: deepseek-v4-flash
          name: DeepSeek V4 Flash
          contextWindow: 1048576
          input: [text, image]
    local-ollama:
      displayName: 本地 Ollama
      api: openai-completions
      baseURL: http://127.0.0.1:11434/v1
      models:
        - id: qwen2.5:7b
          name: Qwen2.5 7B
          contextWindow: 131072
          input: [text]
  default:
    provider: deepseek-official
    model: deepseek-chat
`;

const KEY = 'smartpet.settings.yaml';

export interface MockBridgeOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  platform?: Platform;
}

/** 浏览器/测试用 mock bridge：settings 存 localStorage（node 无 localStorage 时退回内存） */
export function createMockBridge(options: MockBridgeOptions = {}): PlatformBridge {
  let settingsText = '';
  const storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  return {
    kind: 'mock',
    platform: options.platform ?? 'web',
    async readSettings() {
      if (storage) {
        const stored = storage.getItem(KEY);
        if (stored !== null) return stored;
      }
      return settingsText || DEFAULT_SETTINGS_YAML;
    },
    async saveSettings(text: string) {
      settingsText = text;
      storage?.setItem(KEY, text);
    },
    async resolveKey() {
      return undefined; // mock：无钥匙串
    },
    onTrayAction() {
      // mock：无托盘
    },
  };
}