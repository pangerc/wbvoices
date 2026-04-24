"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SuggestedTone } from "@/lib/db/schema";

type ApiTone = Omit<SuggestedTone, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export function ToneOfVoiceList() {
  const [tones, setTones] = useState<ApiTone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTones = async () => {
    try {
      const res = await fetch("/api/admin/tone-of-voice", { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { tones: ApiTone[] };
      setTones(data.tones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tones");
    }
  };

  useEffect(() => {
    loadTones();
  }, []);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete tone "${title}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/tone-of-voice/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setTones((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete tone");
    } finally {
      setDeletingId(null);
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">Tone of Voice</h1>
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-200">
          {error}
        </div>
      </div>
    );
  }

  if (tones === null) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Tone of Voice</h1>
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  const activeCount = tones.filter((t) => t.isActive).length;
  const inactiveCount = tones.length - activeCount;
  const isEmpty = tones.length === 0;

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Tone of Voice</h1>
        {!isEmpty && (
          <p className="text-sm text-gray-400 mt-1">
            {activeCount} active • {inactiveCount} inactive
          </p>
        )}
      </div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[2fr_3fr_auto] gap-4 px-5 py-3 text-sm text-gray-400 border-b border-white/10 bg-white/[0.02]">
              <div>Name</div>
              <div>Description</div>
              <div className="text-right pr-24">Status</div>
            </div>
            <ul className="divide-y divide-white/10">
              {tones.map((tone) => (
                <li
                  key={tone.id}
                  className="grid grid-cols-[2fr_3fr_auto] items-center gap-4 px-5 py-4 hover:bg-white/[0.02]"
                >
                  <div className="font-medium text-white">{tone.title}</div>
                  <div className="text-sm text-gray-300 italic">{tone.description}</div>
                  <div className="flex items-center gap-3 justify-end">
                    <span
                      className={`text-sm w-16 text-right ${
                        tone.isActive ? "text-wb-blue" : "text-gray-500"
                      }`}
                    >
                      {tone.isActive ? "Active" : "Inactive"}
                    </span>
                    <Link
                      href={`/admin/tone-of-voice/${tone.id}/edit`}
                      className="p-2 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                      aria-label={`Edit ${tone.title}`}
                    >
                      <PencilIcon />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(tone.id, tone.title)}
                      disabled={deletingId === tone.id}
                      className="p-2 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 disabled:opacity-50"
                      aria-label={`Delete ${tone.title}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end mt-4">
            <Link
              href="/admin/tone-of-voice/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-wb-blue hover:bg-wb-blue/80 text-white font-medium"
            >
              <PlusIcon /> Add New Tone
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/10 py-16 flex flex-col items-center text-center px-6">
      <h2 className="text-xl font-semibold text-gray-300">No Tone of Voice defined yet</h2>
      <p className="text-gray-400 mt-2 max-w-md">
        Create and manage voice styles that will be available in your campaign briefs.
      </p>
      <Link
        href="/admin/tone-of-voice/new"
        className="mt-6 px-5 py-2.5 rounded-lg bg-wb-blue hover:bg-wb-blue/80 text-white font-medium"
      >
        Add Tone of Voice
      </Link>
    </div>
  );
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === "string" ? body.error : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function PencilIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
