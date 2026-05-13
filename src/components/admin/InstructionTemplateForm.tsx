"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  PaperClipIcon,
  XMarkIcon,
  DocumentIcon,
} from "@heroicons/react/24/outline";
import { GlassyInput } from "@/components/ui/GlassyInput";
import { GlassyTextarea } from "@/components/ui/GlassyTextarea";
import { GlassyListbox } from "@/components/ui/GlassyListbox";
import { Switch } from "@/components/ui/Switch";
import {
  CATEGORIES,
  PACINGS,
  type TemplateCategory,
  type TemplatePacing,
} from "@/lib/instructionTemplateValidation";

// Form-only union: "" represents the "no default" UI state, normalised to
// null on submit. The server type stays as `TemplatePacing` (no empty).
export type TemplatePacingFormValue = TemplatePacing | "";

// Re-export so existing consumers (edit page) don't change their import path.
export type { TemplateCategory };

// Labels are UI-only — runtime allowlist lives in the validation module.
// Using `Record<TemplateCategory, ...>` makes a missing label a compile error
// if CATEGORIES gains a new entry without the form being updated.
const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  duration: "Duration",
  audience: "Audience",
  experience: "Experience",
  general: "General",
};
const CATEGORY_OPTIONS = CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

const PACING_LABELS: Record<TemplatePacing, string> = {
  fast: "Fast",
  normal: "Normal",
};
const PACING_OPTIONS: { value: TemplatePacingFormValue; label: string }[] = [
  { value: "", label: "No default — keep brief's pacing" },
  ...PACINGS.map((value) => ({ value, label: PACING_LABELS[value] })),
];

// Mirrors src/lib/document-extraction.ts limits — keep them in sync.
const REFERENCE_ACCEPT = ".pdf,.docx,.md,.markdown,.txt,.csv,.xlsx,.xls,.xlsm";
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const MAX_REFERENCE_FILES = 10;

export type InstructionTemplateFormInitial = {
  id?: string;
  title: string;
  description: string;
  category: TemplateCategory;
  systemInstructions: string;
  exampleOutput: string;
  defaultPacing: TemplatePacingFormValue;
  defaultCta: string;
  defaultDurationSeconds: number | null;
  defaultMusicStyle: string;
  bestPractice: string;
  sortOrder: number;
  isActive: boolean;
};

