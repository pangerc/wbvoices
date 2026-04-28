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
  getMixerState,
  getPreviewData,
  setActiveVersion,
  setAdMetadata,
  setPreviewData,
  updateMixerState,
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

  const [voices, music, sfx, conversation, mixerState, preview] =
    await Promise.all([
      getActiveVersionData(duplicatedAdId, "voices"),
      getActiveVersionData(duplicatedAdId, "music"),
      getActiveVersionData(duplicatedAdId, "sfx"),
      getConversation(duplicatedAdId),
      getMixerState(duplicatedAdId),
      getPreviewData(duplicatedAdId),
    ] as const);

  if (!mixerState || !conversation || !voices || !music || !sfx) {
    return NextResponse.json(
      {
        error: "Failed to duplicate ad",
        details:
          "Ad mixer state / conversation / voices / music / sfx is missing",
      },
      { status: 400 },
    );
  }

  // Create ad metadata
  const metadata: AdMetadata = {
    name: name || "Untitled Ad",
    brief: brief || {},
    createdAt: Date.now(),
    lastModified: Date.now(),
    owner: email,
  };

  //
  // Mixer State Generated Audio
  //
  if (mixerState.mixedAudioUrl) {
    const mixedAudioUrl = new URL(
      mixerState.mixedAudioUrl.replace(duplicatedAdId, newAdId),
    );

    const result = await copy(
      mixerState.mixedAudioUrl,
      mixedAudioUrl.pathname,
      {
        access: "public",
      },
    );

    console.log("mixedAudioUrl", mixedAudioUrl.pathname);

    mixerState.mixedAudioUrl = result.url;
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

      console.log("logoUrl", logoUrl.pathname);

      preview.logoUrl = result.url;
    }

    if (preview.visualUrl) {
      const visualUrl = new URL(
        preview.visualUrl.replace(duplicatedAdId, newAdId),
      );

      const result = await copy(preview.visualUrl, visualUrl.pathname, {
        access: "public",
      });

      console.log("visualUrl", visualUrl.pathname);

      preview.visualUrl = result.url;
    }
  }

  //
  // Storing everything in Redis
  //
  await Promise.all([
    setAdMetadata(newAdId, metadata),
    preview ? setPreviewData(newAdId, preview) : Promise.resolve(),
    updateMixerState(newAdId, mixerState),
    saveConversation(newAdId, conversation),
  ]);

  //
  // Creating Versions (Vocie, Music, SFX)
  //
  const [voiceVersion, musicVersion, sfxVersion] = await Promise.all([
    createVersion(newAdId, "voices", voices),
    createVersion(newAdId, "music", music),
    createVersion(newAdId, "sfx", sfx),
  ]);

  //
  // Setting newly created version as active
  //
  await Promise.all([
    setActiveVersion(newAdId, "voices", voiceVersion),
    setActiveVersion(newAdId, "music", musicVersion),
    setActiveVersion(newAdId, "sfx", sfxVersion),
  ]);

  // Add to new owner's index
  const redis = getRedisV3();
  const userAdsKey = USER_ADS_KEY(email);
  const existingAds = (await redis.get<string[]>(userAdsKey)) || [];
  if (!existingAds.includes(newAdId)) {
    await redis.set(userAdsKey, JSON.stringify([...existingAds, newAdId]));
  }

  // Add to global ads index
  const allAds = (await redis.get<string[]>(ALL_ADS_KEY)) || [];
  await redis.set(ALL_ADS_KEY, JSON.stringify([...allAds, newAdId]));

  return NextResponse.json(
    {
      adId: newAdId,
      meta: metadata,
    },
    { status: 200 },
  );
}
