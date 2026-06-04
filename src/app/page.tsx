"use client";

import { useBackgroundAnimator } from "@/components/animated-background/animated-background";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { DashboardAppheader } from "@/components/dashboard/DashboardAppHeader";

export default function DashboardPage() {
  useBackgroundAnimator(false);

  return (
    <main className="flex flex-col h-screen bg-black text-white">
      <DashboardAppheader />
      <div className="flex-1 overflow-auto relative">
        <Dashboard />
      </div>
    </main>
  );
}
