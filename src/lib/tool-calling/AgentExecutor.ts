/**
 * Agent Executor - Orchestrates LLM tool-calling loop
 *
 * Handles the full agent loop:
 * 1. Load/create conversation
 * 2. Call LLM with tools
 * 3. Execute tool calls
 * 4. Repeat until no more tool calls
 * 5. Save conversation and return results
 */

import { getAdapter, type Provider } from "./ProviderFactory";
import { TOOL_DEFINITIONS, getToolDefinitions, type ToolSet } from "@/lib/tools/definitions";
import { executeToolCalls } from "@/lib/tools/executor";
import {
  getConversation,
  saveConversation,
} from "@/lib/redis/conversation";
import type {
  ConversationMessage,
  AgentResult,
  ReasoningEffort,
  ToolCall,
} from "./types";

/**
 * Options for the agent executor
 */
export interface AgentExecutorOptions {
  /** Advertisement ID - used for conversation storage and draft creation */
  adId: string;
  /** Provider to use (openai, qwen, moonshot) */
  provider: Provider;
  /** Reasoning effort for OpenAI (default: high for generation, low for chat) */
  reasoningEffort?: ReasoningEffort;
  /** Maximum iterations to prevent infinite loops (default: 10) */
  maxIterations?: number;
  /** Whether to append to existing conversation (default: false = start fresh) */
  continueConversation?: boolean;
  /** Tool set to use (default: chat_refinement for backwards compatibility) */
  toolSet?: ToolSet;
}

/**
 * Run the agent loop to completion
 *
 * @param systemPrompt - System prompt defining agent behavior
 * @param userMessage - User's request
 * @param options - Executor options
 * @returns AgentResult with drafts created and conversation ID
 */
