/**
 * Redis operations for Version Streams
 *
 * Provides CRUD operations for immutable version streams with active pointers.
 * Each ad has three independent streams: voices, music, and sound effects.
 *
 * Redis key patterns:
 * - ad:{adId}:meta - Ad metadata
 * - ad:{adId}:{streamType}:versions - Ordered list of version IDs (Redis LIST)
 * - ad:{adId}:{streamType}:active - Currently active version ID (Redis STRING)
 * - ad:{adId}:{streamType}:v:{versionId} - Immutable version data (Redis JSON)
 */

import { getRedisV3 } from "../redis-v3";
import {
  VersionId,
  StreamType,
  VoiceVersion,
  MusicVersion,
  SfxVersion,
  AdMetadata,
} from "@/types/versions";

// ============ Key Builders ============

/**
 * Generate Redis keys for version stream operations
 */
export const AD_KEYS = {
  /** Ad metadata: ad:{adId}:meta */
  meta: (adId: string) => `ad:${adId}:meta`,

  /** Version list: ad:{adId}:voices:versions */
  versions: (adId: string, streamType: StreamType) =>
    `ad:${adId}:${streamType}:versions`,

  /** Active version pointer: ad:{adId}:voices:active */
  active: (adId: string, streamType: StreamType) =>
    `ad:${adId}:${streamType}:active`,

  /** Specific version: ad:{adId}:voices:v:v3 */
  version: (adId: string, streamType: StreamType, versionId: VersionId) =>
    `ad:${adId}:${streamType}:v:${versionId}`,

  /** Mixer state: ad:{adId}:mixer */
  mixer: (adId: string) => `ad:${adId}:mixer`,
} as const;

// ============ Version Creation ============

/**
 * Create a new version in the specified stream
 * Automatically generates next version ID (v1, v2, v3, ...)
 *
 * @param adId - Advertisement ID
 * @param streamType - Which stream (voices, music, or sfx)
 * @param data - Version data (VoiceVersion, MusicVersion, or SfxVersion)
 * @returns Generated version ID
 */
export async function createVersion(
  adId: string,
  streamType: StreamType,
  data: VoiceVersion | MusicVersion | SfxVersion
): Promise<VersionId> {
  const redis = getRedisV3();

  // Generate next version ID
  const versionId = await getNextVersionId(adId, streamType);

  // Save version data
  const versionKey = AD_KEYS.version(adId, streamType, versionId);
  await redis.set(versionKey, JSON.stringify(data));

  // Append to versions list (maintains order)
  const versionsKey = AD_KEYS.versions(adId, streamType);
  await redis.rpush(versionsKey, versionId);

  console.log(`✅ Created ${streamType} version ${versionId} for ad ${adId}`);

  return versionId;
}

/**
 * Generate next version ID using integer increment
 * Format: "v1", "v2", "v3", etc.
 *
 * @param adId - Advertisement ID
 * @param streamType - Which stream
 * @returns Next version ID
 */
async function getNextVersionId(
  adId: string,
  streamType: StreamType
): Promise<VersionId> {
  const redis = getRedisV3();
  const versionsKey = AD_KEYS.versions(adId, streamType);

  // Get current version count
  const versions = await redis.lrange(versionsKey, 0, -1);
  const nextNum = versions.length + 1;

  return `v${nextNum}`;
}

// ============ Version Retrieval ============

/**
 * Get a specific version from a stream
 *
 * @param adId - Advertisement ID
 * @param streamType - Which stream
 * @param versionId - Version ID to retrieve
 * @returns Version data or null if not found
 */
export async function getVersion(
  adId: string,
  streamType: StreamType,
  versionId: VersionId
): Promise<VoiceVersion | MusicVersion | SfxVersion | null> {
  const redis = getRedisV3();
  const versionKey = AD_KEYS.version(adId, streamType, versionId);

  const data = await redis.get(versionKey);

  if (!data) {
    console.warn(
      `⚠️ Version not found: ${streamType} ${versionId} in ad ${adId}`
    );
    return null;
  }

  // Parse JSON string
  return typeof data === "string" ? JSON.parse(data) : data;
}

/**
 * List all version IDs in a stream (ordered by creation)
 *
 * @param adId - Advertisement ID
 * @param streamType - Which stream
 * @returns Array of version IDs (e.g., ["v1", "v2", "v3"])
 */
export async function listVersions(
  adId: string,
  streamType: StreamType
): Promise<VersionId[]> {
  const redis = getRedisV3();
  const versionsKey = AD_KEYS.versions(adId, streamType);

  // Redis LRANGE returns all elements (0 to -1)
  const versions = await redis.lrange(versionsKey, 0, -1);

  return versions as VersionId[];
}

/**
 * Get all versions in a stream with full data
 *
 * @param adId - Advertisement ID
 * @param streamType - Which stream
 * @returns Map of version ID -> version data
 */
export async function getAllVersionsWithData(
  adId: string,
  streamType: StreamType
): Promise<Record<VersionId, VoiceVersion | MusicVersion | SfxVersion>> {
  const versionIds = await listVersions(adId, streamType);

  const versionsData: Record<
    VersionId,
    VoiceVersion | MusicVersion | SfxVersion
  > = {};

  // Load each version (TODO: optimize with mget if needed)
  for (const vId of versionIds) {
    const version = await getVersion(adId, streamType, vId);
    if (version) {
      versionsData[vId] = version;
    }
  }

  return versionsData;
}

// ============ Active Version Management ============

/**
 * Get the currently active version ID for a stream
 *
 * @param adId - Advertisement ID
 * @param streamType - Which stream
 * @returns Active version ID or null if none set
 */
