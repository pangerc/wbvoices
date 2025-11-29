/**
 * Agent Executor - Simple LLM tool-calling loop
 *
 * Trusts GPT-5.1's CoT continuity to handle:
 * - Duplicate prevention (model remembers what it created)
 * - Progress tracking (model sees tool results)
 * - Loop avoidance (CoT maintained via previous_response_id)
 */

import { OpenAIAdapter } from "./adapters/OpenAIAdapter";
import { TOOL_DEFINITIONS } from "@/lib/tools/definitions";
import { executeToolCalls } from "@/lib/tools/executor";
import { getConversation, saveConversation } from "@/lib/redis/conversation";
import { buildIterationSystemPrompt } from "@/lib/knowledge";
import type { ConversationMessage, AgentResult, ReasoningEffort } from "./types";

export interface AgentExecutorOptions {
  adId: string;
  reasoningEffort?: ReasoningEffort;
  maxIterations?: number;
  continueConversation?: boolean;
}

export async function runAgentLoop(
  systemPrompt: string,
  userMessage: string,
  options: AgentExecutorOptions
): Promise<AgentResult> {
  const { adId, reasoningEffort = "medium", maxIterations = 10, continueConversation: continueConvo = false } = options;

  const adapter = new OpenAIAdapter();
  let messages: ConversationMessage[] = continueConvo ? await getConversation(adId) : [];

  if (messages.length === 0 || messages[0].role !== "system") {
    messages = [{ role: "system", content: systemPrompt }, ...messages];
  }
  messages.push({ role: "user", content: userMessage });

  const drafts: { voices?: string; music?: string; sfx?: string } = {};
  const toolCallHistory: Array<{ tool: string; args: unknown; result: unknown }> = [];
  let totalUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
  let previousResponseId: string | undefined;
  let currentToolResults: Array<{ call_id: string; output: string }> = [];
  let iterations = 0;

  while (iterations++ < maxIterations) {
    console.log(`[AgentExecutor] Iteration ${iterations}`);

    const response = await adapter.invoke({
      messages,
      tools: TOOL_DEFINITIONS,
      options: { reasoningEffort, previousResponseId },
      currentToolResults: previousResponseId ? currentToolResults : undefined,
    });

    previousResponseId = response.responseId;
    if (response.usage) {
      totalUsage.promptTokens += response.usage.promptTokens;
      totalUsage.completionTokens += response.usage.completionTokens;
      totalUsage.cachedTokens += response.usage.cachedTokens || 0;
    }

    messages.push(response.message);

    if (!response.toolCalls.length) {
      console.log(`[AgentExecutor] Done after ${iterations} iteration(s)`);
      break;
    }

    console.log(`[AgentExecutor] Executing ${response.toolCalls.length} tool call(s)`);
    const toolResults = await executeToolCalls(response.toolCalls);

    // Track tool results for CoT continuity (used in next iteration)
    currentToolResults = response.toolCalls.map((call, i) => ({
      call_id: call.id,
      output: toolResults[i].content,
    }));

    for (let i = 0; i < response.toolCalls.length; i++) {
      const call = response.toolCalls[i];
      const result = toolResults[i];
      const resultContent = JSON.parse(result.content);

      toolCallHistory.push({
        tool: call.function.name,
        args: JSON.parse(call.function.arguments),
        result: resultContent,
      });

      if (call.function.name === "create_voice_draft" && resultContent.versionId) drafts.voices = resultContent.versionId;
      if (call.function.name === "create_music_draft" && resultContent.versionId) drafts.music = resultContent.versionId;
      if (call.function.name === "create_sfx_draft" && resultContent.versionId) drafts.sfx = resultContent.versionId;

      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
    }
  }

  if (iterations >= maxIterations) console.warn(`[AgentExecutor] Hit max iterations (${maxIterations})`);

  await saveConversation(adId, messages);

  const lastAssistantMessage = messages.slice().reverse().find((m) => m.role === "assistant");

  return {
    conversationId: adId,
    message: lastAssistantMessage?.content || "",
    drafts,
    toolCallHistory,
    provider: "openai",
    totalUsage: totalUsage.promptTokens > 0 ? {
      promptTokens: totalUsage.promptTokens,
      completionTokens: totalUsage.completionTokens,
      cachedTokens: totalUsage.cachedTokens > 0 ? totalUsage.cachedTokens : undefined,
    } : undefined,
  };
}

export async function continueConversation(adId: string, userMessage: string): Promise<AgentResult> {
  const existing = await getConversation(adId);
  if (existing.length === 0) {
    throw new Error(`No conversation found for ad ${adId}. Use runAgentLoop() for initial generation.`);
  }

  // Build FRESH system prompt for iterations - no stale voice list!
  // The old approach extracted the system prompt from conversation, but that contained
  // prefetched voices from initial generation which become stale.
  // Now the LLM can search for voices freely if needed.
  const systemPrompt = buildIterationSystemPrompt();

  return runAgentLoop(systemPrompt, userMessage, {
    adId,
    reasoningEffort: "low",
    continueConversation: true,
  });
}
