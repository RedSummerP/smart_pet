import { describe, expect, it } from 'vitest';
import type { Message, Model } from '@earendil-works/pi-ai';
import { contentText } from '@earendil-works/pi-ai';
import { createInitialPetState } from '@smartpet/core';
import { buildModels } from '../src/models.js';
import { createPetAgent } from '../src/agent.js';
import { parseSettings } from '../src/config.js';

/**
 * 真实 provider 冒烟测试（门控，默认跳过）：
 *   用户自备 key 运行：`SMART_PET_SMOKE=1 pnpm --filter @smartpet/ai test`（key 从环境变量来）
 * - 只读环境变量，绝不读取或打印任何凭据文件内容
 * - 候选 provider：SENSENOVA 商汤网关 / DeepSeek 官方 / 本地 Ollama —— 自动选择"key 已配置"的那个
 * - 验证 pi 全链路：provider 配置 → auth 解析 → 真实网络请求（stream）→ agent 工具闭环
 */
const hasEnvKey = (): boolean =>
  Object.keys(process.env).some((name) => /API_KEY|AUTH_TOKEN/i.test(name));

const SMOKE_YAML = `
llm-pi-ai:
  providers:
    sensenova-gateway:
      apiKeyEnv: SENSENOVA_API_KEY
      api: openai-completions
      baseURL: https://token.sensenova.cn/v1
      models:
        - id: deepseek-v4-flash
          name: DeepSeek V4 Flash
          contextWindow: 1048576
          input: [text]
    deepseek-official:
      apiKeyEnv: DEEPSEEK_API_KEY
      api: openai-completions
      baseURL: https://api.deepseek.com
      models:
        - id: deepseek-chat
          name: DeepSeek Chat
          contextWindow: 131072
          input: [text]
`;

/** 候选顺序：依次找"模型存在且 auth 已配置"的 provider */
const CANDIDATES: Array<[string, string]> = [
  ['sensenova-gateway', 'deepseek-v4-flash'],
  ['deepseek-official', 'deepseek-chat'],
];

async function pickConfiguredModel(): Promise<{ models: ReturnType<typeof buildModels>; provider: string; model: Model<any> }> {
  const settings = parseSettings(SMOKE_YAML);
  const models = buildModels({ providers: settings.providers });
  for (const [provider, modelId] of CANDIDATES) {
    const model = models.getModel(provider, modelId);
    if (!model) continue;
    const auth = await models.checkAuth(provider).catch(() => undefined);
    if (auth) return { models, provider, model: model as Model<any> };
  }
  throw new Error('没有配置任何可用 provider 的 key（需要 SENSENOVA_API_KEY 或 DEEPSEEK_API_KEY 环境变量）');
}

describe.skipIf(!process.env.SMART_PET_SMOKE || !hasEnvKey())('真实 provider 冒烟（SMART_PET_SMOKE=1）', () => {
  it('completeSimple：真实网络请求返回非空回复（只打脱敏摘要）', async () => {
    const { models, provider, model } = await pickConfiguredModel();
    const messages: Message[] = [
      { role: 'user', content: '请回答两个字：在的', timestamp: Date.now() },
    ];
    const reply = await models.completeSimple(model, {
      systemPrompt: '你是冒烟测试助手',
      messages,
    });
    const text = contentText(reply.content);
    console.log(
      `[smoke] completeSimple: provider=${provider} stop=${reply.stopReason} blocks=[${reply.content.map((b) => b.type).join(',')}] text=${text.length}字${reply.errorMessage ? ` err=${reply.errorMessage}` : ''}`,
    );
    expect(reply.stopReason).not.toBe('error');
    expect(reply.stopReason).not.toBe('aborted');
    expect(reply.errorMessage ?? undefined).toBeUndefined();
    expect(text.length).toBeGreaterThan(0);
  }, 60_000);

  it('PetAgent 端到端（含工具调用，真实模型）', async () => {
    const { models, provider, model } = await pickConfiguredModel();
    const created = createPetAgent({
      models,
      providerId: provider,
      modelId: model.id,
      state: createInitialPetState('小皮'),
      onEvent: () => undefined,
    });
    await created.agent.prompt('请问现在几点？用 now 工具查询后再简短回答。');
    await created.agent.waitForIdle();
    const lastAssistant = [...created.agent.state.messages].reverse().find((m) => m.role === 'assistant');
    expect(lastAssistant).toBeTruthy();
    const text = contentText((lastAssistant as { content: unknown }).content as never);
    const stop = (lastAssistant as { stopReason?: string }).stopReason;
    console.log(`[smoke] agent: provider=${provider} stop=${stop} 回复 ${text.length} 字`);
    expect(stop).not.toBe('error');
    expect(stop).not.toBe('aborted');
  }, 90_000);
});