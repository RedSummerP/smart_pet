import { describe, expect, it } from 'vitest';
import { parseSettings } from '../src/config.js';
import { providerFromConfig } from '../src/models.js';

const SAMPLE = `
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
      api: openai-completions
      baseURL: https://token.sensenova.cn/v1
      apiKeyEnv: SENSENOVA_API_KEY
      models:
        - id: deepseek-v4-flash
          contextWindow: 1048576
          input: [text, image]
  default:
    provider: deepseek-official
    model: deepseek-chat
`;

describe('parseSettings（兼容 DSH llm-pi-ai 配置）', () => {
  it('解析 providers / default / 模型模态', () => {
    const settings = parseSettings(SAMPLE);
    expect(settings.providers).toHaveLength(2);
    const deepseek = settings.providers[0]!;
    expect(deepseek.id).toBe('deepseek-official');
    expect(deepseek.displayName).toBe('DeepSeek 官方');
    expect(deepseek.apiKeyEnv).toBe('DEEPSEEK_API_KEY');
    expect(deepseek.baseURL).toBe('https://api.deepseek.com');
    expect(deepseek.models?.[0]?.contextWindow).toBe(131072);
    const gateway = settings.providers[1]!;
    expect(gateway.models?.[0]?.input).toEqual(['text', 'image']);
    expect(settings.default).toEqual({ provider: 'deepseek-official', model: 'deepseek-chat' });
  });

  it('空配置 / 缺块兼容', () => {
    expect(parseSettings('{}').providers).toEqual([]);
    expect(parseSettings('other: 1').providers).toEqual([]);
    expect(parseSettings('llm-pi-ai: {}\n').providers).toEqual([]);
  });
});

describe('providerFromConfig', () => {
  it('自定义 OpenAI 兼容端点 → Provider（模型清单同步注入）', () => {
    const cfg = parseSettings(SAMPLE).providers[1]!;
    const provider = providerFromConfig(cfg);
    expect(provider.id).toBe('sensenova-gateway');
    expect(provider.name).toBe('sensenova-gateway');
    expect(provider.baseUrl).toBe('https://token.sensenova.cn/v1');
    const models = provider.getModels();
    expect(models).toHaveLength(1);
    expect(models[0]!.id).toBe('deepseek-v4-flash');
    expect(models[0]!.provider).toBe('sensenova-gateway');
    expect(models[0]!.api).toBe('openai-completions');
    expect(models[0]!.input).toEqual(['text', 'image']);
  });

  it('未知 api 实现抛清晰错误', () => {
    expect(() =>
      providerFromConfig({ id: 'x', api: 'not-real', models: [{ id: 'm' }] }),
    ).toThrow(/未知 api 实现/);
  });
});