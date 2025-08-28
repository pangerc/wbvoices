import { NextResponse } from 'next/server';
import { getRegionConfig } from '@/lib/config';

/**
 * API endpoint to provide region configuration to client-side components
 */
export async function GET() {
  try {
    const config = getRegionConfig();
    
    // Only expose safe configuration data to client
    const clientConfig = {
      region: config.region,
      isAPAC: config.isAPAC,
      isAmericas: config.isAmericas,
      isEurope: config.isEurope,
      defaultLanguage: config.defaultLanguage,
      availableAIModels: config.availableAIModels,
      needsOpenAIProxy: config.needsOpenAIProxy
      // Note: We don't expose proxyApiUrl or proxyApiKey to client for security
    };
    
    return NextResponse.json(clientConfig);
  } catch (error) {
    console.error('Error getting region config:', error);
    return NextResponse.json(
      { error: 'Failed to get region configuration' },
      { status: 500 }
    );
  }
}