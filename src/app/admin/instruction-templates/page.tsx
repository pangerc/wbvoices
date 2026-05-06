"use client";

import dynamic from "next/dynamic";

const InstructionTemplateList = dynamic(
  () =>
    import("@/components/admin/InstructionTemplateList").then(
      (m) => m.InstructionTemplateList
    ),
  { ssr: false }
);

export default function InstructionTemplatesPage() {
  return <InstructionTemplateList />;
}
