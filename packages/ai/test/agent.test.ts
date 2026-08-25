import { describe, expect, it } from 'vitest';
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { EventBus, InMemoryPetStateStore, PetRuntime, createInitialPetState } from '@smartpet/core';
import { createPetAgent } from '../src/agent.js';

function makeFaux() {
  const faux = fauxProvider({ models: [{ id: 'faux', name: 'Faux', contextWindow: 4096 }] });
  const models = createModels();
  models.setProvider(faux.provider);
  return { faux, models, providerId: faux.provider.id };
}

function makeRuntime() {
  const bus = new EventBus();
  const store = new InMemoryPetStateStore(createInitialPetState('小皮', 0));
  const runtime = new PetRuntime(store, bus);
  return { bus, store, runtime };
}

/** 从消息里抽取文本（兼容 string / 内容块） */
function textOf(message: AgentMessage): string {
  const content = (message as { content?: string | Array<{ type: string; text?: string }> }).content;
  if (typeof content === 'string') return content;
  return (content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
}

describe('PetAgent（基于 pi Agent + faux provider 离线全链路）', () => {
  it('对话：prompt → 助手回复进入 transcript', async () => {
    const { faux, models, providerId } = makeFaux();
    faux.setResponses([fauxAssistantMessage('我是小皮！见到你真好 (*^▽^*)')]);

    const { agent } = createPetAgent({
      models,
      providerId,
      modelId: 'faux',
      state: createInitialPetState('小皮', 0),
    });
    await agent.prompt('你是谁？');
    await agent.waitForIdle();

    const assistantMessages = agent.state.messages.filter((m) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);
    expect(textOf(assistantMessages[assistantMessages.length - 1]!)).toContain('我是小皮');
  });

  it('工具调用闭环：模型请求 calc → 工具执行 → 结果回填 → 继续对话', async () => {
    const { faux, models, providerId } = makeFaux();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('calc', { expression: '1+2*3' })]),
      fauxAssistantMessage('算好了，答案是 7！'),
    ]);

    const { agent, tools } = createPetAgent({
      models,
      providerId,
      modelId: 'faux',
      state: createInitialPetState('小皮', 0),
    });
    expect(tools.names()).toContain('calc');
    expect(tools.names()).toContain('now');
    expect(tools.names()).toContain('note');

    await agent.prompt('帮我算一下 1+2*3');
    await agent.waitForIdle();

    const toolResults = agent.state.messages.filter((m) => m.role === 'toolResult');
    expect(toolResults.length).toBeGreaterThan(0);
    expect(textOf(toolResults[0]!)).toContain('1+2*3 = 7');

    const lastAssistant = [...agent.state.messages].reverse().find((m) => m.role === 'assistant');
    expect(textOf(lastAssistant!)).toContain('7');
  });

  it('AI ↔ 宠物状态闭环：pet_actions 喂食真实改变宠物状态', async () => {
    const { faux, models, providerId } = makeFaux();
    const { runtime } = makeRuntime();
    const satietyBefore = runtime.state.stats.satiety;

    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('pet_actions', { action: 'feed', item: 'fish' })]),
      fauxAssistantMessage('好饱呀！'),
    ]);

    const { agent, tools } = createPetAgent({
      models,
      providerId,
      modelId: 'faux',
      state: createInitialPetState('小皮', 0),
      runtime,
    });
    expect(tools.names()).toContain('pet_actions');

    await agent.prompt('我饿了');
    await agent.waitForIdle();

    expect(runtime.state.stats.satiety).toBeGreaterThan(satietyBefore); // 真实状态变化
    const toolResults = agent.state.messages.filter((m) => m.role === 'toolResult');
    expect(textOf(toolResults[0]!)).toContain('小鱼干');
  });

  it('无 runtime 时不注册 pet_actions', async () => {
    const { faux, models, providerId } = makeFaux();
    const { agent, tools } = createPetAgent({
      models,
      providerId,
      modelId: 'faux',
      state: createInitialPetState('小皮', 0),
    });
    expect(tools.names()).not.toContain('pet_actions');
    expect(agent.state.systemPrompt).toContain('小皮'); // 人格注入名字
    expect(agent.state.systemPrompt).toContain('等级 1 级');
  });

  it('未知模型报清晰错误', () => {
    const { models } = makeFaux();
    expect(() =>
      createPetAgent({
        models,
        providerId: 'faux',
        modelId: '不存在',
        state: createInitialPetState('小皮', 0),
      }),
    ).toThrow(/模型不存在/);
  });
});