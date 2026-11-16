import { LoadingSpinner, UploadIcon } from "@/components/ui";
import { FileUpload, type FileMetadata } from "@/components/ui/FileUpload";
import { FILE_CONFIGS } from "@/lib/upload-configs";
import type { UploadedSfx } from "@/types";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

/** Props for {@link SfxCueUpload}. */
type SfxCueUploadProps = {
  /** The ad being edited; `FileUpload` requires one, though the file is the user's. */
  adId: string;
  /**
   * Makes the cue play the validated upload. Resolves false when the draft
   * could not be saved.
   */
  onUploaded: (upload: UploadedSfx) => Promise<boolean>;
};

type Phase = "idle" | "uploading" | "checking";

const ACCEPT =
  ".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave,audio/mp4,audio/x-m4a";
const MAX_MB = FILE_CONFIGS["custom-sfx"].maxSize / (1024 * 1024);

/**
 * Has the server check a file `FileUpload` already stored. Throws with a
 * message fit for the user when the file is rejected.
 */
async function validateUpload(file: FileMetadata): Promise<UploadedSfx> {
  const res = await fetch("/api/sfx/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: file.url, filename: file.filename }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  return body.upload;
}

/**
 * A cue's Upload option: picks a file, uploads it to the user's User Assets
 * folder, waits for the server to validate it, then makes the cue play it.
 */
export function SfxCueUpload({ adId, onUploaded }: SfxCueUploadProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");

  const handleStart = (name: string) => {
    setFilename(name);
    setError("");
    setPhase("uploading");
  };

  const handleError = (message: string) => {
    setError(message);
    setPhase("idle");
  };

  const handleComplete = async (file: FileMetadata) => {
    setPhase("checking");
    try {
      const upload = await validateUpload(file);
      if (await onUploaded(upload)) return;

      handleError("Your file couldn't be added to this draft. Try again.");
    } catch (err) {
      handleError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const busy = phase !== "idle";

  return (
    <div className="text-center">
      {busy && (
        <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-left">
          <div className="flex items-center gap-4">
            <LoadingSpinner size="md" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-blue-400">
                {phase === "uploading" ? "Uploading..." : "Checking file..."}
              </p>
              <p className="mt-1 truncate text-sm text-gray-400">{filename}</p>
            </div>
          </div>
        </div>
      )}

      <FileUpload
        fileType="custom-sfx"
        projectId={adId}
        accept={ACCEPT}
        onUploadStart={handleStart}
        onUploadError={handleError}
        onUploadComplete={handleComplete}
        disabled={busy}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-6 py-8 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-sm transition-colors hover:bg-white/10"
      >
        <UploadIcon size={32} className="mx-auto mb-3 opacity-70" />
        <p className="mb-2 font-semibold">Upload Sound Effect</p>
        <p className="mb-3 text-sm text-gray-400">Click to choose a file</p>
        <p className="text-xs text-gray-500">
          MP3, WAV or M4A • Max size: {MAX_MB}MB
        </p>
      </FileUpload>

      <p className={twMerge("mt-4 text-sm text-red-400", !error && "hidden")}>
        {error}
      </p>
    </div>
  );
}
