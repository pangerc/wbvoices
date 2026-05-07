"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  PencilIcon,
  PlusIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { GlassyInput } from "@/components/ui/GlassyInput";
import { GlassyTextarea } from "@/components/ui/GlassyTextarea";
import { Switch } from "@/components/ui/Switch";

export type ToneFormInitial = {
  id?: string;
  title: string;
  description: string;
  voiceInstructions: string;
  isActive: boolean;
};

export function ToneOfVoiceForm({ initial }: { initial?: ToneFormInitial }) {
  const router = useRouter();
  const isEdit = !!initial?.id;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [voiceInstructions, setVoiceInstructions] = useState(
    initial?.voiceInstructions ?? "",
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    voiceInstructions.trim().length > 0 &&
    !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        voiceInstructions: voiceInstructions.trim(),
        isActive,
      };
      const url = isEdit
        ? `/api/admin/tone-of-voice/${initial!.id}`
        : "/api/admin/tone-of-voice";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res));
      router.push("/admin/tone-of-voice");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tone");
      setIsSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!title.trim() || !description.trim()) {
      setError(
        "Fill in Title and Description first, then generate instructions.",
      );
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const res = await fetch(
        "/api/admin/tone-of-voice/generate-instructions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        },
      );
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { instructions: string };
      setVoiceInstructions(data.instructions);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate instructions",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            {isEdit ? (
              <PencilIcon className="w-5 h-5 text-white" />
            ) : (
              <PlusIcon className="w-5 h-5 text-white" />
            )}
            <h1 className="text-3xl font-bold">
              {isEdit ? "Edit Tone of Voice" : "New Tone of Voice"}
            </h1>
          </div>
          <p className="text-sm text-gray-400 mt-2 ml-8">
            {isEdit
              ? "Refine how this tone shapes your ad's voice and delivery."
              : "Create a new tone of voice to guide how ads are delivered."}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-medium ${
                isActive ? "text-white" : "text-gray-400"
              }`}
            >
              {isActive ? "Active" : "Inactive"}
            </span>
            <Switch
              checked={isActive}
              onChange={setIsActive}
              aria-label="Tone is active"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Make this tone active/inactive in the brief selector.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block mb-2 text-white text-sm">Title</label>
          <GlassyInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name this tone of voice (e.g. Luxury travel, Retail promo, Cinematic drama)"
          />
        </div>
        <div>
          <label className="block mb-2 text-white text-sm">Description</label>
          <GlassyInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe how this tone should sound and feel. Keep it short and clear."
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block mb-2 text-white text-sm">
          Voice Instructions
          <span className="text-gray-400 font-normal ml-2">
            Fine-tune how this voice is delivered.
          </span>
        </label>
        <GlassyTextarea
          value={voiceInstructions}
          onChange={(e) => setVoiceInstructions(e.target.value)}
          placeholder="Define how the voice should be generated. Include tone, pacing, emotion, pitch, and delivery style. (e.g. 'A relaxed, airy voice with slow pacing and soft intonation. Slight elongation of vowels and natural pauses between phrases.')"
          minRows={6}
        />
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white disabled:opacity-50"
      >
        <SparklesIcon className="w-4 h-4" />
        {isGenerating ? "Generating…" : "Generate instructions with AI"}
      </button>

      {error && (
        <div className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mt-10">
        <Link
          href="/admin/tone-of-voice"
          className="text-sm text-gray-400 hover:text-white underline"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={`px-6 py-2.5 rounded-lg font-medium transition-colors ${
            canSave
              ? "bg-wb-blue hover:bg-wb-blue/80 text-white"
              : "bg-white/10 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isSaving ? "Saving…" : isEdit ? "Save changes" : "Save Tone"}
        </button>
      </div>
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
