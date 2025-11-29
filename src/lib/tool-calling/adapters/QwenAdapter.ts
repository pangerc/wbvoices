/**
 * Qwen-Max Adapter
 *
 * Uses the Chat Completions API (OpenAI-compatible) with:
 * - JSON repair for malformed tool call arguments
 * - Streaming disabled for reliability (parallel call bugs)
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

export class QwenAdapter extends BaseToolCallingAdapter {
  readonly capabilities: ProviderCapabilities = {
    name: "qwen",
    supportsToolCalling: true,
    supportsStreaming: false, // Disabled due to parallel call bugs
    supportsCaching: true,
    maxContextTokens: 128000,
    features: {
      requiresJSONRepair: true,
    },
  };

  private client: OpenAI;

  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.QWEN_API_KEY,
      baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
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

    console.log(`[QwenAdapter] Invoking qwen-max with ${tools.length} tools`);

    const response = await this.client.chat.completions.create({
      model: "qwen-max",
      messages: chatMessages,
      tools:
        tools.length > 0
          ? tools.map((t) => ({ type: "function" as const, function: t.function }))
          : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: false, // Force non-streaming for reliability
    });

    const choice = response.choices[0];
    const responseMessage = choice.message;

    // Extract and validate tool calls
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
   * Validate and repair tool calls from Qwen
   * Handles common JSON issues
   */
  override validateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    return toolCalls.map((call) => ({
      ...call,
      function: {
        ...call.function,
        arguments: this.repairJSON(call.function.arguments),
      },
    }));
  }

  /**
   * Repair common JSON issues from Qwen
   */
  private repairJSON(jsonStr: string): string {
    // First try to parse as-is
    try {
      JSON.parse(jsonStr);
      return jsonStr;
    } catch {
      // Apply repairs
      let repaired = jsonStr;

      // 1. Remove trailing commas before ] or }
      repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

      // 2. Quote unquoted keys
      repaired = repaired.replace(
        /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
        '$1"$2":'
      );

      // 3. Replace single quotes with double quotes
      repaired = repaired.replace(/'/g, '"');

      // 4. Handle escaped newlines in strings
      repaired = repaired.replace(/\\n/g, "\\\\n");

      // Try to parse the repaired JSON
      try {
        JSON.parse(repaired);
        console.log("[QwenAdapter] Repaired malformed JSON");
        return repaired;
      } catch (e) {
        console.error("[QwenAdapter] Failed to repair JSON:", jsonStr);
        // Return original and let the caller handle the error
        return jsonStr;
      }
    }
  }
}
