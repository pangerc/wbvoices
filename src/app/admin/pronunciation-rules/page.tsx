"use client";

import dynamic from "next/dynamic";

const PronunciationEditor = dynamic(
  () => import("@/components/PronunciationEditor").then((m) => m.PronunciationEditor),
  { ssr: false }
);

export default function PronunciationRulesPage() {
  return <PronunciationEditor />;
}
