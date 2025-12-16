import { NextRequest, NextResponse } from "next/server";
import {
  getAllUsage,
  calculateUsagePercent,
  getTotalMonthlyCost,
} from "@/lib/usage/queries";

// OpenAI TTS pricing: ~$15 per 1M characters for gpt-4o-mini-tts
const OPENAI_COST_PER_MILLION_CHARS = 15;

function parseMonth(m: string | null): { month: string; label: string } {
  const now = new Date();
  let year: number;
  let monthNum: number;

  if (m && /^\d{6}$/.test(m)) {
    year = parseInt(m.slice(0, 4), 10);
    monthNum = parseInt(m.slice(4, 6), 10) - 1;
  } else {
    year = now.getUTCFullYear();
    monthNum = now.getUTCMonth();
  }

  const month = `${year}${String(monthNum + 1).padStart(2, "0")}`;
  const label = `${year}-${String(monthNum + 1).padStart(2, "0")}`;

  return { month, label };
}

export async function GET(request: NextRequest) {
  const m = request.nextUrl.searchParams.get("m");
  const { month, label } = parseMonth(m);

  const allUsage = await getAllUsage(month);

  let openaiEstimatedCost = 0;

  // Transform into response format
  const providers = Object.entries(allUsage).map(([key, data]) => {
    const { usage, subscription } = data;

    const used =
      subscription.unit === "tracks"
        ? usage?.tracks || 0
        : usage?.characters || 0;

    // Calculate estimated cost for OpenAI
    let estimatedCost: number | null = null;
    if (key === "openai" && used > 0) {
      estimatedCost = (used / 1_000_000) * OPENAI_COST_PER_MILLION_CHARS;
      estimatedCost = Math.round(estimatedCost * 100) / 100; // 2 decimal places
      openaiEstimatedCost = estimatedCost;
    }

    return {
      id: key,
      name: subscription.name,
      costPerMonth: subscription.costPerMonth,
      allotment: subscription.allotment,
      unit: subscription.unit,
      hasApi: subscription.hasApi,
      used,
      requests: usage?.requests || 0,
      cacheHits: usage?.cacheHits || 0,
      usagePercent: calculateUsagePercent(used, subscription.allotment),
      lastUpdated: usage?.lastUpdated || null,
      estimatedCost,
    };
  });

  const subscriptionCost = getTotalMonthlyCost();

  return NextResponse.json({
    month: label,
    providers,
    totalMonthlyCost: subscriptionCost,
    openaiEstimatedCost,
    totalEstimatedCost: subscriptionCost + openaiEstimatedCost,
    trackingStarted: "2025-12-16",
  });
}
