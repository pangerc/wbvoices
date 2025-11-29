/**
 * Tool-calling module public exports
 */

// Types
export type {
  ConversationMessage,
  MessageRole,
  ProviderCapabilities,
  ReasoningEffort,
  Verbosity,
  AdapterRequest,
  AdapterResponse,
  AgentContext,
  AgentResult,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from "./types";

// Interface
export type { ToolCallingAdapter } from "./ToolCallingAdapter";
export { BaseToolCallingAdapter } from "./ToolCallingAdapter";

// Adapters
export { OpenAIAdapter } from "./adapters/OpenAIAdapter";
export { QwenAdapter } from "./adapters/QwenAdapter";
export { KimiAdapter } from "./adapters/KimiAdapter";

// Factory
export {
  getAdapter,
  getAdapterForModel,
  getAvailableProviders,
  isProviderAvailable,
  type Provider,
} from "./ProviderFactory";

// Agent Executor
export {
  runAgentLoop,
  continueConversation,
  type AgentExecutorOptions,
} from "./AgentExecutor";
