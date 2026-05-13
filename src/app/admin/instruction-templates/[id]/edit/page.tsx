"use client";

import type {
  InstructionTemplateFormInitial,
  TemplateCategory,
  TemplatePacing,
} from "@/components/admin/InstructionTemplateForm";
import dynamic from "next/dynamic";
import { use, useEffect, useState } from "react";

const InstructionTemplateForm = dynamic(
  () =>
    import("@/components/admin/InstructionTemplateForm").then(
      (m) => m.InstructionTemplateForm,
    ),
  { ssr: false },
);

export default function EditInstructionTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [initial, setInitial] = useState<InstructionTemplateFormInitial | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/admin/instruction-templates/${id}`, {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (abortController.signal.aborted) return;
        const rawPacing = data.template.defaultPacing ?? "";
        const pacing: TemplatePacing =
          rawPacing === "fast" || rawPacing === "normal" ? rawPacing : "";
        setInitial({
          id: data.template.id,
          title: data.template.title,
          description: data.template.description,
          category: (data.template.category ?? "general") as TemplateCategory,
          systemInstructions: data.template.systemInstructions,
          exampleOutput: data.template.exampleOutput ?? "",
          defaultPacing: pacing,
          defaultCta: data.template.defaultCta ?? "",
          defaultDurationSeconds:
            typeof data.template.defaultDurationSeconds === "number"
              ? data.template.defaultDurationSeconds
              : null,
          defaultMusicStyle: data.template.defaultMusicStyle ?? "",
          bestPractice: data.template.bestPractice ?? "",
          sortOrder: data.template.sortOrder ?? 0,
          isActive: data.template.isActive,
        });
      } catch (err) {
        if (!abortController.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Failed to load template",
          );
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

  return <InstructionTemplateForm initial={initial} />;
}
