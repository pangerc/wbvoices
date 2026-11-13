import {
  ConfirmDialog,
  GlassyInput,
  LoadingSpinner,
  Tooltip,
} from "@/components/ui";
import {
  useIsSourcePlaying,
  usePlaybackActions,
} from "@/hooks/useAudioPlayback";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import type { SfxLibraryAsset, UploadedSfx } from "@/types";
import { TrashIcon } from "@heroicons/react/24/outline";
import { PauseIcon, PlayIcon } from "@heroicons/react/24/solid";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

/** Props for {@link SfxCueLibrary}. */
type SfxCueLibraryProps = {
  /**
   * Makes the cue play the chosen library file. Resolves false when the draft
   * could not be saved.
   */
  onPicked: (upload: UploadedSfx) => Promise<boolean>;
};

/**
 * Where the library list is. `empty` is a
 * library with nothing in it, `no-matches` a search that found nothing.
 */
type LibraryState = "loading" | "ready" | "empty" | "no-matches" | "error";

/** `trackId` prefix of library previews, so unmounting stops only our own. */
const PREVIEW_ID_PREFIX = "sfx-library:";

/** How long typing must pause before the search runs. */
const SEARCH_DEBOUNCE_MS = 300;

/** The library as `GET /api/sfx/library` sends it: dates as ISO strings. */
type LibraryResponse = {
  assets: (Omit<SfxLibraryAsset, "createdAt"> & { createdAt: string })[];
  hasMore: boolean;
};

/** One page of the library, newest first. */
type LibraryPage = {
  assets: SfxLibraryAsset[];
  /** Older matches were left out; narrowing the search finds them. */
  hasMore: boolean;
};

/**
 * Loads the user's newest library files, only those whose name contains
 * `query` when given. Throws with a message fit for the user.
 */
