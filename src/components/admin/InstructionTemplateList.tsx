"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PencilIcon, TrashIcon, PlusIcon } from "@heroicons/react/24/outline";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { InstructionTemplate } from "@/lib/db/schema";

type ApiTemplate = Omit<InstructionTemplate, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export function InstructionTemplateList() {
  const [templates, setTemplates] = useState<ApiTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApiTemplate | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/admin/instruction-templates", {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as { templates: ApiTemplate[] };
        if (abortController.signal.aborted) return;
        setTemplates(data.templates);
      } catch (err) {
        if (abortController.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Failed to load templates",
        );
      }
    })();
    return () => {
      abortController.abort();
    };
  }, []);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/instruction-templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readError(res));
      setTemplates((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
      setPendingDelete(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete template",
      );
      setPendingDelete(null);
    } finally {
      setDeletingId(null);
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">Creative Templates</h1>
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-200">
          {error}
        </div>
      </div>
    );
  }

  if (templates === null) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Creative Templates</h1>
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  const activeCount = templates.filter((t) => t.isActive).length;
  const inactiveCount = templates.length - activeCount;
  const isEmpty = templates.length === 0;

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Creative Templates</h1>
        <p className="text-sm text-gray-400 mt-1">
          Strategy presets surfaced in the brief panel. Templates shape the
          script structure, pacing, and music/SFX direction the LLM aims for.
        </p>
        {!isEmpty && (
          <p className="text-sm text-gray-400 mt-2">
            {activeCount} active • {inactiveCount} inactive
          </p>
        )}
      </div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[2fr_3fr_1fr_auto] gap-4 px-5 py-3 text-sm text-gray-400 border-b border-white/10 bg-white/[0.02]">
              <div>Name</div>
              <div>Description</div>
              <div>Category</div>
              <div className="text-right pr-24">Status</div>
            </div>
            <ul className="divide-y divide-white/10">
              {templates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="grid grid-cols-[2fr_3fr_1fr_auto] items-center gap-4 px-5 py-4 hover:bg-white/[0.02]"
                >
                  <div className="font-medium text-white">{tpl.title}</div>
                  <div className="text-sm text-gray-300 italic">
                    {tpl.description}
                  </div>
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300 capitalize">
                      {tpl.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 justify-end">
                    <span
                      className={`text-sm w-16 text-right ${
                        tpl.isActive ? "text-wb-blue" : "text-gray-500"
                      }`}
                    >
                      {tpl.isActive ? "Active" : "Inactive"}
                    </span>
                    <Link
                      href={`/admin/instruction-templates/${tpl.id}/edit`}
                      className="p-2 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                      aria-label={`Edit ${tpl.title}`}
                    >
                      <PencilIcon className="w-4 h-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(tpl)}
                      disabled={deletingId === tpl.id}
                      className="p-2 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 disabled:opacity-50"
                      aria-label={`Delete ${tpl.title}`}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end mt-4">
            <Link
              href="/admin/instruction-templates/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-wb-blue hover:bg-wb-blue/80 text-white font-medium"
            >
              <PlusIcon className="w-4 h-4" /> Add New Template
            </Link>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Delete creative template"
        message={
          <>
            Delete{" "}
            <span className="font-semibold text-white">
              &ldquo;{pendingDelete?.title}&rdquo;
            </span>
            ? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        isConfirming={!!deletingId}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/10 py-16 flex flex-col items-center text-center px-6">
      <h2 className="text-xl font-semibold text-gray-300">
        No Creative Templates defined yet
      </h2>
      <p className="text-gray-400 mt-2 max-w-md">
        Create templates that encode the creative strategy for an ad — script
        structure, pacing, music mood, and SFX direction. Users pick one when
        building a brief.
      </p>
      <Link
        href="/admin/instruction-templates/new"
        className="mt-6 px-5 py-2.5 rounded-lg bg-wb-blue hover:bg-wb-blue/80 text-white font-medium"
      >
        Add Creative Template
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
