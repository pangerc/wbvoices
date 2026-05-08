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
import { AdMetadata } from "@/types/versions";
import { generateProjectId } from "@/utils/projectId";
import { copy } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

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

  const newAdId = generateProjectId();
  console.log(
    `🚀 [duplicate] Starting duplication ${duplicatedAdId} → ${newAdId} for ${email}`,
  );

  const [voices, music, sfx, mixer, conversation, preview] = await Promise.all([
    getActiveVersionData(duplicatedAdId, "voices"),
    getActiveVersionData(duplicatedAdId, "music"),
    getActiveVersionData(duplicatedAdId, "sfx"),
    getActiveVersionData(duplicatedAdId, "mixer"),
    getConversation(duplicatedAdId),
    getPreviewData(duplicatedAdId),
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
  const [voiceVersion, musicVersion, sfxVersion, mixerVersion] =
    await Promise.all([
      voices ? createVersion(newAdId, "voices", voices) : Promise.resolve(),
      music ? createVersion(newAdId, "music", music) : Promise.resolve(),
      sfx ? createVersion(newAdId, "sfx", sfx) : Promise.resolve(),
      mixer ? createVersion(newAdId, "mixer", mixer) : Promise.resolve(),
    ]);
  console.log(
    `🌱 [duplicate] Created versions — voices:${voiceVersion ?? "—"} music:${musicVersion ?? "—"} sfx:${sfxVersion ?? "—"} mixer:${mixerVersion ?? "—"}`,
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