async function fetchLibrary(
  query: string,
  signal: AbortSignal,
): Promise<LibraryPage> {
  const params = query ? `?${new URLSearchParams({ q: query })}` : "";
  const res = await fetch(`/api/sfx/library${params}`, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Failed to load your sound effects`);
  }

  const { assets, hasMore } = body as LibraryResponse;
  return {
    assets: assets.map((asset) => ({
      ...asset,
      createdAt: new Date(asset.createdAt),
    })),
    hasMore,
  };
}

/**
 * A cue's Library option: lists the sound effects the user uploaded to any of
 * their ads — the newest ones, or those matching a search — previews them,
 * and makes the cue play the one they pick.
 */
export function SfxCueLibrary({ onPicked }: SfxCueLibraryProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<LibraryPage>({
    assets: [],
    hasMore: false,
  });
  const [state, setState] = useState<LibraryState>("loading");
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SfxLibraryAsset | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const search = query.trim();

  useEffect(() => {
    const controller = new AbortController();

    // The first load runs at once; a search waits for typing to pause.
    const timer = setTimeout(
      () => {
        fetchLibrary(search, controller.signal)
          .then((loaded) => {
            setPage(loaded);
            setError("");
            setState(
              loaded.assets.length > 0
                ? "ready"
                : search
                  ? "no-matches"
                  : "empty",
            );
          })
          .catch((err) => {
            if (controller.signal.aborted) return;
            setError(err instanceof Error ? err.message : String(err));
            setState("error");
          });
      },
      search ? SEARCH_DEBOUNCE_MS : 0,
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  // A preview outliving the list would keep playing with no way to stop it.
  useEffect(
    () => () => {
      const { currentSource, stop } = useAudioPlaybackStore.getState();
      if (currentSource?.trackId?.startsWith(PREVIEW_ID_PREFIX)) stop();
    },
    [],
  );

  const handlePick = async (asset: SfxLibraryAsset) => {
    setPickingId(asset.assetId);
    setError("");

    const { createdAt: _createdAt, ...upload } = asset;
    if (await onPicked(upload)) return;

    setError("That sound couldn't be added to this draft. Try again.");
    setPickingId(null);
  };

  // Removes the entry only; ads already using the file keep playing it.
  const handleDelete = async (asset: SfxLibraryAsset) => {
    setIsDeleting(true);
    setError("");

    try {
      const res = await fetch(`/api/sfx/library/${asset.assetId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to remove the sound effect");
      }

      const { currentSource, stop } = useAudioPlaybackStore.getState();
      if (currentSource?.trackId === `${PREVIEW_ID_PREFIX}${asset.assetId}`) {
        stop();
      }

      const remaining = page.assets.filter((a) => a.assetId !== asset.assetId);
      setPage((current) => ({ ...current, assets: remaining }));
      if (remaining.length === 0 && !page.hasMore) {
        setState(search ? "no-matches" : "empty");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  // Until something has loaded there is nothing to keep on screen; after
  // that, a new search keeps showing the previous results while it runs.
  const isFirstLoad = state === "loading" && page.assets.length === 0;

  return (
    <div className="space-y-3">
      {/* Nothing to search in an empty library. */}
      {state !== "empty" && (
        <GlassyInput
          type="search"
          aria-label="Search your sound effects"
          placeholder="Search by file name..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Only a changed search refetches (see the effect on `search`).
            if (e.target.value.trim() !== search) setState("loading");
          }}
        />
      )}

      {isFirstLoad && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-gray-400">
          <LoadingSpinner size="sm" />
          Loading your sound effects...
        </div>
      )}

      {state === "empty" && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="mb-1 font-semibold">No sound effects yet</p>
          <p className="text-sm text-gray-400">
            Files you upload are saved here, ready to reuse in any ad.
          </p>
        </div>
      )}

      {state === "no-matches" && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-gray-400">
          No sound effects match &ldquo;{search}&rdquo;
        </div>
      )}

      {(state === "ready" || (state === "loading" && !isFirstLoad)) && (
        <>
          <ul
            className={twMerge(
              "max-h-80 space-y-2 overflow-y-auto transition-opacity",
              state === "loading" && "opacity-50",
            )}
          >
            {page.assets.map((asset) => (
              <SfxLibraryRow
                key={asset.assetId}
                asset={asset}
                disabled={pickingId !== null || isDeleting}
                isPicking={pickingId === asset.assetId}
                onPick={() => handlePick(asset)}
                onDelete={() => setConfirmDelete(asset)}
              />
            ))}
          </ul>

          {page.hasMore && (
            <p className="text-center text-xs text-gray-500">
              Showing the {page.assets.length} most recent
              {search ? " matches" : ""} — search to find older sounds.
            </p>
          )}
        </>
      )}

      <p className={twMerge("mt-4 text-sm text-red-400", !error && "hidden")}>
        {error}
      </p>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        title="Remove from your library?"
        message={
          <>
            &ldquo;{confirmDelete?.filename}&rdquo; will no longer appear in
            your library. Ads that already use it keep playing it.
          </>
        }
        confirmLabel="Remove"
        variant="danger"
        isConfirming={isDeleting}
        onConfirm={async () => {
          if (confirmDelete) await handleDelete(confirmDelete);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

/** Props for {@link SfxLibraryRow}. */
type SfxLibraryRowProps = {
  /** The library file this row shows. */
  asset: SfxLibraryAsset;
  /** Blocks picking while another pick is being saved. */
  disabled: boolean;
  /** This row's pick is being saved. */
  isPicking: boolean;
  /** Makes the cue play this file. */
  onPick: () => void;
  /** Asks to remove this file from the library (the parent confirms). */
  onDelete: () => void;
};

/**
 * One library file: its name, length and upload date, a preview, Use, and
 * remove-from-library.
 */
function SfxLibraryRow({
  asset,
  disabled,
  isPicking,
  onPick,
  onDelete,
}: SfxLibraryRowProps) {
  const previewId = `${PREVIEW_ID_PREFIX}${asset.assetId}`;
  const isPlaying = useIsSourcePlaying("sfx-preview", { trackId: previewId });
  const { play, stop } = usePlaybackActions();

  const togglePreview = () => {
    if (isPlaying) {
      stop();
      return;
    }
    play({ type: "sfx-preview", url: asset.url, trackId: previewId });
  };

  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10">
      <Tooltip content={isPlaying ? "Stop" : "Preview"}>
        <button
          type="button"
          onClick={togglePreview}
          className={twMerge(
            "shrink-0 rounded-lg border p-2 transition-colors",
            isPlaying
              ? "border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              : "border-wb-blue/20 bg-wb-blue/10 text-white hover:bg-wb-blue/20",
          )}
        >
          {isPlaying ? (
            <PauseIcon className="size-3" />
          ) : (
            <PlayIcon className="size-3" />
          )}
        </button>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={asset.filename}>
          {asset.filename}
        </p>
        <p className="text-xs text-gray-500">
          {asset.durationSeconds.toFixed(1)}s •{" "}
          {format(asset.createdAt, "d MMM yyyy")}
        </p>
      </div>

      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-wb-blue-bright px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-wb-blue-bright/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPicking && <LoadingSpinner size="sm" />}
        Use
      </button>

      <Tooltip content="Remove from library">
        <button
          type="button"
          aria-label={`Remove ${asset.filename} from your library`}
          onClick={onDelete}
          disabled={disabled}
          className="shrink-0 rounded-lg border border-transparent p-2 text-gray-500 transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <TrashIcon className="size-4" strokeWidth={2} />
        </button>
      </Tooltip>
    </li>
  );
}
