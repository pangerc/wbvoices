/**
 * Ad Duplication API
 *
 * POST /api/:id/duplicate - Duplicate existing advertisement
 */

import { requireAuth } from "@/lib/auth-helpers";
import { getRedisV3 } from "@/lib/redis-v3";
import { getConversation, saveConversation } from "@/lib/redis/conversation";
import {
  createVersion,
  getActiveVersionData,
  getPreviewData,
  setActiveVersion,
  setAdMetadata,
  setPreviewData,
} from "@/lib/redis/versions";
import { ConversationMessage } from "@/lib/tool-calling";
import { AdMetadata } from "@/types/versions";
import { generateProjectId } from "@/utils/projectId";
import { copy } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

/**
 * Rewrites every reference to the source ad's id with the duplicate's id
 * across a cloned conversation, so the copied history points at the new ad
 * instead of the original. Mutates `conversation` in place.
 */
function replaceConversationAdId(
  conversation: ConversationMessage[],
  sourceId: string,
  destId: string,
) {
  conversation.forEach((msg) => {
    // Swap the id inside the free-text message body.
    msg.content = msg.content.replaceAll(sourceId, destId);

    // Tool-call arguments are stored as a JSON string, so parse, remap the
    // embedded ad id, then re-serialize.
    msg.tool_calls?.forEach((toolCall) => {
      const args = JSON.parse(toolCall.function.arguments);

      // Only rewrite calls whose `adId` targets the source ad.
      if (args["adId"] && args["adId"] === sourceId) {
        args["adId"] = destId;
      }

      toolCall.function.arguments = JSON.stringify(args);
    });
  });
}

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

const USER_ADS_KEY = (email: string) => `ads:by_user:${email}`;

