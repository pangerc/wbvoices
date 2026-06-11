import type { KnowledgeContext } from "@/lib/knowledge/types";
import {
  createMusicDraft,
  createSfxDraft,
  createVoiceDraft,
  readAdState,
  searchVoices,
  setAdDuration,
  setAdTitle,
} from "./implementations";
import type { ToolCall, ToolResult } from "./types";

/**
 * Server-side context threaded through the agent executor into specific tool
 * implementations. Not visible to the LLM. Currently only `knowledgeContext`
 * is carried — it gets snapshotted onto new voice versions by
 * `create_voice_draft` so iteration/fork inherit the creative direction
 * pins (pacing/accent/provider/format) that produced the parent.
 */
export interface AgentToolContext {
  knowledgeContext?: KnowledgeContext;
  /**
   * Ad id of the current agent session. Injected into tools that need a
   * stable per-ad seed (e.g. search_voices shuffles its candidate pool on
   * hash(adId + provider + language) so the LLM sees a different first-N
   * per ad while keeping re-runs of the same ad reproducible).
   */
  adId?: string;
}

/**
 * Execute a single tool call and return the result
 */
export async function executeToolCall(
  call: ToolCall,
  agentContext?: AgentToolContext,
): Promise<ToolResult> {
  const { id, function: func } = call;
  const { name, arguments: argsStr } = func;

  try {
    // Parse arguments
    const args = JSON.parse(argsStr);

    // Execute the appropriate tool
    let result: unknown;

    switch (name) {
      case "search_voices":
        // Inject server-side adId so searchVoices can seed its shuffle.
        // LLM never sees adId in the tool schema; it comes from the agent session.
        result = await searchVoices({
          ...args,
          ...(agentContext?.adId ? { adId: agentContext.adId } : {}),
        });
        break;

      case "create_voice_draft":
        // Inject server-side knowledgeContext so the new version snapshots it.
        // LLM never sees this field — it's not in the tool definition schema.
        result = await createVoiceDraft({
          ...args,
          ...(agentContext?.knowledgeContext
            ? { knowledgeContext: agentContext.knowledgeContext }
            : {}),
        });
        break;

      case "create_music_draft":
        result = await createMusicDraft(args);
        break;

      case "create_sfx_draft":
        result = await createSfxDraft(args);
        break;

      case "read_ad_state":
        result = await readAdState(args);
        break;

      case "set_ad_title":
        result = await setAdTitle(args);
        break;

      case "set_ad_duration":
        result = await setAdDuration(args);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    // search_voices auto-broadens server-side when narrow filters return
    // zero (see implementations.ts:searchVoices). The old empty-result
    // suggestion ("try broadening your search") was an invitation for
    // the agent to burn another iteration on the same search; the
    // broadened pool is now returned inline with a `broadened_from`
    // note so the agent has hits to commit on.
    return {
      tool_call_id: id,
      content: JSON.stringify(result),
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      tool_call_id: id,
      content: JSON.stringify({
        error: errorMessage,
        suggestion: "Retry with different parameters or check argument format",
      }),
    };
  }
}

/**
 * Execute multiple tool calls in parallel
 * Tool calls are independent (different Redis keys, different API calls)
 */
export async function executeToolCalls(
  calls: ToolCall[],
  agentContext?: AgentToolContext,
): Promise<ToolResult[]> {
  return Promise.all(calls.map((call) => executeToolCall(call, agentContext)));
}
