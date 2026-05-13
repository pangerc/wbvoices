"use client";

import type { ToneFormInitial } from "@/components/admin/ToneOfVoiceForm";
import dynamic from "next/dynamic";
import { use, useEffect, useState } from "react";

const ToneOfVoiceForm = dynamic(
  () =>
    import("@/components/admin/ToneOfVoiceForm").then((m) => m.ToneOfVoiceForm),
  { ssr: false },
);

export default function EditTonePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [initial, setInitial] = useState<ToneFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/admin/tone-of-voice/${id}`, {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (abortController.signal.aborted) return;
        setInitial({
          id: data.tone.id,
          title: data.tone.title,
          description: data.tone.description,
          voiceInstructions: data.tone.voiceInstructions,
          isActive: data.tone.isActive,
        });
      } catch (err) {
        if (!abortController.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load tone");
        }
      }
    })();
    return () => {
      abortController.abort();
    };
  }, [id]);

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-200">
          {error}
        </div>
      </div>
    );
  }

  if (!initial) {
    return <div className="p-8 text-gray-400">Loading…</div>;
  }

  return <ToneOfVoiceForm initial={initial} />;
}
