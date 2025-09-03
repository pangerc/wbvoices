import { NextRequest, NextResponse } from 'next/server';
import { voiceCatalogue } from '@/services/voiceCatalogueService';
import { Voice, Language } from '@/types';

/**
 * 🔥 VOICE RESTORATION API
 * Direct voice loading for project restoration without race conditions
 * Bypasses voice manager state complexity entirely
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { voiceIds, language } = body;

    if (!voiceIds || !Array.isArray(voiceIds)) {
      return NextResponse.json(
        { error: 'voiceIds array required' }, 
        { status: 400 }
      );
    }

    if (!language) {
      return NextResponse.json(
        { error: 'language required' }, 
        { status: 400 }
      );
    }

    console.log(`🔄 Restoring ${voiceIds.length} voices for language=${language}`);

    // Load all voices for the language from all providers
    const providers = ['elevenlabs', 'openai', 'qwen'] as const;
    const allVoices: Voice[] = [];

    for (const provider of providers) {
      try {
        const providerVoices = await voiceCatalogue.getVoicesForProvider(
          provider,
          language,
          undefined // No accent filtering for restoration
        );
        
        // Map to proper Voice type
        const mappedVoices: Voice[] = providerVoices.map((voice: Record<string, unknown>) => ({
          id: voice.id as string,
          name: voice.name as string,
          gender: (voice.gender === 'male' || voice.gender === 'female') ? voice.gender as 'male' | 'female' : null,
          language: voice.language as Language,
          accent: voice.accent as string,
          description: (voice.personality || voice.description) as string,
          age: voice.age as string,
          style: ((voice.styles as string[])?.[0] || voice.style) as string,
          use_case: (voice.useCase || voice.use_case) as string,
          sampleUrl: voice.sampleUrl as string,
          isMultilingual: voice.isMultilingual as boolean
        }));
        
        allVoices.push(...mappedVoices);
      } catch (error) {
        console.error(`Failed to load ${provider} voices for restoration:`, error);
        // Continue with other providers
      }
    }

    // Find the requested voices by ID
    const restoredVoices: Voice[] = [];
    const missingVoiceIds: string[] = [];

    for (const voiceId of voiceIds) {
      const foundVoice = allVoices.find(voice => voice.id === voiceId);
      if (foundVoice) {
        restoredVoices.push(foundVoice);
      } else {
        missingVoiceIds.push(voiceId);
      }
    }

    console.log(`✅ Restored ${restoredVoices.length}/${voiceIds.length} voices`);
    
    if (missingVoiceIds.length > 0) {
      console.warn(`⚠️ Missing voices:`, missingVoiceIds);
    }

    return NextResponse.json({
      voices: restoredVoices,
      foundCount: restoredVoices.length,
      requestedCount: voiceIds.length,
      missingVoiceIds: missingVoiceIds.length > 0 ? missingVoiceIds : undefined
    });

  } catch (error) {
    console.error('Voice restoration API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}