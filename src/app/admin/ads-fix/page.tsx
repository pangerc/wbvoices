"use client";

import dynamic from "next/dynamic";

// Client-only: the admin tool is interactive and stateful with no SEO value,
// so we skip server-side rendering entirely.
const AdsFixAdmin = dynamic(
  () => import("@/components/AdsFixAdmin").then((m) => m.AdsFixAdmin),
  { ssr: false },
);

export default function AdsFixPage() {
  return <AdsFixAdmin />;
}
