// Use Node.js runtime for crypto access
// export const runtime = "edge"; // REMOVED - ByteDance provider needs Node.js crypto

import { createProvider } from "@/lib/providers";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const provider = createProvider("voice", "bytedance");
  return provider.handleRequest(req);
}
