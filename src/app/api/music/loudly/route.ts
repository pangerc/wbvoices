export const runtime = "edge";

import { NextRequest } from "next/server";
import { createProvider } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const provider = createProvider("music", "loudly");
  return provider.handleRequest(req);
}

export async function GET(req: NextRequest) {
  const provider = createProvider("music", "loudly");
  return provider.handleRequest(req);
}
