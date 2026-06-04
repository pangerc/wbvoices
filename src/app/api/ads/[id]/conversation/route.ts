/**
 * Conversation History Endpoint
 *
 * Returns filtered conversation messages for display in the UI.
 * Filters out system prompts, tool results, and empty assistant messages.
 */

import { getConversation } from "@/lib/redis/conversation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: adId } = await params;

  const messages = await getConversation(adId);

  // Filter to user requests + user-facing assistant replies. The cap exists
  // to drop pathological CoT dumps (raw tool-call narratives the model
  // sometimes emits before it learns the user-facing format from system
  // prompt). The current MANDATORY REPLY FORMAT routinely produces
  // 400–600-char replies (one-line intro + several `· ` bullets + one-line
  // outro), so the historical 300-char cap was filtering legitimate content
  // and made replies look like they "disappeared" after a refresh.
  const MAX_ASSISTANT_LENGTH = 2000;

  const filtered = messages.filter((msg) => {
    if (msg.role === "user") return true;
    if (msg.role === "assistant" && msg.content?.trim()) {
      return msg.content.length <= MAX_ASSISTANT_LENGTH;
    }
    return false;
  });

  return NextResponse.json({ messages: filtered });
}