// All ads index (for admin listing)
const ALL_ADS_KEY = "ads:all";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { email } = await requireAuth();

  const { id: duplicatedAdId } = await params;
  const body = await request.json();
  const { name, brief } = body;

  // When the caller intends to regenerate immediately (the "duplicate &
  // generate" path, which redirects to ?auto_generate=1), copying the source's
  // versions is both pointless and harmful: the fresh generation would be
  // blocked by the generate-stream idempotency guard ("ALREADY_GENERATED").
  // So in that mode we produce a clean-slate copy — brief/metadata only, no
  // versions/conversation/preview — and let generation populate it. Plain
  // duplication (regenerate=false) still makes a full, identical copy.
  const regenerate = body.triggerGeneration === true;

  const newAdId = generateProjectId();
  console.log(
    `🚀 [duplicate] Starting duplication ${duplicatedAdId} → ${newAdId} for ${email} (regenerate=${regenerate})`,
  );

  const [voices, music, sfx, mixer, conversation, preview] = await Promise.all([
    regenerate
      ? Promise.resolve(null)
      : getActiveVersionData(duplicatedAdId, "voices"),
    regenerate
      ? Promise.resolve(null)
      : getActiveVersionData(duplicatedAdId, "music"),
    regenerate
      ? Promise.resolve(null)
      : getActiveVersionData(duplicatedAdId, "sfx"),
    regenerate
      ? Promise.resolve(null)
      : getActiveVersionData(duplicatedAdId, "mixer"),
    regenerate ? Promise.resolve([]) : getConversation(duplicatedAdId),
    regenerate ? Promise.resolve(null) : getPreviewData(duplicatedAdId),
  ] as const);
  console.log(
    `📥 [duplicate] Fetched source data — voices:${!!voices} music:${!!music} sfx:${!!sfx} mixer:${!!mixer} conversation:${!!conversation} preview:${!!preview}`,
  );

  // Create ad metadata
  const metadata: AdMetadata = {
    name: name || "Untitled Ad",
    brief: brief || {},
    createdAt: Date.now(),
    lastModified: Date.now(),
    owner: email,
  };
  console.log(`📝 [duplicate] Built metadata for "${metadata.name}"`);

  //
  // Mixer Version: copy the rendered mix blob to a new path so the duplicate
  // is independent of the source ad's blob storage.
  //
  if (mixer?.mixedAudioUrl) {
    const mixedAudioUrl = new URL(
      mixer.mixedAudioUrl.replace(duplicatedAdId, newAdId),
    );

    const result = await copy(mixer.mixedAudioUrl, mixedAudioUrl.pathname, {
      access: "public",
    });

    mixer.mixedAudioUrl = result.url;
    console.log(`🎚️ [duplicate] Copied mixed audio blob → ${result.url}`);
  }

  //
  // Preview
  //
  if (preview) {
    if (preview.logoUrl) {
      const logoUrl = new URL(preview.logoUrl.replace(duplicatedAdId, newAdId));
      const result = await copy(preview.logoUrl, logoUrl.pathname, {
        access: "public",
      });

      preview.logoUrl = result.url;
      console.log(`🖼️ [duplicate] Copied logo blob → ${result.url}`);
    }

    if (preview.visualUrl) {
      const visualUrl = new URL(
        preview.visualUrl.replace(duplicatedAdId, newAdId),
      );

      const result = await copy(preview.visualUrl, visualUrl.pathname, {
        access: "public",
      });

      preview.visualUrl = result.url;
      console.log(`🎨 [duplicate] Copied visual blob → ${result.url}`);
    }
  }

  replaceConversationAdId(conversation, duplicatedAdId, newAdId);

  //
  // Storing everything in Redis
  //
  await Promise.all([
    setAdMetadata(newAdId, metadata),
    preview ? setPreviewData(newAdId, preview) : Promise.resolve(),
    saveConversation(newAdId, conversation),
  ]);
  console.log(
    `💾 [duplicate] Stored metadata, preview & conversation in Redis`,
  );

  //
  // Creating Versions (Voice, Music, SFX, Mixer). v3.5: mixer state is a
  // versioned stream — clone the active mixer version alongside content
  // streams so the duplicate's timeline + anchors render identically.
  //
  // Content versions are created first because the cloned mixer's `pins`
  // still reference the SOURCE ad's version IDs. We must remap them to the
  // freshly-minted IDs before persisting the mixer — otherwise the duplicate
  // renders an empty timeline (stale pins resolve to nothing → 0 tracks).
  // Anchors key off slotIds (preserved by the content clone), so only pins
  // need remapping.
  //
  const [voiceVersion, musicVersion, sfxVersion] = await Promise.all([
    voices
      ? createVersion(newAdId, "voices", voices)
      : Promise.resolve(undefined),
    music ? createVersion(newAdId, "music", music) : Promise.resolve(undefined),
    sfx ? createVersion(newAdId, "sfx", sfx) : Promise.resolve(undefined),
  ]);

  let mixerVersion: string | undefined;
  if (mixer) {
    mixer.pins = {
      voices: voiceVersion ?? mixer.pins?.voices ?? null,
      music: musicVersion ?? mixer.pins?.music ?? null,
      sfx: sfxVersion ?? mixer.pins?.sfx ?? null,
    };
    mixerVersion = await createVersion(newAdId, "mixer", mixer);
  }
  console.log(
    `🌱 [duplicate] Created versions — voices:${voiceVersion ?? "—"} music:${musicVersion ?? "—"} sfx:${sfxVersion ?? "—"} mixer:${mixerVersion ?? "—"} (pins remapped)`,
  );

  //
  // Setting newly created version as active
  //
  await Promise.all([
    voiceVersion
      ? setActiveVersion(newAdId, "voices", voiceVersion)
      : Promise.resolve(),
    musicVersion
      ? setActiveVersion(newAdId, "music", musicVersion)
      : Promise.resolve(),
    sfxVersion
      ? setActiveVersion(newAdId, "sfx", sfxVersion)
      : Promise.resolve(),
    mixerVersion
      ? setActiveVersion(newAdId, "mixer", mixerVersion)
      : Promise.resolve(),
  ]);
  console.log(`✅ [duplicate] Activated versions on new ad`);

  // Add to new owner's index
  const redis = getRedisV3();
  const userAdsKey = USER_ADS_KEY(email);
  const existingAds = (await redis.get<string[]>(userAdsKey)) || [];
  if (!existingAds.includes(newAdId)) {
    await redis.set(userAdsKey, JSON.stringify([...existingAds, newAdId]));
  }
  console.log(`👤 [duplicate] Indexed under user ${email}`);

  // Add to global ads index
  const allAds = (await redis.get<string[]>(ALL_ADS_KEY)) || [];
  await redis.set(ALL_ADS_KEY, JSON.stringify([...allAds, newAdId]));
  console.log(`🌍 [duplicate] Indexed in global ads list`);

  console.log(`🎉 [duplicate] Done — new ad ${newAdId}`);
  return NextResponse.json(
    {
      adId: newAdId,
      meta: metadata,
    },
    { status: 200 },
  );
}
