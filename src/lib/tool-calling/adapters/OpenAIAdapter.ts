/**
 * OpenAI GPT-5.2 Adapter
 *
 * Uses the Responses API with:
 * - Native tool calling support
 * - Reasoning effort control (none/low/medium/high)
 * - Output verbosity control
 * - 24-hour prompt caching
 * - Chain-of-thought continuity via previous_response_id
 */

import OpenAI from "openai";
import type {
  AdapterRequest,
  AdapterResponse,
  ConversationMessage,
  ToolCall,
} from "../types";

export class OpenAIAdapter {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async invoke(request: AdapterRequest): Promise<AdapterResponse> {
    const { messages, tools, options = {}, currentToolResults } = request;
    const { reasoningEffort = "medium", previousResponseId } = options;

    const input = this.buildInput(messages, !!previousResponseId, currentToolResults);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseParams: any = {
      model: "gpt-5.2",
      input,
      reasoning: { effort: reasoningEffort },
      text: { verbosity: "medium" },
      max_output_tokens: 10000,
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

    const inputType = Array.isArray(input) ? `array[${input.length}]` : "string";
    console.log(
      `[OpenAIAdapter] Invoking GPT-5.2 with reasoning=${reasoningEffort}, tools=${tools.length}, input=${inputType}${previousResponseId ? ", CoT=ON" : ""}`
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
   * Build input for Responses API
   * - First call: simple string (system + user message)
   * - Subsequent calls with tool results: structured array with function_call_output items
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildInput(
    messages: ConversationMessage[],
    hasCoT: boolean,
    currentToolResults?: Array<{ call_id: string; output: string }>
  ): any {
    // With CoT continuity + explicit tool results - use only current iteration's results
    // (avoids stale call_ids from previous sessions in Redis)
    if (hasCoT && currentToolResults?.length) {
      return currentToolResults.map((tr) => ({
        type: "function_call_output",
        call_id: tr.call_id,
        output: tr.output,
      }));
    }

    // First call or no tool results - send conversation as string
    return messages
      .filter((m) => m.role !== "tool" && m.role !== "assistant")
      .map((msg) => (msg.role === "system" ? msg.content : `\n\n${msg.role}: ${msg.content}`))
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
