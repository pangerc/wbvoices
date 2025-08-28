export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { getRegionConfig } from "@/lib/config";

/**
 * APAC Proxy Client for OpenAI Voice Generation
 * 
 * This endpoint runs in APAC region and forwards OpenAI voice requests
 * to the Americas instance where OpenAI API access is available.
 */
export async function POST(req: NextRequest) {
  try {
    const regionConfig = getRegionConfig();
    
    if (!regionConfig.needsOpenAIProxy) {
      return NextResponse.json(
        { error: "Proxy not needed in this region" },
        { status: 400 }
      );
    }
    
    if (!regionConfig.proxyApiUrl || !regionConfig.proxyApiKey) {
      console.error('❌ Missing proxy configuration:', {
        hasProxyApiUrl: !!regionConfig.proxyApiUrl,
        hasProxyApiKey: !!regionConfig.proxyApiKey
      });
      
      return NextResponse.json(
        { error: "Proxy configuration missing" },
        { status: 500 }
      );
    }
    
    console.log('🌏 APAC OpenAI Proxy: Forwarding request to Americas instance...');
    
    const body = await req.json();
    const proxyUrl = `${regionConfig.proxyApiUrl}/api/proxy/openai-voice`;
    
    console.log('📡 Proxy URL:', proxyUrl);
    console.log('🔑 Using proxy API key:', regionConfig.proxyApiKey?.substring(0, 10) + '...');
    
    const startTime = Date.now();
    
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${regionConfig.proxyApiKey}`,
        'X-Region': 'apac',
        'X-Proxy-Request': 'true'
      },
      body: JSON.stringify(body)
    });
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ Proxy request completed in ${duration}ms`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Proxy request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      
      return NextResponse.json(
        { 
          error: `Proxy request failed: ${response.status} ${response.statusText}`,
          details: errorText
        },
        { status: response.status }
      );
    }
    
    const result = await response.json();
    
    console.log('✅ OpenAI voice generated via proxy:', {
      hasAudioUrl: !!result.audio_url,
      provider: result.provider,
      voiceId: result.voice_id
    });
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ Error in OpenAI proxy client:', error);
    
    return NextResponse.json(
      {
        error: "Proxy request failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}