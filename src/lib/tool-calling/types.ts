/**
 * Tool-calling adapter types for multi-provider LLM support
 * Supports OpenAI Responses API and Chat Completions API (Qwen, KIMI)
 */

import type { ToolCall, ToolDefinition, ToolResult } from "@/lib/tools/types";

// Re-export for convenience
export type { ToolCall, ToolDefinition, ToolResult };

/**
 * Message roles for conversation history
 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/**
 * Conversation message format (OpenAI-compatible)
 */
export interface ConversationMessage {
  role: MessageRole;
  content: string;
  tool_calls?: ToolCall[]; // Only for assistant messages
  tool_call_id?: string; // Only for tool messages
}

/**
 * Provider capabilities for intelligent routing and feature detection
 */
export interface ProviderCapabilities {
  name: string;
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  supportsCaching: boolean;
  maxContextTokens: number;
  features: {
    /** Supports reasoning effort parameter (OpenAI Responses API) */
    reasoning?: boolean;
    /** Supports extended 24hr prompt caching (OpenAI) */
    extendedCaching?: boolean;
    /** Requires JSON repair for tool call arguments (Qwen) */
    requiresJSONRepair?: boolean;
    /** Requires reindexing of parallel tool calls (KIMI) */
    requiresReindexing?: boolean;
    /** Supports previous_response_id for CoT continuity (OpenAI) */
    supportsCoTContinuity?: boolean;
  };
}

/**
 * Reasoning effort levels for GPT-5.1
 */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

/**
 * Verbosity levels for GPT-5.1 output control
 */
export type Verbosity = "low" | "medium" | "high";

/**
 * Request to the adapter
 */
export interface AdapterRequest {
  messages: ConversationMessage[];
  tools: ToolDefinition[];
  options?: {
    /** Enable prompt caching if supported */
    caching?: boolean;
    /** Enable streaming if supported */
    streaming?: boolean;
    /** Reasoning effort (OpenAI GPT-5.1 only) */
    reasoningEffort?: ReasoningEffort;
    /** Output verbosity (OpenAI GPT-5.1 only) */
    verbosity?: Verbosity;
    /** Tool choice mode */
    toolChoice?: "auto" | "required" | "none";
    /** Max output tokens */
    maxTokens?: number;
    /** Previous response ID for CoT continuity (OpenAI only) */
    previousResponseId?: string;
  };
}

/**
 * Response from the adapter
 */
export interface AdapterResponse {
  message: ConversationMessage;
  toolCalls: ToolCall[];
  /** True if tool calls need to be executed and results sent back */
  requiresAction: boolean;
  /** Response ID for CoT continuity (OpenAI only) */
  responseId?: string;
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens?: number;
  };
}

/**
 * High-level agent context for orchestration
 */
export interface AgentContext {
  adId: string;
  userMessage: string;
  systemPrompt: string;
  language: string;
  market?: string;
  /** Previous conversation ID for continuity */
  conversationId?: string;
  /** Explicit provider choice (user can override defaults) */
  preferredProvider?: "openai" | "qwen" | "moonshot";
  /** Reasoning effort for this request */
  reasoningEffort?: ReasoningEffort;
}

/**
 * Result from agent execution
 */
export interface AgentResult {
  conversationId: string;
  message: string;
  drafts: {
    voices?: string;
    music?: string;
    sfx?: string;
  };
  toolCallHistory: Array<{
    tool: string;
    args: unknown;
    result: unknown;
  }>;
  provider: string;
  totalUsage?: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens?: number;
  };
}
