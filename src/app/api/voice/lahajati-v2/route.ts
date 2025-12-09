export const runtime = "nodejs";
export const maxDuration = 300; // Pro plan: 5 min for slow Lahajati API

import { NextRequest } from "next/server";
import { createProvider } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const provider = createProvider('voice', 'lahajati');
  return provider.handleRequest(req);
}
