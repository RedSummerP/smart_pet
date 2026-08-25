import { z } from 'zod';
import { parse as parseYaml } from 'yaml';

/**
 * AI Provider 配置（与 DSH settings.yaml 的 `llm-pi-ai` 块同构）。
 * key 只存"引用"（环境变量名 / keyring 别名），明文 key 只进平台安全存储。
 */

export const providerModelConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  contextWindow: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  input: z.array(z.enum(['text', 'image'])).optional(),
  reasoning: z.boolean().optional(),
});
export type ProviderModelConfig = z.infer<typeof providerModelConfigSchema>;

export const providerConfigSchema = z.object({
  /** 显示名（默认 = provider id） */
  displayName: z.string().optional(),
  /** 从环境变量取 key */
  apiKeyEnv: z.string().optional(),
  /** 从系统钥匙串取 key（别名，如 keyring://smartpet/deepseek） */
  apiKeyRef: z.string().optional(),
  /** pi api 实现：openai-completions / anthropic-messages / ... */
  api: z.string().optional(),
  baseURL: z.string().optional(),
  headers: z.record(z.string()).optional(),
  /** 自定义模型清单；缺省时 fallback 到内置 catalog（builtin 模式） */
  models: z.array(providerModelConfigSchema).optional(),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

const settingsFileSchema = z.object({
  'llm-pi-ai': z
    .object({
      providers: z.record(providerConfigSchema).optional(),
      default: z
        .object({ provider: z.string().min(1), model: z.string().min(1) })
        .optional(),
    })
    .optional(),
});

export interface ParsedSettings {
  providers: Array<ProviderConfig & { id: string }>;
  default?: { provider: string; model: string };
}

/** 解析 settings.yaml 文本（纯函数，不含 IO） */
export function parseSettings(yamlText: string): ParsedSettings {
  const doc = parseYaml(yamlText) as unknown;
  const parsed = settingsFileSchema.parse(doc);
  const block = parsed['llm-pi-ai'];
  const providers = Object.entries(block?.providers ?? {}).map(([id, cfg]) => ({ id, ...cfg }));
  return { providers, default: block?.default };
}

/** Provider 配置的 key 解析（apiKeyEnv 或 apiKeyRef 至少其一，否则视为"仅内置/未配置"） */
export function keySourceOf(cfg: ProviderConfig & { id: string }): { kind: 'env'; name: string } | { kind: 'keyring'; ref: string } | undefined {
  if (cfg.apiKeyEnv) return { kind: 'env', name: cfg.apiKeyEnv };
  if (cfg.apiKeyRef) return { kind: 'keyring', ref: cfg.apiKeyRef };
  return undefined;
}