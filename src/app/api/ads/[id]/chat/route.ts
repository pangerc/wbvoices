/**
 * Chat Endpoint for Iterative Refinements
 *
 * Allows users to refine an existing ad through conversation.
 * Uses lower reasoning effort since we're making targeted changes.
 *
 * Examples:
 * - "Make the music more upbeat"
 * - "Change the second voice to be more energetic"
 * - "Add a whoosh sound effect at the start"
 */

import { NextRequest, NextResponse } from "next/server";
import { continueConversation, type Provider } from "@/lib/tool-calling";
import { normalizeAIModel } from "@/utils/aiModelSelection";
import { hasConversation } from "@/lib/redis/conversation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const body = await req.json();
    const { message, aiModel: rawAiModel } = body;

    // Validate required fields
    if (!message || message.trim() === "") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // Normalize AI model to provider
    const provider = normalizeAIModel(rawAiModel || "openai") as Provider;

    // Check if conversation exists
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

    // Check API key availability
    if (provider === "openai" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }
    if (provider === "moonshot" && !process.env.MOONSHOT_API_KEY) {
      return NextResponse.json(
        { error: "Moonshot API key not configured" },
        { status: 500 }
      );
    }
    if (provider === "qwen" && !process.env.QWEN_API_KEY) {
      return NextResponse.json(
        { error: "Qwen API key not configured" },
        { status: 500 }
      );
    }

    console.log(`[/api/ads/${adId}/chat] Processing refinement request`);
    console.log(`[/api/ads/${adId}/chat] Provider: ${provider}`);
    console.log(`[/api/ads/${adId}/chat] Message: ${message.substring(0, 100)}...`);

    // Continue the conversation with the new message
    const result = await continueConversation(adId, message, provider);

    console.log(`[/api/ads/${adId}/chat] Agent completed with ${result.toolCallHistory.length} tool calls`);
    console.log(`[/api/ads/${adId}/chat] New drafts:`, result.drafts);

    // Return the result
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
