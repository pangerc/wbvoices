"use client";

import dynamic from "next/dynamic";

const ToneOfVoiceForm = dynamic(
  () => import("@/components/admin/ToneOfVoiceForm").then((m) => m.ToneOfVoiceForm),
  { ssr: false }
);

export default function NewTonePage() {
  return <ToneOfVoiceForm />;
}
