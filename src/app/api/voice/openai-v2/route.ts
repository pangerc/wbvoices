export const runtime = "edge";

import { NextRequest } from "next/server";
import { createProvider } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const provider = createProvider('voice', 'openai');
  return provider.handleRequest(req);
}