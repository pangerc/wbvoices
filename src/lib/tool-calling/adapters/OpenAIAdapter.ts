/**
 * OpenAI GPT-5.1 Adapter
 *
 * Uses the Responses API with:
 * - Native tool calling support
 * - Reasoning effort control (none/low/medium/high)
 * - Output verbosity control
 * - 24-hour prompt caching
 * - Chain-of-thought continuity via previous_response_id
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

export class OpenAIAdapter extends BaseToolCallingAdapter {
  readonly capabilities: ProviderCapabilities = {
    name: "openai",
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsCaching: true,
    maxContextTokens: 128000,
    features: {
      reasoning: true,
      extendedCaching: true,
      supportsCoTContinuity: true,
    },
  };

  private client: OpenAI;

  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async invoke(request: AdapterRequest): Promise<AdapterResponse> {
    const {
      messages,
      tools,
      options = {},
    } = request;

    const {
      reasoningEffort = "high",
      verbosity = "medium",
      maxTokens = 10000,
      previousResponseId,
    } = options;

    // Build input from messages
    const input = this.messagesToInput(messages);

    // Build response params
    // Note: GPT-5.1 supports "none" reasoning effort but SDK types may not be updated yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseParams: any = {
      model: "gpt-5.1",
      input,
      reasoning: { effort: reasoningEffort },
      text: { verbosity },
      max_output_tokens: maxTokens,
    };

    // Add tools if provided
    // Note: Responses API uses flat format, not nested function: { ... }
    if (tools.length > 0) {
      responseParams.tools = tools.map((tool) => ({
        type: "function" as const,
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      }));
    }

    // Add previous response ID for CoT continuity
    if (previousResponseId) {
      responseParams.previous_response_id = previousResponseId;
    }

    console.log(
      `[OpenAIAdapter] Invoking GPT-5.1 with reasoning=${reasoningEffort}, tools=${tools.length}`
    );

    const response = await this.client.responses.create(responseParams);

    // Extract tool calls from response
    const toolCalls = this.extractToolCalls(response);

    // Build response message
    const message: ConversationMessage = {
      role: "assistant",
      content: response.output_text || "",
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };

    return {
      message,
      toolCalls,
      requiresAction: toolCalls.length > 0,
      responseId: response.id,
      usage: response.usage
        ? {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
          }
        : undefined,
    };
  }

  /**
   * Convert conversation messages to Responses API input format
   */
  private messagesToInput(messages: ConversationMessage[]): string {
    return messages
      .map((msg) => {
        if (msg.role === "system") {
          return msg.content;
        }
        if (msg.role === "tool") {
          return `Tool result (${msg.tool_call_id}): ${msg.content}`;
        }
        return `\n\n${msg.role}: ${msg.content}`;
      })
      .join("");
  }

  /**
   * Extract tool calls from Responses API response
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractToolCalls(response: any): ToolCall[] {
    // The Responses API returns tool calls in the output array
    const toolCalls: ToolCall[] = [];

    if (response.output && Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item.type === "function_call") {
          toolCalls.push({
            id: item.call_id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            type: "function",
            function: {
              name: item.name,
              arguments: item.arguments,
            },
          });
        }
      }
    }

    return toolCalls;
  }
}
