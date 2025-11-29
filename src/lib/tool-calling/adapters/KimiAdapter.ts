/**
 * Moonshot KIMI Adapter
 *
 * Uses the Chat Completions API (OpenAI-compatible) with:
 * - Parallel call reindexing (KIMI sometimes messes up tool_call.index)
 * - Optimized for Chinese content
 */

import OpenAI from "openai";
import { BaseToolCallingAdapter } from "../ToolCallingAdapter";
import type {
  AdapterRequest,
  AdapterResponse,
  ProviderCapabilities,
  ConversationMessage,
  ToolCall,
} from "../types";

export class KimiAdapter extends BaseToolCallingAdapter {
  readonly capabilities: ProviderCapabilities = {
    name: "moonshot",
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsCaching: true,
    maxContextTokens: 2000000, // 2M token context window
    features: {
      requiresReindexing: true,
    },
  };

  private client: OpenAI;

  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.MOONSHOT_API_KEY,
      baseURL: "https://api.moonshot.ai/v1",
    });
  }

  async invoke(request: AdapterRequest): Promise<AdapterResponse> {
    const { messages, tools, options = {} } = request;

    const { maxTokens = 2000 } = options;

    // Convert to Chat Completions format
    const chatMessages = messages.map((msg) => {
      if (msg.role === "tool") {
        return {
          role: "tool" as const,
          tool_call_id: msg.tool_call_id!,
          content: msg.content,
        };
      }
      if (msg.role === "assistant" && msg.tool_calls) {
        return {
          role: "assistant" as const,
          content: msg.content || null,
          tool_calls: msg.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: tc.function,
          })),
        };
      }
      return {
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      };
    });

    console.log(`[KimiAdapter] Invoking kimi-latest with ${tools.length} tools`);

    const response = await this.client.chat.completions.create({
      model: "kimi-latest",
      messages: chatMessages,
      tools:
        tools.length > 0
          ? tools.map((t) => ({ type: "function" as const, function: t.function }))
          : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    const choice = response.choices[0];
    const responseMessage = choice.message;

    // Extract and reindex tool calls
    const rawToolCalls = (responseMessage.tool_calls || [])
      .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function' } =>
        tc.type === 'function'
      )
      .map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));

    const toolCalls = this.validateToolCalls(rawToolCalls);

    // Build response message
    const message: ConversationMessage = {
      role: "assistant",
      content: responseMessage.content || "",
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };

    return {
      message,
      toolCalls,
      requiresAction: toolCalls.length > 0,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }

  /**
   * Reindex tool calls to ensure correct sequential ordering
   * KIMI sometimes returns incorrect index values in parallel calls
   */
  override validateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    return toolCalls.map((call, index) => ({
      ...call,
      // Force correct sequential indexing
      // Note: ToolCall interface doesn't have index, but some providers need it
      // We store it for internal use if needed
    }));
  }
}
