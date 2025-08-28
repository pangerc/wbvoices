export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { createProvider } from "@/lib/providers";
import { getRegionConfig } from "@/lib/config";

/**
 * Americas Proxy Server for OpenAI Voice Generation
 * 
 * This endpoint runs in Americas region and processes OpenAI voice requests
 * forwarded from APAC instances where OpenAI API access may be restricted.
 */
export async function POST(req: NextRequest) {
  try {
    const regionConfig = getRegionConfig();
    
    // Validate authorization header
    const authHeader = req.headers.get('Authorization');
    const expectedToken = `Bearer ${regionConfig.proxyApiKey}`;
    
    if (!authHeader || authHeader !== expectedToken) {
      console.error('❌ Unauthorized proxy request:', {
        hasAuth: !!authHeader,
        authMatch: authHeader === expectedToken
      });
      
      return NextResponse.json(
        { error: "Unauthorized proxy request" },
        { status: 401 }
      );
    }
    
    // Validate proxy headers
    const isProxyRequest = req.headers.get('X-Proxy-Request') === 'true';
    const sourceRegion = req.headers.get('X-Region');
    
    if (!isProxyRequest) {
      return NextResponse.json(
        { error: "Invalid proxy request" },
        { status: 400 }
      );
    }
    
    console.log('🌎 Americas Proxy Server: Processing request from', sourceRegion);
    
    const body = await req.json();
    
    // Validate required fields
    if (!body.text || !body.voiceId) {
      return NextResponse.json(
        { error: "Missing required fields: text, voiceId" },
        { status: 400 }
      );
    }
    
    console.log('🎙️ Processing OpenAI voice generation via proxy:', {
      sourceRegion,
      voiceId: body.voiceId,
      textLength: body.text?.length,
      hasStyle: !!body.style,
      hasVoiceInstructions: !!body.voiceInstructions
    });
    
    // Create OpenAI provider and process the request
    const provider = createProvider('voice', 'openai');
    
    // Create a new NextRequest object with the body
    const proxyRequest = new NextRequest(req.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });
    
    const startTime = Date.now();
    const response = await provider.handleRequest(proxyRequest);
    const duration = Date.now() - startTime;
    
    console.log(`⏱️ OpenAI voice generation completed in ${duration}ms`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ OpenAI voice generation failed:', errorData);
      
      return NextResponse.json(errorData, { status: response.status });
    }
    
    const result = await response.json();
    
    console.log('✅ OpenAI voice generated successfully via proxy:', {
      hasAudioUrl: !!result.audio_url,
      provider: result.provider,
      voiceId: result.voice_id,
      blobSize: result.blob_info?.size
    });
    
    // Return the result with proxy metadata
    return NextResponse.json({
      ...result,
      proxy_metadata: {
        source_region: sourceRegion,
        processed_by: 'americas',
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error in OpenAI proxy server:', error);
    
    return NextResponse.json(
      {
        error: "Proxy processing failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}