/**
 * Tool-calling types for OpenAI GPT-5.5 Responses API
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

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

/**
 * Incremental events emitted by the model during a streaming run. The
 * adapter calls `AdapterRequest.options.onModelEvent` with each one so
 * the agent loop can forward them to the UI as SSE events. Wall-clock
 * latency is unchanged — perceived latency is dramatically reduced
 * because the user sees tokens appearing instead of "minutes of silence".
 */
export type ModelStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; name: string; callId: string }
  | { type: "tool_call_args_delta"; callId: string; delta: string };

export interface AdapterRequest {
  messages: ConversationMessage[];
  tools: ToolDefinition[];
  options?: {
    reasoningEffort?: ReasoningEffort;
    previousResponseId?: string;
    /**
     * If set, the adapter switches from `responses.create` to
     * `responses.stream`, iterates the stream, and invokes this callback
     * for each model event. The final response shape returned by `invoke`
     * is identical either way — the callback is purely additive.
     */
    onModelEvent?: (event: ModelStreamEvent) => void;
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
