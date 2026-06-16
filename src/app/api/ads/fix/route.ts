/**
 * Conversation Ad-Id Backfill API
 *
 * Repairs conversations whose history still references another ad's id. This
 * cleans up data left behind by the duplication flow, which historically
 * failed to remap embedded ad ids (so a copied conversation kept pointing at
 * the source ad).
 *
 * GET /api/ads/fix  - Dry run: report how many ads would be fixed, without
 *                     touching any data.
 * POST /api/ads/fix - Iterate over every ad, rewrite any foreign id to the
 *                     ad's own id, and persist the fixes.
 */

import { toNormalizedAsyncIterator } from "@/core/streams";
import { Ads } from "@/database/ads";
import { saveConversation } from "@/lib/redis/conversation";
import { ConversationMessage } from "@/lib/tool-calling";
import { NextRequest, NextResponse } from "next/server";

/**
 * Rewrites any reference to a foreign ad id (`sourceIds`) with this ad's own
 * id (`destId`) across a conversation, returning whether anything needed
 * changing.
 *
 * With `checkOnly` set, it only reports whether a fix is needed and leaves the
 * conversation untouched (a dry run); otherwise it mutates `conversation` in
 * place so callers can persist it.
 */
function fixConversation(
  conversation: ConversationMessage[],
  sourceIds: string[],
  destId: string,
  checkOnly = false,
) {
  let changed = false;

  conversation.forEach((msg) => {
    sourceIds.forEach((sourceId) => {
      // The ad's own id is legitimate — only remap the others.
      if (sourceId === destId) {
        return;
      }

      if (msg.content.includes(sourceId)) {
        changed = true;

        // On a dry run we've already recorded that a fix is needed, so skip
        // the actual rewrite.
        if (!checkOnly) {
          // Swap the id inside the free-text message body.
          msg.content = msg.content.replaceAll(sourceId, destId);
        }
      }

      // Tool-call arguments are stored as a JSON string, so parse, remap the
      // embedded ad id, then re-serialize.
      msg.tool_calls?.forEach((toolCall) => {
        // On a dry run we don't parse/remap below, so do a cheap substring
        // scan of the raw arguments to detect whether a fix would be needed.
        if (checkOnly) {
          changed ||= toolCall.function.arguments.includes(sourceId);
        }

        const args = JSON.parse(toolCall.function.arguments);

        // Only rewrite calls whose `adId` targets a foreign ad.
        if (args["adId"] && args["adId"] === sourceId) {
          changed = true;

          args["adId"] = destId;
        }

        toolCall.function.arguments = JSON.stringify(args);
      });
    });
  });

  return changed;
}

export async function GET(request: NextRequest) {
  const db = Ads.getInstance();

  // The full set of known ad ids — any of these appearing in a conversation
  // that isn't the ad's own id is treated as a stale, foreign reference.
  const adIds = await toNormalizedAsyncIterator(
    db.getAdIds({ opts: { signal: request.signal } }),
  ).toArray();

  // Every ad's conversation, to be scanned and repaired.
  const ads = await toNormalizedAsyncIterator(
    db.getAdConversations({ opts: { signal: request.signal } }),
  ).toArray();

  // Count of ads whose conversation we actually mutated.
  let shouldFix = 0;

  await Promise.all(
    ads.map(async ({ id, document }) => {
      // Bail out early if the client disconnected mid-backfill.
      if (request.signal.aborted) {
        return;
      }

      const result = fixConversation(document, adIds, id, true);

      if (result) {
        console.log("🛠️", "Fix ad", id);
        shouldFix++;
      }
    }),
  );

  return NextResponse.json({ shouldFix });
}

export async function POST(request: NextRequest) {
  const db = Ads.getInstance();

  // The full set of known ad ids — any of these appearing in a conversation
  // that isn't the ad's own id is treated as a stale, foreign reference.
  const adIds = await toNormalizedAsyncIterator(
    db.getAdIds({ opts: { signal: request.signal } }),
  ).toArray();

  // Every ad's conversation, to be scanned and repaired.
  const ads = await toNormalizedAsyncIterator(
    db.getAdConversations({ opts: { signal: request.signal } }),
  ).toArray();

  // Count of ads whose conversation we actually mutated.
  let fixed = 0;

  await Promise.all(
    ads.map(async ({ id, document }) => {
      // Bail out early if the client disconnected mid-backfill.
      if (request.signal.aborted) {
        return;
      }

      const result = fixConversation(document, adIds, id);

      if (result) {
        fixed++;
      }

      saveConversation(id, document);
    }),
  );

  return NextResponse.json({ fixed });
}
