import type { AgentTool, AgentMessage, AgentEvent } from '@earendil-works/pi-agent-core';
import { Agent } from '@earendil-works/pi-agent-core';
import type { Model, MutableModels } from '@earendil-works/pi-ai';
import type { PetState } from '@smartpet/core';
import { PetRuntime } from '@smartpet/core';
import { personalityPrompt } from './persona.js';
import { builtinTools } from './tools/builtin.js';
import { ToolRegistry, type PetToolDef } from './tools/index.js';
import type { NoteStore } from './tools/builtin.js';

export interface PetAgentOptions {
  models: MutableModels;
  model: Model<any>;
  systemPrompt: string;
  tools: AgentTool<any>[];
  /** 为每次 LLM 调用解析 api key（pi 在模型请求前调用） */
  getApiKey?: (provider: string) => string | undefined | Promise<string | undefined>;
  sessionId?: string;
  /** 订阅 pi agent 生命周期事件（流式渲染、工具执行提示等） */
  onEvent?: (event: AgentEvent) => void;
}

/** 有状态的宠物 Agent：封装 pi Agent（人格 + 工具 + 流式事件） */
export class PetAgent {
  private readonly agent: Agent;

  constructor(options: PetAgentOptions) {
    this.agent = new Agent({
      initialState: {
        systemPrompt: options.systemPrompt,
        model: options.model,
        thinkingLevel: 'off',
        tools: options.tools,
      },
      streamFn: (model, context, streamOptions) => options.models.streamSimple(model, context, streamOptions),
      getApiKey: options.getApiKey,
      sessionId: options.sessionId,
    });
    if (options.onEvent) {
      this.agent.subscribe((event) => {
        try {
          options.onEvent?.(event);
        } catch {
          // UI 回调抛错不影响 agent 循环
        }
      });
    }
  }

  get state(): Agent['state'] {
    return this.agent.state;
  }

  get tools(): AgentTool<any>[] {
    return this.agent.state.tools;
  }

  setTools(tools: AgentTool<any>[]): void {
    this.agent.state.tools = tools;
  }

  setSystemPrompt(prompt: string): void {
    this.agent.state.systemPrompt = prompt;
  }

  get isStreaming(): boolean {
    return this.agent.state.isStreaming;
  }

  get errorMessage(): string | undefined {
    return this.agent.state.errorMessage;
  }

  /** 发起一轮对话（阻塞直到本轮 + 工具执行结束） */
  async prompt(text: string): Promise<void> {
    await this.agent.prompt(text);
  }

  /** 排队注入一条消息（当前轮结束后生效） */
  steer(message: AgentMessage): void {
    this.agent.steer(message);
  }

  abort(): void {
    this.agent.abort();
  }

  waitForIdle(): Promise<void> {
    return this.agent.waitForIdle();
  }
}

export interface CreatePetAgentOptions {
  models: MutableModels;
  providerId: string;
  modelId: string;
  /** 宠物当前状态（生成人格提示词） */
  state: PetState;
  /** 提供后注册 pet_actions 工具（AI 可真实驱动宠物状态变化） */
  runtime?: PetRuntime;
  /** note 工具的持久化（缺省内存） */
  notes?: NoteStore;
  /** 额外工具（插件/用户自定义） */
  extraTools?: PetToolDef[];
  getApiKey?: (provider: string) => string | undefined | Promise<string | undefined>;
  onEvent?: (event: AgentEvent) => void;
  tone?: string;
  extraPrompt?: string;
}

export interface CreatedPetAgent {
  agent: PetAgent;
  tools: ToolRegistry;
  model: Model<any>;
}

/** 一步构建"宠物人格 + 工具注册表 + Agent" */
export function createPetAgent(options: CreatePetAgentOptions): CreatedPetAgent {
  const model = options.models.getModel(options.providerId, options.modelId);
  if (!model) {
    throw new Error(`模型不存在: ${options.providerId}/${options.modelId}（请先在设置里配置 AI Provider）`);
  }
  const tools = new ToolRegistry();
  for (const def of builtinTools({ runtime: options.runtime, notes: options.notes })) tools.register(def);
  for (const def of options.extraTools ?? []) tools.register(def);
  const agent = new PetAgent({
    models: options.models,
    model,
    systemPrompt: personalityPrompt(options.state, { tone: options.tone, extra: options.extraPrompt }),
    tools: tools.toAgentTools(),
    getApiKey: options.getApiKey,
    onEvent: options.onEvent,
  });
  return { agent, tools, model };
}