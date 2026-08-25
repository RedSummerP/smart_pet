import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Api,
  type ApiKeyAuth,
  type MutableModels,
  type Provider,
  type ProviderStreams,
} from '@earendil-works/pi-ai';
import { builtinProviders } from '@earendil-works/pi-ai/providers/all';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import type { ProviderConfig, ProviderModelConfig } from './config.js';

export interface BuildModelsOptions {
  /** 自定义 provider 配置（settings.yaml 解析结果） */
  providers?: Array<ProviderConfig & { id: string }>;
  /** 是否注册 pi 内置 provider（deepseek/openai/anthropic/google/...），默认 true */
  includeBuiltins?: boolean;
  /** apiKeyRef（keyring 别名）解析器：由宿主（Tauri 命令/keyring 插件）提供 */
  keyResolver?: (ref: string) => Promise<string | undefined>;
}

const API_IMPLS: Record<string, () => ProviderStreams> = {
  'openai-completions': () => openAICompletionsApi(),
};

/** api 字符串 → 实现；未知 api 抛错（插件可扩展） */
export function apiImplFor(api: string): ProviderStreams {
  const factory = API_IMPLS[api];
  if (!factory) throw new Error(`未知 api 实现: ${api}（当前支持: ${Object.keys(API_IMPLS).join(', ')}）`);
  return factory();
}

function toModel(
  providerId: string,
  baseURL: string | undefined,
  api: string,
  m: ProviderModelConfig,
): import('@earendil-works/pi-ai').Model<any> {
  return {
    id: m.id,
    name: m.name ?? m.id,
    api: api as Api,
    provider: providerId,
    baseUrl: baseURL ?? '',
    reasoning: m.reasoning ?? false,
    input: m.input ?? ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.contextWindow ?? 65536,
    maxTokens: m.maxTokens ?? 8192,
  };
}

function authFor(config: ProviderConfig & { id: string }, keyResolver?: (ref: string) => Promise<string | undefined>): ApiKeyAuth {
  if (config.apiKeyRef && keyResolver) {
    const ref = config.apiKeyRef;
    return {
      name: config.displayName ?? config.id,
      resolve: async ({ signal }) => {
        signal?.throwIfAborted?.();
        const key = await keyResolver(ref);
        return key ? { auth: { apiKey: key }, source: ref } : undefined;
      },
    };
  }
  return envApiKeyAuth(config.displayName ?? config.id, config.apiKeyEnv ? [config.apiKeyEnv] : []);
}

/** 由配置构建自定义 provider（OpenAI 兼容端点 / 自建网关 / Ollama / vLLM ...） */
export function providerFromConfig(
  config: ProviderConfig & { id: string },
  keyResolver?: (ref: string) => Promise<string | undefined>,
): Provider {
  const api = config.api ?? 'openai-completions';
  const streams = apiImplFor(api);
  const models = (config.models ?? []).map((m) => toModel(config.id, config.baseURL, api, m));
  return createProvider({
    id: config.id,
    name: config.displayName ?? config.id,
    baseUrl: config.baseURL,
    headers: config.headers,
    auth: { apiKey: authFor(config, keyResolver) },
    models,
    api: streams,
  });
}

/** 构建 Models 集合：内置 provider + 自定义 provider（含 keyring 解析） */
export function buildModels(options: BuildModelsOptions = {}): MutableModels {
  const models = createModels();
  if (options.includeBuiltins !== false) {
    for (const provider of builtinProviders()) models.setProvider(provider);
  }
  for (const config of options.providers ?? []) {
    models.setProvider(providerFromConfig(config, options.keyResolver));
  }
  return models;
}