/**
 * Chat Endpoint for Iterative Refinements
 *
 * Allows users to refine an existing ad through conversation.
 * Uses lower reasoning effort since we're making targeted changes.
 *
 * Supports stream-focused iterations:
 * - stream: "voices" | "music" | "sfx" - constrains agent to only modify this stream
 * - parentVersionId: version being iterated from (for lineage tracking)
 */

import { NextRequest, NextResponse } from "next/server";
import { continueConversation } from "@/lib/tool-calling";
import { hasConversation } from "@/lib/redis/conversation";
import { updateVersionMetadata, setActiveVersion } from "@/lib/redis/versions";
import type { StreamType } from "@/types/versions";

const STREAM_NAMES: Record<StreamType, string> = {
  voices: "VOICE",
  music: "MUSIC",
  sfx: "SOUND EFFECTS",
};

/**
 * Build a focused message that constrains the agent to a single stream
 */
function buildFocusedMessage(
  message: string,
  stream?: StreamType,
  parentVersionId?: string
): string {
  if (!stream) return message;

  const streamName = STREAM_NAMES[stream];
  const parentContext = parentVersionId
    ? ` You are iterating from version ${parentVersionId}.`
    : "";

  return `[${streamName} ONLY] ${message}

IMPORTANT: Only modify the ${streamName} track. Do NOT touch other streams.${parentContext}
Create a new ${stream === "voices" ? "voice" : stream === "music" ? "music" : "sfx"} draft with the requested changes.`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const body = await req.json();
    const { message, stream, parentVersionId, freezeParent } = body as {
      message: string;
      stream?: StreamType;
      parentVersionId?: string;
      freezeParent?: boolean;
    };

    if (!message || message.trim() === "") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const conversationExists = await hasConversation(adId);
    if (!conversationExists) {
      return NextResponse.json(
        {
          error: "No conversation found for this ad. Generate the ad first using /api/ai/generate",
          adId,
        },
        { status: 400 }
      );
    }

    // Build focused message if stream specified
    const focusedMessage = buildFocusedMessage(message, stream, parentVersionId);

    console.log(`[/api/ads/${adId}/chat] Processing refinement: ${focusedMessage.substring(0, 100)}...`);
    if (stream) {
      console.log(`[/api/ads/${adId}/chat] Stream focus: ${stream}, parent: ${parentVersionId}`);
    }

    // Set parent version as active before creating new draft
    if (freezeParent && parentVersionId && stream) {
      await setActiveVersion(adId, stream, parentVersionId);
      console.log(`[/api/ads/${adId}/chat] Set parent ${parentVersionId} as active`);
    }

    const result = await continueConversation(adId, focusedMessage);

    console.log(`[/api/ads/${adId}/chat] Agent completed with ${result.toolCallHistory.length} tool calls`);
    console.log(`[/api/ads/${adId}/chat] New drafts:`, result.drafts);

    // Update metadata on new versions (if stream was specified)
    if (stream && parentVersionId) {
      const newVersionId = result.drafts[stream];
      if (newVersionId) {
        await updateVersionMetadata(adId, stream, newVersionId, {
          parentVersionId,
          requestText: message, // Original message, not the focused one
        });
        console.log(`[/api/ads/${adId}/chat] Updated lineage: ${parentVersionId} → ${newVersionId}`);
      }
    }

    return NextResponse.json({
      conversationId: result.conversationId,
      drafts: result.drafts,
      message: result.message,
      provider: result.provider,
      toolCalls: result.toolCallHistory.length,
      usage: result.totalUsage,
    });
  } catch (error) {
    console.error("[/api/ads/[id]/chat] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process chat message",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
