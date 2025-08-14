import { NextRequest, NextResponse } from 'next/server';
import { voiceCatalogue } from '@/services/voiceCatalogueService';
import { Language, Provider } from '@/types';

export const runtime = 'edge';

/**
 * API endpoints for voice catalogue operations
 * Client-side hooks will call these instead of Redis directly
 */

export async function GET(req: NextRequest) {
  try {
    // Check Redis config first
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      console.error('❌ Redis environment variables missing:', {
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN,
      });
      return NextResponse.json(
        { error: 'Redis configuration missing' },
        { status: 500 }
      );
    }
    
    const url = new URL(req.url);
    const operation = url.searchParams.get('operation');
    const language = url.searchParams.get('language');
    const accent = url.searchParams.get('accent');
    const provider = url.searchParams.get('provider');
    
    switch (operation) {
      case 'stats': {
        const stats = await voiceCatalogue.getCacheStats();
        return NextResponse.json(stats);
      }
      
      case 'counts': {
        if (!language) {
          return NextResponse.json({ error: 'Language required' }, { status: 400 });
        }
        const counts = await voiceCatalogue.getVoiceCounts(
          language as Language,
          accent || undefined
        );
        return NextResponse.json(counts);
      }
      
      case 'voices': {
        if (!provider || !language) {
          return NextResponse.json({ error: 'Provider and language required' }, { status: 400 });
        }
        const voices = await voiceCatalogue.getVoicesForProvider(
          provider as Provider,
          language as Language,
          accent || undefined
        );
        return NextResponse.json(voices);
      }
      
      case 'by-accent': {
        if (!language || !accent) {
          return NextResponse.json({ error: 'Language and accent required' }, { status: 400 });
        }
        const voices = await voiceCatalogue.getVoicesByAccent(
          language as Language,
          accent
        );
        return NextResponse.json(voices);
      }
      
      default:
        return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
    }
  } catch (error) {
    console.error('Voice catalogue API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}