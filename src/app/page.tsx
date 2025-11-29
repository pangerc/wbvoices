"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { generateProjectId } from "@/utils/projectId";

export default function HomePage() {
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Prevent multiple simultaneous redirects
    if (hasRedirected.current) {
      return;
    }

    // Generate adId client-side (no Redis write yet - lazy creation)
    // Ad will be persisted to Redis when user clicks Generate or creates a version
    const adId = generateProjectId();
    console.log(`🚀 Generated client-side adId: ${adId} (not persisted yet)`);

    hasRedirected.current = true;
    router.replace(`/ad/${adId}`);
  }, [router]);

  // Show loading state while creating new project
  return (
    <div className="flex flex-col h-screen bg-black text-white">
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full mx-auto mb-4"></div>
          <p className="text-lg">Setting up your creative workspace...</p>
        </div>
      </div>
    </div>
  );
}