export async function getActiveVersion(
  adId: string,
  streamType: StreamType
): Promise<VersionId | null> {
  const redis = getRedisV3();
  const activeKey = AD_KEYS.active(adId, streamType);

  const activeId = await redis.get(activeKey);

  return activeId as VersionId | null;
}

/**
 * Set the active version for a stream
 * This triggers mixer rebuild in the API layer
 *
 * @param adId - Advertisement ID
 * @param streamType - Which stream
 * @param versionId - Version ID to activate
 */
export async function setActiveVersion(
  adId: string,
  streamType: StreamType,
  versionId: VersionId
): Promise<void> {
  const redis = getRedisV3();

  // Verify version exists
  const version = await getVersion(adId, streamType, versionId);
  if (!version) {
    throw new Error(
      `Cannot activate non-existent version: ${streamType} ${versionId}`
    );
  }

  // Update active pointer
  const activeKey = AD_KEYS.active(adId, streamType);
  await redis.set(activeKey, versionId);

  // Update version status to "active"
  const versionKey = AD_KEYS.version(adId, streamType, versionId);
  const updatedVersion = { ...version, status: "active" as const };
  await redis.set(versionKey, JSON.stringify(updatedVersion));

  console.log(`✅ Activated ${streamType} version ${versionId} for ad ${adId}`);
}

// ============ Version Cloning ============

/**
 * Clone an existing version (creates draft copy)
 * Sets createdBy="fork" and tracks parentVersionId
 *
 * @param adId - Advertisement ID
 * @param streamType - Which stream
 * @param sourceVersionId - Version ID to clone from
 * @returns New version ID
 */
export async function cloneVersion(
  adId: string,
  streamType: StreamType,
  sourceVersionId: VersionId
): Promise<VersionId> {
  const redis = getRedisV3();

  // 1. Load source version
  const sourceVersion = await getVersion(adId, streamType, sourceVersionId);
  if (!sourceVersion) {
    throw new Error(
      `Cannot clone non-existent version: ${streamType} ${sourceVersionId}`
    );
  }

  // 2. Generate new version ID
  const newVersionId = await getNextVersionId(adId, streamType);

  // 3. Create cloned version with fork metadata
  const clonedVersion = {
    ...sourceVersion,
    createdAt: Date.now(),
    createdBy: "fork" as const,
    status: "draft" as const,
    parentVersionId: sourceVersionId,
  };

  // 4. Save cloned version
  const versionKey = AD_KEYS.version(adId, streamType, newVersionId);
  await redis.set(versionKey, JSON.stringify(clonedVersion));

  // 5. Add to versions list
  const listKey = AD_KEYS.versions(adId, streamType);
  await redis.rpush(listKey, newVersionId);

  console.log(
    `✅ Cloned ${streamType} ${sourceVersionId} → ${newVersionId} for ad ${adId}`
  );

  return newVersionId;
}

// ============ Version Updates ============

/**
 * Update a version (rare - versions are mostly immutable)
 * Primarily used for updating status or adding generated URLs
 *
 * @param adId - Advertisement ID
 * @param streamType - Which stream
 * @param versionId - Version ID to update
 * @param updates - Partial updates to apply
 */
export async function updateVersion(
  adId: string,
  streamType: StreamType,
  versionId: VersionId,
  updates: Partial<VoiceVersion | MusicVersion | SfxVersion>
): Promise<void> {
  const redis = getRedisV3();

  // Load current version
  const currentVersion = await getVersion(adId, streamType, versionId);
  if (!currentVersion) {
    throw new Error(`Version not found: ${streamType} ${versionId}`);
  }

  // Merge updates
  const updatedVersion = { ...currentVersion, ...updates };

  // Save back to Redis
  const versionKey = AD_KEYS.version(adId, streamType, versionId);
  await redis.set(versionKey, JSON.stringify(updatedVersion));

  console.log(`✅ Updated ${streamType} version ${versionId} for ad ${adId}`);
}

// ============ Ad Metadata ============

/**
 * Create or update ad metadata
 *
 * @param adId - Advertisement ID
 * @param metadata - Ad metadata
 */
export async function setAdMetadata(
  adId: string,
  metadata: AdMetadata
): Promise<void> {
  const redis = getRedisV3();
  const metaKey = AD_KEYS.meta(adId);

  await redis.set(metaKey, JSON.stringify(metadata));

  console.log(`✅ Saved metadata for ad ${adId}`);
}

/**
 * Get ad metadata
 *
 * @param adId - Advertisement ID
 * @returns Ad metadata or null if not found
 */
export async function getAdMetadata(adId: string): Promise<AdMetadata | null> {
  const redis = getRedisV3();
  const metaKey = AD_KEYS.meta(adId);

  const data = await redis.get(metaKey);

  if (!data) {
    return null;
  }

  return typeof data === "string" ? JSON.parse(data) : data;
}

// ============ Deletion ============

/**
 * Delete a version from a stream
 * NOTE: Cannot delete active version - must activate another first
 *
 * @param adId - Advertisement ID
 * @param streamType - Which stream
 * @param versionId - Version ID to delete
 */
export async function deleteVersion(
  adId: string,
  streamType: StreamType,
  versionId: VersionId
): Promise<void> {
  const redis = getRedisV3();

  // Prevent deleting active version
  const activeId = await getActiveVersion(adId, streamType);
  if (activeId === versionId) {
    throw new Error(
      `Cannot delete active version ${versionId}. Activate another version first.`
    );
  }

  // Remove from versions list
  const versionsKey = AD_KEYS.versions(adId, streamType);
  await redis.lrem(versionsKey, 1, versionId);

  // Delete version data
  const versionKey = AD_KEYS.version(adId, streamType, versionId);
  await redis.del(versionKey);

  console.log(`✅ Deleted ${streamType} version ${versionId} from ad ${adId}`);
}