export function InstructionTemplateForm({
  initial,
}: {
  initial?: InstructionTemplateFormInitial;
}) {
  const router = useRouter();
  const isEdit = !!initial?.id;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<TemplateCategory>(
    initial?.category ?? "general",
  );
  const [systemInstructions, setSystemInstructions] = useState(
    initial?.systemInstructions ?? "",
  );
  const [exampleOutput, setExampleOutput] = useState(
    initial?.exampleOutput ?? "",
  );
  const [defaultPacing, setDefaultPacing] = useState<TemplatePacingFormValue>(
    initial?.defaultPacing ?? "",
  );
  const [defaultCta, setDefaultCta] = useState(initial?.defaultCta ?? "");
  const [defaultDurationSeconds, setDefaultDurationSeconds] = useState<string>(
    initial?.defaultDurationSeconds != null
      ? String(initial.defaultDurationSeconds)
      : "",
  );
  const [defaultMusicStyle, setDefaultMusicStyle] = useState(
    initial?.defaultMusicStyle ?? "",
  );
  const [bestPractice, setBestPractice] = useState(initial?.bestPractice ?? "");
  const [sortOrder, setSortOrder] = useState<number>(initial?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canSave =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    systemInstructions.trim().length > 0 &&
    !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    setIsSaving(true);
    try {
      const trimmedDuration = defaultDurationSeconds.trim();
      const parsedDuration =
        trimmedDuration === "" ? null : Number(trimmedDuration);
      if (
        parsedDuration !== null &&
        (!Number.isFinite(parsedDuration) ||
          !Number.isInteger(parsedDuration) ||
          parsedDuration <= 0)
      ) {
        setError(
          "Default duration must be a positive whole number of seconds.",
        );
        setIsSaving(false);
        return;
      }
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category,
        systemInstructions: systemInstructions.trim(),
        exampleOutput: exampleOutput.trim() || null,
        defaultPacing: defaultPacing === "" ? null : defaultPacing,
        defaultCta: defaultCta.trim() || null,
        defaultDurationSeconds: parsedDuration,
        defaultMusicStyle: defaultMusicStyle.trim() || null,
        bestPractice: bestPractice.trim() || null,
        sortOrder,
        isActive,
      };
      const url = isEdit
        ? `/api/admin/instruction-templates/${initial!.id}`
        : "/api/admin/instruction-templates";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res));
      router.push("/admin/instruction-templates");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
      setIsSaving(false);
    }
  };

  const handleAddFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const next = [...referenceFiles];
    let firstError: string | null = null;
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_REFERENCE_FILES) {
        firstError ??= `Up to ${MAX_REFERENCE_FILES} reference files per generation.`;
        break;
      }
      if (file.size > MAX_REFERENCE_BYTES) {
        firstError ??= `"${file.name}" is over the ${MAX_REFERENCE_BYTES / 1024 / 1024} MB per-file limit.`;
        continue;
      }
      // Dedupe by name+size; re-opening the picker with the same selection
      // would otherwise stack duplicates.
      if (next.some((f) => f.name === file.name && f.size === file.size))
        continue;
      next.push(file);
    }
    setReferenceFiles(next);
    if (firstError) setError(firstError);
    else setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeReferenceFile = (idx: number) => {
    setReferenceFiles((prev) => prev.filter((_, i) => i !== idx));
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
      const url = "/api/admin/instruction-templates/generate-instructions";
      let res: Response;
      if (referenceFiles.length > 0) {
        const form = new FormData();
        form.append("title", title);
        form.append("description", description);
        form.append("category", category);
        for (const file of referenceFiles)
          form.append("files", file, file.name);
        res = await fetch(url, { method: "POST", body: form });
      } else {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, category }),
        });
      }
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as { instructions: string };
      setSystemInstructions(data.instructions);
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
              {isEdit ? "Edit Creative Template" : "New Creative Template"}
            </h1>
          </div>
          <p className="text-sm text-gray-400 mt-2 ml-8">
            {isEdit
              ? "Refine how this template steers the LLM's creative output."
              : "Create a strategy preset that shapes script structure, pacing, music, and SFX."}
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
              aria-label="Template is active"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Show this template in the brief gallery.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block mb-2 text-white text-sm">Title</label>
          <GlassyInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name this template (e.g. Optimized for 15s, Gen Z Oriented)"
          />
        </div>
        <div>
          <label className="block mb-2 text-white text-sm">Description</label>
          <GlassyInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One-line subtitle shown on the gallery card."
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <GlassyListbox
            label="Category"
            value={category}
            onChange={(v) => setCategory(v as TemplateCategory)}
            options={CATEGORY_OPTIONS}
          />
        </div>
        <div>
          <label className="block mb-2 text-white text-sm">
            Sort order
            <span className="text-gray-400 font-normal ml-2">
              Lower numbers appear first.
            </span>
          </label>
          <GlassyInput
            type="number"
            value={String(sortOrder)}
            onChange={(e) => {
              const n = Number(e.target.value);
              setSortOrder(Number.isFinite(n) ? n : 0);
            }}
            placeholder="0"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block mb-2 text-white text-sm">
          System Instructions
          <span className="text-gray-400 font-normal ml-2">
            Appended to the LLM system prompt — directs script structure,
            pacing, music mood, SFX density.
          </span>
        </label>
        <GlassyTextarea
          value={systemInstructions}
          onChange={(e) => setSystemInstructions(e.target.value)}
          placeholder="Open with the hook in the first 3 seconds. Maximum 38 spoken words. Single speaker. Music energetic but non-intrusive — no big builds. Avoid SFX unless one critical sound advances the story."
          minRows={6}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white disabled:opacity-50"
        >
          <SparklesIcon className="w-4 h-4" />
          {isGenerating
            ? "Generating…"
            : referenceFiles.length > 0
              ? `Generate from ${referenceFiles.length} reference${referenceFiles.length === 1 ? "" : "s"} + AI`
              : "Generate instructions with AI"}
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white disabled:opacity-50"
        >
          <PaperClipIcon className="w-4 h-4" />
          Attach references
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={REFERENCE_ACCEPT}
          className="hidden"
          onChange={(e) => handleAddFiles(e.target.files)}
        />
        <span className="text-xs text-gray-400">
          PDF, DOCX, MD, TXT, CSV, XLSX — extracted in-memory, never stored.
        </span>
      </div>

      {referenceFiles.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {referenceFiles.map((file, idx) => (
            <li
              key={`${file.name}-${file.size}-${idx}`}
              className="inline-flex items-center gap-2 pl-2 pr-1 py-1 rounded-md border border-white/10 bg-white/5 text-xs text-white"
            >
              <DocumentIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="max-w-[18rem] truncate" title={file.name}>
                {file.name}
              </span>
              <span className="text-gray-500">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => removeReferenceFile(idx)}
                disabled={isGenerating}
                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 disabled:opacity-50"
                aria-label={`Remove ${file.name}`}
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <label className="block mb-2 text-white text-sm">
          Example output
          <span className="text-gray-400 font-normal ml-2">
            Optional — illustrative script snippet for admins (not sent to LLM).
          </span>
        </label>
        <GlassyTextarea
          value={exampleOutput}
          onChange={(e) => setExampleOutput(e.target.value)}
          placeholder="Sample script that shows what an output following this template looks like."
          minRows={4}
        />
      </div>

      <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-4">
          <h2 className="text-white text-base font-medium">
            Defaults applied to brief
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            When a user picks this template, these values pre-fill the brief.
            All optional — leave blank to keep whatever the user already chose.
            Music style rides directly into the LLM prompt (no UI field for
            music in the brief).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <GlassyListbox
              label="Default pacing"
              value={defaultPacing}
              onChange={(v) => setDefaultPacing(v as TemplatePacingFormValue)}
              options={PACING_OPTIONS}
            />
          </div>
          <div>
            <label className="block mb-2 text-white text-sm">
              Default duration (seconds)
            </label>
            <GlassyInput
              type="number"
              min={1}
              max={600}
              value={defaultDurationSeconds}
              onChange={(e) => setDefaultDurationSeconds(e.target.value)}
              placeholder="e.g. 15 or 30 — blank for no default"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block mb-2 text-white text-sm">
            Default call-to-action
          </label>
          <GlassyInput
            value={defaultCta}
            onChange={(e) => setDefaultCta(e.target.value)}
            placeholder="e.g. 'Sign up today at example.com' — blank for no default"
          />
        </div>

        <div>
          <label className="block mb-2 text-white text-sm">
            Default music style
            <span className="text-gray-400 font-normal ml-2">
              Free text — folded into the LLM system prompt.
            </span>
          </label>
          <GlassyTextarea
            value={defaultMusicStyle}
            onChange={(e) => setDefaultMusicStyle(e.target.value)}
            placeholder="e.g. 'energetic, non-intrusive — no big builds'"
            minRows={2}
          />
        </div>
      </div>

      <div className="mt-6">
        <label className="block mb-2 text-white text-sm">
          Associated best practice
          <span className="text-gray-400 font-normal ml-2">
            Admin notes — which industry best practice this template encodes.
            Not sent to the LLM.
          </span>
        </label>
        <GlassyTextarea
          value={bestPractice}
          onChange={(e) => setBestPractice(e.target.value)}
          placeholder="e.g. 'Spotify: hook the listener in the first 3 seconds; one CTA at the end.'"
          minRows={2}
        />
      </div>

      {error && (
        <div className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mt-10">
        <Link
          href="/admin/instruction-templates"
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
          {isSaving ? "Saving…" : isEdit ? "Save changes" : "Save Template"}
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
