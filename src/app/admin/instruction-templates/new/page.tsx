"use client";

import dynamic from "next/dynamic";

const InstructionTemplateForm = dynamic(
  () =>
    import("@/components/admin/InstructionTemplateForm").then(
      (m) => m.InstructionTemplateForm,
    ),
  { ssr: false },
);

export default function NewInstructionTemplatePage() {
  return <InstructionTemplateForm />;
}
