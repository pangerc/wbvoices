"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to voice-manager as the default admin page
    router.replace("/admin/voice-manager");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full"></div>
    </div>
  );
}
