// Node.js runtime - Qwen TTS can exceed edge's 25s timeout
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { createProvider } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const provider = createProvider('voice', 'qwen');
  return provider.handleRequest(req);
}