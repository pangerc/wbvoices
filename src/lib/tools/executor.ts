import type { ToolCall, ToolResult } from "./types";
import {
  searchVoices,
  createVoiceDraft,
  createMusicDraft,
  createSfxDraft,
  readAdState,
  setAdTitle,
} from "./implementations";

/**
 * Execute a single tool call and return the result
 */
export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  const { id, function: func } = call;
  const { name, arguments: argsStr } = func;

  try {
    // Parse arguments
    const args = JSON.parse(argsStr);

    // Execute the appropriate tool
    let result: unknown;

    switch (name) {
      case "search_voices":
        result = await searchVoices(args);
        break;

      case "create_voice_draft":
        result = await createVoiceDraft(args);
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

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    // Special handling for search_voices with 0 results
    if (
      name === "search_voices" &&
      Array.isArray((result as { voices?: unknown[] }).voices) &&
      (result as { voices: unknown[] }).voices.length === 0
    ) {
      return {
        tool_call_id: id,
        content: JSON.stringify({
          error: "No voices found matching the criteria",
          suggestion:
            "Try broadening your search (remove accent/style filters, try different gender)",
          voices: [],
          count: 0,
        }),
      };
    }

    return {
      tool_call_id: id,
      content: JSON.stringify(result),
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
export async function executeToolCalls(calls: ToolCall[]): Promise<ToolResult[]> {
  return Promise.all(calls.map((call) => executeToolCall(call)));
}
