/**
 * Lazy Ad Creation Helper
 *
 * Ensures an ad exists in Redis, creating it if necessary.
 * Used for lazy ad creation - only persist when meaningful action occurs
 * (Generate clicked or version created manually).
 */

import { getRedisV3 } from "../redis-v3";
import { setAdMetadata, getAdMetadata } from "./versions";
import type { AdMetadata } from "@/types/versions";
import type { ProjectBrief } from "@/types";

// User ads index key pattern (matches /api/ads/route.ts)
const USER_ADS_KEY = (sessionId: string) => `ads:by_user:${sessionId}`;

// All ads index (for future admin listing)
const ALL_ADS_KEY = "ads:all";

/**
 * Ensure an ad exists in Redis, creating it if necessary.
 *
 * This is the single point for lazy ad creation. Call this before:
 * - Running AI generation (primary trigger)
 * - Creating manual versions (secondary trigger)
 *
 * @param adId - Advertisement ID (generated client-side)
 * @param sessionId - User session ID for ownership
 * @param initialBrief - Optional brief data to persist if creating new ad
 * @returns Ad metadata (existing or newly created)
 */
export async function ensureAdExists(
  adId: string,
  sessionId: string,
  initialBrief?: Partial<ProjectBrief>
): Promise<AdMetadata> {
  // Check if ad already exists
  const existingMeta = await getAdMetadata(adId);

  if (existingMeta) {
    return existingMeta;
  }

  // Create new ad metadata
  const metadata: AdMetadata = {
    name: "Untitled Ad",
    brief: (initialBrief || {}) as ProjectBrief,
    createdAt: Date.now(),
    lastModified: Date.now(),
    owner: sessionId,
  };

  // Save to Redis
  await setAdMetadata(adId, metadata);

  // Add to user's ads list
  const redis = getRedisV3();
  const userAdsKey = USER_ADS_KEY(sessionId);
  const existingAds = (await redis.get<string[]>(userAdsKey)) || [];
  if (!existingAds.includes(adId)) {
    await redis.set(userAdsKey, JSON.stringify([...existingAds, adId]));
  }

  // Add to global index
  const allAds = (await redis.get<string[]>(ALL_ADS_KEY)) || [];
  if (!allAds.includes(adId)) {
    await redis.set(ALL_ADS_KEY, JSON.stringify([...allAds, adId]));
  }

  console.log(`✨ Lazy-created ad ${adId} for session ${sessionId}`);

  return metadata;
}
