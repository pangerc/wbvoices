export const runtime = "edge";

import { createProvider } from "@/lib/providers";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const provider = createProvider("music", "loudly");
  return provider.handleRequest(req);
}

export async function GET(req: NextRequest) {
  const provider = createProvider("music", "loudly");
  return provider.handleRequest(req);
}
