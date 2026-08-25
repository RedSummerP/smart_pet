import { describe, expect, it } from 'vitest';
import type { Message } from '@earendil-works/pi-ai';
import { contentText } from '@earendil-works/pi-ai';
import { createInitialPetState } from '@smartpet/core';
import { buildModels } from '../src/models.js';
import { createPetAgent } from '../src/agent.js';
import { parseSettings } from '../src/config.js';

/**
 * 真实 provider 冒烟测试（门控，默认跳过）：
 *   用户自备 key 运行：`DEEPSEEK_API_KEY=sk-xxx SMART_PET_SMOKE=1 pnpm --filter @smartpet/ai test`
 * - 只读环境变量 / 内置模板，绝不读取或打印任何凭据文件内容
 * - 验证 pi 全链路：provider 配置 → auth 解析 → 真实网络请求（stream）→ agent 工具闭环
 */
const hasEnvKey = (): boolean =>
  Object.keys(process.env).some((name) => /API_KEY|AUTH_TOKEN/i.test(name));

const SMOKE_YAML = `
llm-pi-ai:
  providers:
    deepseek-official:
      apiKeyEnv: DEEPSEEK_API_KEY
      api: openai-completions
      baseURL: https://api.deepseek.com
      models:
        - id: deepseek-chat
          name: DeepSeek Chat
          contextWindow: 131072
          input: [text]
  default:
    provider: deepseek-official
    model: deepseek-chat
`;

describe.skipIf(!process.env.SMART_PET_SMOKE || !hasEnvKey())('真实 provider 冒烟（SMART_PET_SMOKE=1）', () => {
  function buildModelsFromTemplate() {
    const settings = parseSettings(SMOKE_YAML);
    const models = buildModels({ providers: settings.providers });
    const def = settings.default!;
    const model = models.getModel(def.provider, def.model);
    expect(model, `模型不存在: ${def.provider}/${def.model}`).toBeTruthy();
    return { models, def };
  }

  it('completeSimple：真实网络请求返回非空回复（只打脱敏摘要）', async () => {
    const { models, def } = buildModelsFromTemplate();
    const model = models.getModel(def.provider, def.model)!;
    const messages: Message[] = [
      { role: 'user', content: '请回答两个字：在的', timestamp: Date.now() },
    ];
    const reply = await models.completeSimple(model, { systemPrompt: '你是冒烟测试助手', messages });
    const text = contentText(reply.content);
    expect(text.length).toBeGreaterThan(0);
    console.log(`[smoke] completeSimple ok: ${def.provider}/${def.model} · reply ${text.length} 字符`);
  });

  it('PetAgent 端到端（含 now 工具调用）', async () => {
    const { models, def } = buildModelsFromTemplate();
    const created = createPetAgent({
      models,
      providerId: def.provider,
      modelId: def.model,
      state: createInitialPetState('小皮'),
      onEvent: () => undefined,
    });
    await created.agent.prompt('请问现在几点？用 now 工具查询后再简短回答。');
    await created.agent.waitForIdle();
    const lastAssistant = [...created.agent.state.messages].reverse().find((m) => m.role === 'assistant');
    expect(lastAssistant).toBeTruthy();
    const text = contentText((lastAssistant as { content: unknown }).content as never);
    console.log(`[smoke] agent ok: ${def.provider}/${def.model} · 回复 ${text.length} 字符`);
  }, 60_000);
});