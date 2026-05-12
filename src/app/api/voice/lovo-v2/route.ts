export const runtime = "edge";

import { createProvider } from "@/lib/providers";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const provider = createProvider("voice", "lovo");
  return provider.handleRequest(req);
}