export async function runAgentLoop(
  systemPrompt: string,
  userMessage: string,
  options: AgentExecutorOptions
): Promise<AgentResult> {
  const {
    adId,
    provider,
    reasoningEffort = "high",
    maxIterations = 10,
    continueConversation = false,
    toolSet = "chat_refinement", // Default to full tools for backwards compatibility
  } = options;

  // Get appropriate tool definitions based on tool set
  const tools = getToolDefinitions(toolSet);

  // 1. Load or initialize conversation
  let messages: ConversationMessage[] = [];

  if (continueConversation) {
    messages = await getConversation(adId);
  }

  // Add system prompt if starting fresh or not present
  if (messages.length === 0 || messages[0].role !== "system") {
    messages = [{ role: "system", content: systemPrompt }, ...messages];
  }

  // Add user message
  messages.push({ role: "user", content: userMessage });

  // 2. Get adapter
  const adapter = getAdapter(provider);

  // 3. Track tool calls and drafts created
  const toolCallHistory: Array<{ tool: string; args: unknown; result: unknown }> = [];
  const drafts: { voices?: string; music?: string; sfx?: string } = {};
  let totalUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };

  // 4. Run agent loop
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // Early exit BEFORE calling LLM if all drafts exist
    if (drafts.voices && drafts.music && drafts.sfx) {
      console.log(`[AgentExecutor] All drafts exist, skipping LLM call`);
      break;
    }

    console.log(`[AgentExecutor] Iteration ${iterations} - ${messages.length} messages`);

    // Call LLM
    const response = await adapter.invoke({
      messages,
      tools, // Uses filtered tool set based on toolSet option
      options: {
        reasoningEffort,
        caching: true,
      },
    });

    // Track usage
    if (response.usage) {
      totalUsage.promptTokens += response.usage.promptTokens;
      totalUsage.completionTokens += response.usage.completionTokens;
      totalUsage.cachedTokens += response.usage.cachedTokens || 0;
    }

    // Add assistant response to conversation
    messages.push(response.message);

    // Check if we're done (no tool calls)
    if (!response.requiresAction || response.toolCalls.length === 0) {
      console.log(`[AgentExecutor] Done after ${iterations} iteration(s)`);
      break;
    }

    // Filter out duplicate draft creation attempts
    const filteredCalls = response.toolCalls.filter((call) => {
      const toolName = call.function.name;
      if (toolName === "create_voice_draft" && drafts.voices) {
        console.log(`[AgentExecutor] Blocking duplicate voice draft (already have ${drafts.voices})`);
        return false;
      }
      if (toolName === "create_music_draft" && drafts.music) {
        console.log(`[AgentExecutor] Blocking duplicate music draft (already have ${drafts.music})`);
        return false;
      }
      if (toolName === "create_sfx_draft" && drafts.sfx) {
        console.log(`[AgentExecutor] Blocking duplicate sfx draft (already have ${drafts.sfx})`);
        return false;
      }
      return true;
    });

    // If all calls were filtered out, send context-aware feedback and continue
    if (filteredCalls.length === 0 && response.toolCalls.length > 0) {
      console.log(`[AgentExecutor] All tool calls filtered, sending feedback to LLM`);

      // Determine what's ACTUALLY missing
      const missing: string[] = [];
      if (!drafts.voices) missing.push("create_voice_draft");
      if (!drafts.music) missing.push("create_music_draft");
      if (!drafts.sfx) missing.push("create_sfx_draft");

      let feedbackMessage = "";
      if (missing.length === 0) {
        feedbackMessage = "All drafts complete (voices, music, sfx). Stop calling tools.";
      } else {
        feedbackMessage = `Draft already exists. Still need: ${missing.join(", ")}. Call ${missing[0]} next.`;
      }

      // Add synthetic results for ALL blocked calls
      for (const blockedCall of response.toolCalls) {
        messages.push({
          role: "tool",
          tool_call_id: blockedCall.id,
          content: JSON.stringify({
            error: feedbackMessage,
            existingDrafts: drafts,
            missing: missing,
          }),
        });
      }
      console.log(`[AgentExecutor] Feedback: ${feedbackMessage}`);

      // If all drafts exist, break - otherwise continue
      if (missing.length === 0) {
        console.log(`[AgentExecutor] All drafts complete, stopping`);
        break;
      }
      continue;
    }

    // Execute tool calls
    console.log(`[AgentExecutor] Executing ${filteredCalls.length} tool call(s)`);

    const toolResults = await executeToolCalls(filteredCalls);

    // Process each tool call and result
    for (let i = 0; i < filteredCalls.length; i++) {
      const call = filteredCalls[i];
      const result = toolResults[i];

      // Track history
      const args = JSON.parse(call.function.arguments);
      const resultContent = JSON.parse(result.content);
      toolCallHistory.push({
        tool: call.function.name,
        args,
        result: resultContent,
      });

      // Extract draft IDs from create_*_draft results
      if (call.function.name === "create_voice_draft" && resultContent.versionId) {
        drafts.voices = resultContent.versionId;
      } else if (call.function.name === "create_music_draft" && resultContent.versionId) {
        drafts.music = resultContent.versionId;
      } else if (call.function.name === "create_sfx_draft" && resultContent.versionId) {
        drafts.sfx = resultContent.versionId;
      }

      // Add tool result to conversation
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.content,
      });
    }

    // Detect loops - same tool called repeatedly without progress
    const recentTools = toolCallHistory.slice(-6).map((t) => t.tool);
    const searchCount = recentTools.filter((t) => t === "search_voices").length;
    const stateCount = recentTools.filter((t) => t === "get_current_state").length;

    if (searchCount >= 3 || stateCount >= 3) {
      console.warn(
        `[AgentExecutor] LOOP DETECTED: ${searchCount} searches, ${stateCount} state calls in last 6.`
      );

      // If voice draft exists but no music yet, inject forcing message and give one more chance
      if (drafts.voices && !drafts.music) {
        // Check if we already tried forcing (avoid infinite forcing loop)
        const lastMessage = messages[messages.length - 1];
        const alreadyForced = lastMessage?.role === "user" &&
          typeof lastMessage.content === "string" &&
          lastMessage.content.includes("STOP SEARCHING");

        if (!alreadyForced) {
          console.log(`[AgentExecutor] Voice draft exists, forcing music creation`);
          messages.push({
            role: "user",
            content: "STOP SEARCHING. Voice draft already created. NOW call create_music_draft immediately with a music prompt that matches the ad's tone and energy."
          });
          continue; // Give LLM one more chance
        }
      }

      // Otherwise break
      console.error(`[AgentExecutor] Breaking loop - no recovery possible`);
      break;
    }

  }

  if (iterations >= maxIterations) {
    console.warn(`[AgentExecutor] Hit max iterations (${maxIterations})`);
  }

  // 5. Save conversation
  await saveConversation(adId, messages);

  // 6. Build result
  const lastAssistantMessage = messages
    .slice()
    .reverse()
    .find((m) => m.role === "assistant");

  return {
    conversationId: adId,
    message: lastAssistantMessage?.content || "",
    drafts,
    toolCallHistory,
    provider: adapter.capabilities.name,
    totalUsage:
      totalUsage.promptTokens > 0
        ? {
            promptTokens: totalUsage.promptTokens,
            completionTokens: totalUsage.completionTokens,
            cachedTokens: totalUsage.cachedTokens > 0 ? totalUsage.cachedTokens : undefined,
          }
        : undefined,
  };
}

/**
 * Continue an existing conversation with a new message
 * Uses lower reasoning effort for refinements
 *
 * @param adId - Advertisement ID
 * @param userMessage - User's refinement request
 * @param provider - Provider to use
 * @returns AgentResult with any new drafts created
 */
export async function continueConversation(
  adId: string,
  userMessage: string,
  provider: Provider
): Promise<AgentResult> {
  // Check if conversation exists
  const existing = await getConversation(adId);

  if (existing.length === 0) {
    throw new Error(
      `No conversation found for ad ${adId}. Use runAgentLoop() for initial generation.`
    );
  }

  // Extract system prompt from existing conversation
  const systemPrompt =
    existing.find((m) => m.role === "system")?.content ||
    "You are an expert audio ad creative director.";

  return runAgentLoop(systemPrompt, userMessage, {
    adId,
    provider,
    reasoningEffort: "low", // Lower effort for refinements
    continueConversation: true,
  });
}
