/**
 * Tool-calling types for OpenAI GPT-5.1 Responses API
 */

import type { ToolCall, ToolDefinition, ToolResult } from "@/lib/tools/types";

export type { ToolCall, ToolDefinition, ToolResult };

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ConversationMessage {
  role: MessageRole;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface AdapterRequest {
  messages: ConversationMessage[];
  tools: ToolDefinition[];
  options?: {
    reasoningEffort?: ReasoningEffort;
    previousResponseId?: string;
  };
  /** Tool results from current iteration only (for CoT continuity) */
  currentToolResults?: Array<{ call_id: string; output: string }>;
}

export interface AdapterResponse {
  message: ConversationMessage;
  toolCalls: ToolCall[];
  requiresAction: boolean;
  responseId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens?: number;
  };
}

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
