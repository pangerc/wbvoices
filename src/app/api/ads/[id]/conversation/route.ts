/**
 * Conversation History Endpoint
 *
 * Returns filtered conversation messages for display in the UI.
 * Filters out system prompts, tool results, and empty assistant messages.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/redis/conversation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: adId } = await params;

  const messages = await getConversation(adId);

  // Filter to user requests and short assistant reasoning only
  // Long assistant messages (>300 chars) are typically verbose summaries
  // that duplicate what's shown in the main UI
  const MAX_ASSISTANT_LENGTH = 300;

  const filtered = messages.filter((msg) => {
    if (msg.role === "user") return true;
    if (msg.role === "assistant" && msg.content?.trim()) {
      // Only show short reasoning, not verbose summaries
      return msg.content.length <= MAX_ASSISTANT_LENGTH;
    }
    return false;
  });

  return NextResponse.json({ messages: filtered });
}
