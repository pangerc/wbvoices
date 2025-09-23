// Use Node.js runtime for crypto access
// export const runtime = "edge"; // REMOVED - ByteDance provider needs Node.js crypto

import { NextRequest } from "next/server";
import { createProvider } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const provider = createProvider('voice', 'bytedance');
  return provider.handleRequest(req);
}