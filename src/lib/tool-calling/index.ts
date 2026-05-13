/**
 * Tool-calling module public exports
 */

// Types
export type {
  AdapterRequest,
  AdapterResponse,
  AgentResult,
  ConversationMessage,
  MessageRole,
  ReasoningEffort,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from "./types";

// Adapter
export { OpenAIAdapter } from "./adapters/OpenAIAdapter";

// Agent Executor
export {
  continueConversation,
  runAgentLoop,
  type AgentExecutorOptions,
} from "./AgentExecutor";
