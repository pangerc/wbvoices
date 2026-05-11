"use client";

import dynamic from "next/dynamic";

const ToneOfVoiceList = dynamic(
  () =>
    import("@/components/admin/ToneOfVoiceList").then((m) => m.ToneOfVoiceList),
  { ssr: false },
);

export default function ToneOfVoicePage() {
  return <ToneOfVoiceList />;
}
