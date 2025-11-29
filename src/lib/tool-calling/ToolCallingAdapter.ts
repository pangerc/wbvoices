/**
 * Tool-calling adapter interface
 *
 * Abstracts the differences between:
 * - OpenAI GPT-5.1 Responses API (with native tools, CoT, caching)
 * - Qwen Chat Completions API (requires JSON repair)
 * - KIMI Chat Completions API (requires reindexing)
 */

import type {
  ToolCall,
  ToolDefinition,
  AdapterRequest,
  AdapterResponse,
  ProviderCapabilities,
} from "./types";

/**
 * Unified interface for all LLM providers that support tool calling
 */
export interface ToolCallingAdapter {
  /**
   * Provider capabilities for feature detection
   */
  readonly capabilities: ProviderCapabilities;

  /**
   * Invoke the LLM with tools
   * @param request - Messages, tools, and options
   * @returns Response with message and any tool calls
   */
  invoke(request: AdapterRequest): Promise<AdapterResponse>;

  /**
   * Validate and repair tool calls from the LLM
   * Handles provider-specific quirks:
   * - Qwen: JSON repair (trailing commas, unquoted keys)
   * - KIMI: Parallel call reindexing
   *
   * @param toolCalls - Raw tool calls from LLM
   * @returns Validated/repaired tool calls
   */
  validateToolCalls(toolCalls: ToolCall[]): ToolCall[];
}

/**
 * Base class with common validation logic
 */
export abstract class BaseToolCallingAdapter implements ToolCallingAdapter {
  abstract readonly capabilities: ProviderCapabilities;
  abstract invoke(request: AdapterRequest): Promise<AdapterResponse>;

  /**
   * Default implementation - no validation needed
   * Subclasses override for provider-specific quirks
   */
  validateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    return toolCalls;
  }

  /**
   * Helper to build a tool result message
   */
  protected buildToolResultMessage(
    toolCallId: string,
    result: unknown
  ): { role: "tool"; tool_call_id: string; content: string } {
    return {
      role: "tool",
      tool_call_id: toolCallId,
      content: JSON.stringify(result),
    };
  }
}
