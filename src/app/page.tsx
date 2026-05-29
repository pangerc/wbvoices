"use client";

import { useBackgroundAnimator } from "@/components/animated-background/animated-background";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { DashboardAppheader } from "@/components/dashboard/DashboardAppHeader";

export default function DashboardPage() {
  useBackgroundAnimator(false);

  return (
    <main className="min-h-screen bg-black text-white flex flex-col overflow-auto">
      <DashboardAppheader />
      <Dashboard />
    </main>
  );
}
