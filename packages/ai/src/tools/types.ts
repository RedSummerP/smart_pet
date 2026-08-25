import type { PetRuntime } from '@smartpet/core';
import type { TSchema } from 'typebox';

/** 工具运行环境标签：Android 等受限环境自动降级 */
export type ToolEnvironment = 'desktop' | 'mobile';

export interface ToolOutput {
  /** 返回给模型的文本 */
  text: string;
  /** 结构化细节（日志/UI） */
  details?: unknown;
  isError?: boolean;
}

export interface ToolContext {
  /** pet_actions 工具使用：直接驱动宠物状态 */
  runtime?: PetRuntime;
  /** note 工具使用：记事本持久化（缺省内存） */
  notes?: NoteStore;
  signal?: AbortSignal;
}

export interface NoteStore {
  append(tag: string, text: string): Promise<void>;
  list(tag?: string): Promise<Array<{ tag: string; text: string; at: number }>>;
}

/**
 * 插件的工具定义（pipet 侧），由 ToolRegistry 转换为 pi 的 AgentTool。
 * `P` 为 handler 收到的参数类型（默认 any，宽松以便内置工具直接声明各自具体类型）。
 */
export interface PetToolDef<P = any> {
  name: string;
  label: string;
  description: string;
  /** typebox schema（pi Tool 标准），运行时用于参数校验 */
  parameters: TSchema;
  environments?: ToolEnvironment[];
  handler: (params: P, ctx: ToolContext) => ToolOutput | Promise<ToolOutput>;
}

export interface ToolEnvironmentFilter {
  /** 当前运行环境（缺省 desktop） */
  environment?: ToolEnvironment;
}