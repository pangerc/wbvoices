/**
 * Agent Executor - Simple LLM tool-calling loop
 *
 * Trusts GPT-5.5's CoT continuity to handle:
 * - Duplicate prevention (model remembers what it created)
 * - Progress tracking (model sees tool results)
 * - Loop avoidance (CoT maintained via previous_response_id)
 */

import { OpenAIAdapter } from "./adapters/OpenAIAdapter";
import { TOOL_DEFINITIONS } from "@/lib/tools/definitions";
import { executeToolCalls } from "@/lib/tools/executor";
import { getConversation, saveConversation } from "@/lib/redis/conversation";
import { buildIterationSystemPrompt } from "@/lib/knowledge";
import { getActiveVersion, getVersion } from "@/lib/redis/versions";
import type { KnowledgeContext } from "@/lib/knowledge/types";
import type { VoiceVersion } from "@/types/versions";
import type {
  ConversationMessage,
  AgentResult,
  ModelStreamEvent,
  ReasoningEffort,
} from "./types";

export interface AgentExecutorOptions {
  adId: string;
  reasoningEffort?: ReasoningEffort;
  maxIterations?: number;
  continueConversation?: boolean;
  /**
   * KnowledgeContext to snapshot onto any voice drafts created during the run.
   * Set on initial generation from the brief; on iteration, pre-merged from
   * the parent version's snapshot + user-stated overrides by the caller.
   */
  knowledgeContext?: KnowledgeContext;
  /**
   * Per-token / per-tool-call event callback for the streaming SSE path.
   * When provided, the adapter switches to streaming mode and forwards each
   * model event here. Doesn't change wall-clock latency — reduces the
   * "minutes feel like minutes" perception by giving the UI something to
   * render in real time.
   */
  onModelEvent?: (event: ModelStreamEvent) => void;
}

export async function runAgentLoop(
  systemPrompt: string,
  userMessage: string,
  options: AgentExecutorOptions
): Promise<AgentResult> {
  const {
    adId,
    reasoningEffort = "medium",
    maxIterations = 10,
    continueConversation: continueConvo = false,
    knowledgeContext,
    onModelEvent,
  } = options;

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
      options: {
        reasoningEffort,
        previousResponseId,
        onModelEvent,
      },
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
    const toolResults = await executeToolCalls(response.toolCalls, { knowledgeContext, adId });

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

  if (iterations >= maxIterations) {
    const callBreakdown = toolCallHistory
      .map((c, i) => `${i + 1}.${c.tool}`)
      .join(" → ");
    console.warn(
      `[AgentExecutor] Hit max iterations (${maxIterations}). Tool sequence: ${callBreakdown}. Drafts: voices=${drafts.voices ?? "none"} music=${drafts.music ?? "none"} sfx=${drafts.sfx ?? "none"}`
    );
  }

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

export async function continueConversation(
  adId: string,
  userMessage: string,
  contextOverrides?: Partial<KnowledgeContext>
): Promise<AgentResult> {
  const existing = await getConversation(adId);
  if (existing.length === 0) {
    throw new Error(`No conversation found for ad ${adId}. Use runAgentLoop() for initial generation.`);
  }

  // Inherit KnowledgeContext from the active voice version's snapshot, merge
  // any explicit overrides, and thread the result through both the iteration
  // system prompt AND the tool-executor (so any new voice draft created
  // during this turn snapshots the same context).
  //
  // The context drives the ElevenLabs knowledge module's FAST / ACCENT
  // branches + the provider-module selector in builder.ts. Without it, the
  // iteration prompt falls back to thin "normal pacing" defaults and
  // generated scripts lose their rich [rapid-fire] / [accent] tag density.
  const parentContext = await getActiveVoiceVersionContext(adId);
  const mergedContext: KnowledgeContext | undefined = parentContext || contextOverrides
    ? { ...(parentContext ?? {}), ...(contextOverrides ?? {}) }
    : undefined;

  if (!parentContext) {
    console.warn(
      `[continueConversation] No knowledgeContext on active voice version for ad ${adId}. ` +
      `Legacy or bare ad — iteration prompt will use thin defaults.`
    );
  }

  const systemPrompt = buildIterationSystemPrompt(mergedContext);

  return runAgentLoop(systemPrompt, userMessage, {
    adId,
    reasoningEffort: "low",
    continueConversation: true,
    knowledgeContext: mergedContext,
  });
}

/**
 * Load the KnowledgeContext snapshot from the ad's active voice version, if
 * any. Returns undefined for legacy versions that pre-date the snapshot
 * field — caller decides whether to degrade or infer from tracks.
 */
async function getActiveVoiceVersionContext(
  adId: string
): Promise<KnowledgeContext | undefined> {
  const activeId = await getActiveVersion(adId, "voices");
  if (!activeId) return undefined;
  const version = (await getVersion(adId, "voices", activeId)) as VoiceVersion | null;
  if (!version) return undefined;
  if (version.knowledgeContext) return version.knowledgeContext;

  // Legacy fallback: no snapshot field, but infer voiceProvider from the
  // voice tracks so at least the provider-module selector picks the right
  // knowledge module instead of defaulting to ElevenLabs guidance.
  const firstTrackProvider = version.voiceTracks?.[0]?.voice?.provider;
  if (firstTrackProvider) {
    return { voiceProvider: firstTrackProvider };
  }
  return undefined;
}
