export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createProvider } from "@/lib/providers";
import { getRegionConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  const regionConfig = getRegionConfig();
  
  // If we're in APAC and need OpenAI proxy, redirect to proxy endpoint
  if (regionConfig.needsOpenAIProxy) {
    console.log('🌏 APAC region detected, redirecting to OpenAI proxy...');
    
    // Forward the request to our proxy endpoint
    const body = await req.json();
    
    const proxyResponse = await fetch(`${req.url.replace('/openai-v2', '/openai-proxy')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });
    
    if (!proxyResponse.ok) {
      const errorData = await proxyResponse.json();
      return NextResponse.json(errorData, { status: proxyResponse.status });
    }
    
    const result = await proxyResponse.json();
    return NextResponse.json(result);
  }
  
  // Americas region or fallback - use direct OpenAI API
  console.log('🌎 Americas region, using direct OpenAI API...');
  const provider = createProvider('voice', 'openai');
  return provider.handleRequest(req);
}