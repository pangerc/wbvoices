/**
 * OpenAI GPT-5.5 Adapter
 *
 * Uses the Responses API with:
 * - Native tool calling support
 * - Reasoning effort control (none/low/medium/high/xhigh) — defaults to medium
 *   per the GPT-5.5 migration guide's recommendation.
 * - Output verbosity = "low" by default — the agent loop produces tool calls,
 *   not long prose answers, so the GPT-5.5 migration guide's recommendation
 *   to start at `low` for concise responses fits exactly. Tool preambles
 *   (the 1-sentence reasoning before each call requested in the system
 *   prompt) are independent of `text.verbosity` and still emitted.
 * - 24-hour prompt caching
 * - Chain-of-thought continuity via previous_response_id
 *
 * Phase handling: we use `previous_response_id` for state, not manual
 * assistant-item replay, so the migration guide's `phase` warning does
 * not apply — OpenAI's server retains the function_call items from the
 * prior response and we only echo back `function_call_output` per turn.
 */

import OpenAI from "openai";
import type {
  AdapterRequest,
  AdapterResponse,
  ConversationMessage,
  ModelStreamEvent,
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
    const {
      reasoningEffort = "medium",
      previousResponseId,
      onModelEvent,
    } = options;

    const input = this.buildInput(
      messages,
      !!previousResponseId,
      currentToolResults,
    );

    const responseParams: any = {
      model: "gpt-5.5",
      input,
      reasoning: { effort: reasoningEffort },
      text: { verbosity: "low" },
      max_output_tokens: 10000,
    };

    // Build the function tools array. The hosted `web_search` path was
    // dropped in v4 Stage X — brand context now lands via the alaric
    // BrandDossier projection at brief-prefetch time, not via mid-
    // iteration model calls.
    const toolList: unknown[] = tools.map((tool) => ({
      type: "function" as const,
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    }));
    if (toolList.length > 0) {
      responseParams.tools = toolList;
    }

    // Add previous response ID for CoT continuity
    if (previousResponseId) {
      responseParams.previous_response_id = previousResponseId;
    }

    const inputType = Array.isArray(input)
      ? `array[${input.length}]`
      : "string";
    console.log(
      `[OpenAIAdapter] Invoking GPT-5.5 with reasoning=${reasoningEffort}, tools=${tools.length}, input=${inputType}${previousResponseId ? ", CoT=ON" : ""}${onModelEvent ? ", streaming=ON" : ""}`,
    );

    // Two paths: streaming (when caller wants per-token events for UI
    // perceived-latency) and non-streaming (legacy, simpler). Both paths
    // return the same AdapterResponse shape so the agent loop is unchanged.
    const response = onModelEvent
      ? await this.invokeStreaming(responseParams, onModelEvent)
      : await this.client.responses.create(responseParams);

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
   * Streaming variant of the Responses API call. Iterates the SSE event
   * stream from `responses.stream`, forwards perceptible events (text
   * deltas, tool-call starts, function arg streaming) to the caller, and
   * resolves to the final aggregated response — same shape `responses.create`
   * would have returned.
   *
   * The OpenAI SDK's stream events use a discriminated `type` field; we
   * narrow the ones we care about and ignore the rest. Unknown event
   * shapes don't crash the loop — perceived-latency is non-critical.
   */

  private async invokeStreaming(
    responseParams: any,
    onModelEvent: (event: ModelStreamEvent) => void,
  ): Promise<any> {
    const stream = await this.client.responses.stream(responseParams);

    // Track which output items have been "started" so we only emit one
    // tool_call_start per call_id.
    const startedItems = new Set<string>();

    try {
      for await (const event of stream as AsyncIterable<any>) {
        const t: string | undefined = event?.type;
        if (!t) continue;

        // Text token streaming — the user-visible perceived-latency win.
        if (t === "response.output_text.delta") {
          const delta: string | undefined = event.delta;
          if (delta) onModelEvent({ type: "text_delta", text: delta });
          continue;
        }

        // New output item appeared. Function calls surface here when
        // they begin streaming.
        if (t === "response.output_item.added") {
          const item = event.item;
          if (item?.type === "function_call" && item.call_id) {
            if (!startedItems.has(item.call_id)) {
              startedItems.add(item.call_id);
              onModelEvent({
                type: "tool_call_start",
                name: item.name || "",
                callId: item.call_id,
              });
            }
          }
          continue;
        }

        // Function call arguments streaming, character by character. Lets
        // the UI render "calling search_voices for OpenAI Japanese voices…"
        // as it forms.
        if (t === "response.function_call_arguments.delta") {
          const delta: string | undefined = event.delta;
          const callId: string | undefined = event.item_id || event.call_id;
          if (delta && callId) {
            onModelEvent({ type: "tool_call_args_delta", callId, delta });
          }
          continue;
        }
        // Other event types (response.created, response.completed,
        // response.output_item.done, reasoning summaries, etc.) are
        // ignored — final aggregated response comes from finalResponse().
      }
    } catch (err) {
      // Stream errors — propagate so the agent loop's outer try/catch
      // surfaces them. We don't try to partially-recover.
      console.error("[OpenAIAdapter] streaming error:", err);
      throw err;
    }

    return await stream.finalResponse();
  }

  /**
   * Build input for Responses API
   * - First call: simple string (system + user message)
   * - Subsequent calls with tool results: structured array with function_call_output items
   */

  private buildInput(
    messages: ConversationMessage[],
    hasCoT: boolean,
    currentToolResults?: Array<{ call_id: string; output: string }>,
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
      .map((msg) =>
        msg.role === "system" ? msg.content : `\n\n${msg.role}: ${msg.content}`,
      )
      .join("");
  }

  /**
   * Extract tool calls from Responses API response
   */

  private extractToolCalls(response: any): ToolCall[] {
    // The Responses API returns tool calls in the output array
    const toolCalls: ToolCall[] = [];

    if (response.output && Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item.type === "function_call") {
          toolCalls.push({
            id:
              item.call_id ||
              `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
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
