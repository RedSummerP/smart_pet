import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ToolContext, ToolEnvironment, ToolEnvironmentFilter, ToolOutput, PetToolDef } from './types.js';

/** 工具注册表：插件 tools capability 与内置工具共用（AI 工具 = 同一注册表） */
export class ToolRegistry {
  private defs = new Map<string, PetToolDef>();

  register(def: PetToolDef): this {
    if (this.defs.has(def.name)) throw new Error(`工具重复注册: ${def.name}`);
    this.defs.set(def.name, def);
    return this;
  }

  unregister(name: string): void {
    this.defs.delete(name);
  }

  has(name: string): boolean {
    return this.defs.has(name);
  }

  list(): PetToolDef[] {
    return [...this.defs.values()];
  }

  count(): number {
    return this.defs.size;
  }

  /** 按环境过滤后的名称列表 */
  names(filter?: ToolEnvironmentFilter): string[] {
    return [...this.defs.values()]
      .filter((def) => this.allowedIn(def, filter?.environment ?? 'desktop'))
      .map((def) => def.name);
  }

  private allowedIn(def: PetToolDef, environment: ToolEnvironment): boolean {
    if (!def.environments || def.environments.length === 0) return true;
    return def.environments.includes(environment);
  }

  /** 转换为 pi AgentTool 列表（当前环境）。handler 异常 → 返回错误文本而非中断循环 */
  toAgentTools(context: ToolContext = {}, filter?: ToolEnvironmentFilter): AgentTool<any>[] {
    const env = filter?.environment ?? 'desktop';
    const result: AgentTool<any>[] = [];
    for (const def of this.defs.values()) {
      if (!this.allowedIn(def, env)) continue;
      result.push({
        name: def.name,
        label: def.label,
        description: def.description,
        parameters: def.parameters,
        execute: async (_toolCallId, params) => {
          try {
            const output: ToolOutput = await def.handler(params, context);
            return {
              content: [{ type: 'text', text: output.text }],
              details: output.details ?? {},
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: 'text', text: `工具 ${def.name} 出错：${message}` }],
              details: { error: message },
            };
          }
        },
      });
    }
    return result;
  }
}

export type { ToolContext, ToolOutput, ToolEnvironment, ToolEnvironmentFilter, PetToolDef } from './types.js';