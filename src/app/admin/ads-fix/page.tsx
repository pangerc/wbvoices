"use client";

import dynamic from "next/dynamic";

// Client-only: the admin tools are interactive and stateful with no SEO value,
// so we skip server-side rendering entirely.
const AdsFixAdmin = dynamic(
  () => import("@/components/AdsFixAdmin").then((m) => m.AdsFixAdmin),
  { ssr: false },
);

const AdsLeftoversFix = dynamic(
  () => import("@/components/AdsLeftoversFix").then((m) => m.AdsLeftoversFix),
  { ssr: false },
);

export default function AdsFixPage() {
  return (
    <div className="min-h-screen bg-wb-almost-black pb-8 text-white">
      <AdsFixAdmin />
      <div className="px-8">
        <AdsLeftoversFix />
      </div>
    </div>
  );
}
