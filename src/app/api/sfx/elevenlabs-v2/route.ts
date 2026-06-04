export const runtime = "edge";

import { createProvider } from "@/lib/providers";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const provider = createProvider("sfx", "elevenlabs");
  return provider.handleRequest(req);
}
