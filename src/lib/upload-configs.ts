/**
 * Per-file-type upload rules, shared by the upload-token route, the client and
 * the server-side audio validation.
 *
 * These are the only place the limits live, so `FileUpload`'s client-side
 * pre-check and the server's validation can't drift apart.
 */

export const FILE_CONFIGS = {
  "preview-logo": {
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
    maxSize: 5 * 1024 * 1024,
    prefix: "preview-logo",
  },
  "preview-visual": {
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSize: 10 * 1024 * 1024,
    prefix: "preview-visual",
  },
  "custom-music": {
    allowedTypes: [
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/mp3",
      "audio/mp4",
      "audio/x-m4a",
      "audio/aac",
      "audio/m4a",
    ],
    maxSize: 50 * 1024 * 1024,
    prefix: "custom-music",
  },
  // A user's own sound effect. Stored under their User Assets folder (see
  // `ownerPrefix` in `uploadPath`); `/api/sfx/upload` re-validates the stored
  // bytes before it can be used, so these MIME types are only a first filter.
  "custom-sfx": {
    allowedTypes: [
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/wave",
      "audio/vnd.wave",
      "audio/mp3",
      "audio/mp4",
      "audio/x-m4a",
      "audio/m4a",
    ],
    maxSize: 5 * 1024 * 1024,
    prefix: "custom-sfx",
  },
} as const;

export type UploadFileType = keyof typeof FILE_CONFIGS;

export function isUploadFileType(value: unknown): value is UploadFileType {
  return typeof value === "string" && value in FILE_CONFIGS;
}

/**
 * Check a proposed upload against its type's rules. Returns an error message
 * suitable for showing the user, or `null` when it's acceptable.
 */
export function validateUpload({
  fileType,
  contentType,
  fileSize,
}: {
  fileType: UploadFileType;
  contentType?: string;
  fileSize?: number;
}): string | null {
  const config = FILE_CONFIGS[fileType];

  if (
    contentType &&
    !(config.allowedTypes as readonly string[]).includes(contentType)
  ) {
    return `Invalid file format (${contentType}). Allowed: ${config.allowedTypes.join(", ")}`;
  }
  if (fileSize && fileSize > config.maxSize) {
    return `File too large. Max size: ${config.maxSize / (1024 * 1024)}MB`;
  }
  return null;
}

/**
 * Blob pathname for a new upload. The timestamp keeps repeat uploads of the
 * same file from clobbering each other.
 */
export function uploadPath({
  fileType,
  projectId,
  ownerPrefix,
  originalFilename,
  timestamp,
}: {
  fileType: UploadFileType;
  projectId: string;
  /**
   * Folder of a user-owned upload (`userSfxFolder`). When set, the upload
   * belongs to the user rather than the project, so `projectId` is not used.
   */
  ownerPrefix?: string;
  originalFilename?: string;
  /** Injected so the caller controls the clock (and tests can pin it). */
  timestamp: number;
}): string {
  const ext = originalFilename?.split(".").pop() || "bin";
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "bin";
  if (ownerPrefix) {
    return `${ownerPrefix}/${timestamp}.${safeExt}`;
  }
  return `${FILE_CONFIGS[fileType].prefix}-${projectId}-${timestamp}.${safeExt}`;
}
