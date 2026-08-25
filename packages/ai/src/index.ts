export * from './config.js';
export * from './models.js';
export * from './persona.js';
export * from './agent.js';
export * from './tools/types.js';
export * from './tools/registry.js';
export * from './tools/builtin.js';
export type { AgentEvent, AgentMessage, AgentTool } from '@earendil-works/pi-agent-core';
// 供 UI/测试离线演示（faux provider 全链路，无需网络与 key）
export { createModels, fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
export type { FauxProviderHandle, Model, MutableModels } from '@earendil-works/pi-ai';