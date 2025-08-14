import { NextResponse } from 'next/server';
import { voiceCatalogue, UnifiedVoice } from '@/services/voiceCatalogueService';
import { normalizeLanguageCode } from '@/utils/language';
import { normalizeAccent } from '@/utils/accents';
import { Language } from '@/types';

export const runtime = 'edge';

// Type for voice data from providers
type ProviderVoice = {
  id: string;
  name: string;
  gender?: string;
  language?: string;
  accent?: string;
  description?: string;
  age?: string;
  style?: string;
  sampleUrl?: string;
  use_case?: string;
  isMultilingual?: boolean;
};

/**
 * 🔥 SECRET WEAPON: Admin endpoint to populate voice cache
 * This builds our fortress in the shadows while the dragon sleeps
 */

// Voice normalization from existing providers
async function fetchAndNormalizeVoices() {
  const voices: UnifiedVoice[] = [];
  const timestamp = Date.now();
  
  console.log('🔄 Fetching voices from all providers...');
  
  // ELEVENLABS - Best quality
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/voice/list?provider=elevenlabs`);
    if (response.ok) {
      const data = await response.json();
      const elevenlabsVoices = data.voices || [];
      
      for (const voice of elevenlabsVoices as ProviderVoice[]) {
        const normalizedLanguage = normalizeLanguageCode(voice.language || 'en');
        const normalizedAccent = normalizeAccent(voice.accent);
        
        voices.push({
          id: voice.id,
          provider: 'elevenlabs',
          catalogueId: `voice:elevenlabs:${voice.id}`,
          name: voice.name,
          displayName: `${voice.name} (ElevenLabs)`,
          gender: (voice.gender === 'male' || voice.gender === 'female') ? voice.gender : 'neutral',
          language: normalizedLanguage as Language,
          accent: normalizedAccent,
          personality: voice.description || undefined,
          age: voice.age || undefined,
          capabilities: {
            supportsEmotional: false, // ElevenLabs uses voice selection for emotion
            supportsWhispering: false,
            isMultilingual: voice.isMultilingual || false
          },
          sampleUrl: voice.sampleUrl,
          useCase: voice.use_case,
          lastUpdated: timestamp
        });
      }
      
      console.log(`✅ ElevenLabs: ${elevenlabsVoices.length} voices`);
    }
  } catch (error) {
    console.error('❌ Failed to fetch ElevenLabs voices:', error);
  }
  
  // LOVO - Wide coverage
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/voice/list?provider=lovo`);
    if (response.ok) {
      const data = await response.json();
      const voicesByLanguage = data.voicesByLanguage || {};
      
      for (const [language, languageVoices] of Object.entries(voicesByLanguage)) {
        const normalizedLanguage = normalizeLanguageCode(language);
        
        for (const voice of languageVoices as ProviderVoice[]) {
          // 🗡️ EXTRACT REGIONAL ACCENT FROM LOVO'S SAMPLE URL!
          let accentToNormalize = voice.accent;
          
          // Lovo hides regional info in sampleUrl - extract it!
          if (voice.sampleUrl && voice.sampleUrl.includes('speaker-tts-samples')) {
            // 🗡️ DRAGON SLAYING REGEX: Extract ANY language-region code!
            const urlMatch = voice.sampleUrl.match(/\/([a-z]{2}-[A-Z]{2})-/);
            if (urlMatch) {
              const originalLanguageCode = urlMatch[1]; // e.g., "es-AR", "ar-SA", "en-US"
              const regionCode = originalLanguageCode.split('-')[1]; // Extract region (AR, SA, US)
              console.log(`🔥 RESCUED REGIONAL ACCENT: ${originalLanguageCode} → ${regionCode} for voice ${voice.name}`);
              
              // Use the region code for accent normalization
              accentToNormalize = regionCode; // AR, MX, SA, etc.
            }
          }
          
          const normalizedAccent = normalizeAccent(accentToNormalize, language);
          
          voices.push({
            id: voice.id,
            provider: 'lovo',
            catalogueId: `voice:lovo:${voice.id}`,
            name: voice.name,
            displayName: `${voice.name} (Lovo)`,
            gender: voice.gender === 'male' ? 'male' : voice.gender === 'female' ? 'female' : 'neutral',
            language: normalizedLanguage as Language,
            accent: normalizedAccent,
            personality: voice.description || undefined,
            age: voice.age || undefined,
            styles: voice.style ? [voice.style] : undefined,
            capabilities: {
              supportsEmotional: true, // Lovo has style system
              supportsWhispering: voice.style?.toLowerCase().includes('whisper') || false,
              isMultilingual: false
            },
            sampleUrl: voice.sampleUrl,
            useCase: voice.use_case,
            lastUpdated: timestamp
          });
        }
      }
      
      console.log(`✅ Lovo: ${voices.filter(v => v.provider === 'lovo').length} voices`);
    }
  } catch (error) {
    console.error('❌ Failed to fetch Lovo voices:', error);
  }
  
  // OPENAI - Fallback
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/voice/list?provider=openai`);
    if (response.ok) {
      const data = await response.json();
      const voicesByLanguage = data.voicesByLanguage || {};
      
      for (const [language, languageVoices] of Object.entries(voicesByLanguage)) {
        const normalizedLanguage = normalizeLanguageCode(language);
        
        for (const voice of languageVoices as ProviderVoice[]) {
          voices.push({
            id: voice.id,
            provider: 'openai',
            catalogueId: `voice:openai:${voice.id}`,
            name: voice.name,
            displayName: `${voice.name} (OpenAI)`,
            gender: (voice.gender === 'male' || voice.gender === 'female') ? voice.gender : 'neutral',
            language: normalizedLanguage as Language,
            accent: 'neutral', // OpenAI doesn't have real accents
            personality: voice.description || undefined,
            age: voice.age || undefined,
            styles: voice.style ? [voice.style] : undefined,
            capabilities: {
              supportsEmotional: true, // OpenAI has text modifiers
              supportsWhispering: true,
              isMultilingual: true
            },
            sampleUrl: voice.sampleUrl,
            useCase: voice.use_case,
            lastUpdated: timestamp
          });
        }
      }
      
      console.log(`✅ OpenAI: ${voices.filter(v => v.provider === 'openai').length} voices`);
    }
  } catch (error) {
    console.error('❌ Failed to fetch OpenAI voices:', error);
  }
  
  return voices;
}

export async function POST() {
  try {
    console.log('🏰 BUILDING VOICE FORTRESS IN THE SHADOWS...');
    
    // Step 1: Clear existing cache
    await voiceCatalogue.clearCache();
    
    // Step 2: Fetch and normalize all voices
    const voices = await fetchAndNormalizeVoices();
    
    if (voices.length === 0) {
      return NextResponse.json({ 
        error: 'No voices fetched from any provider' 
      }, { status: 500 });
    }
    
    // Step 3: Build the magnificent towers!
    console.log(`🏗️ Building magnificent towers with ${voices.length} voices...`);
    
    await voiceCatalogue.buildTowers(voices);
    
    // Step 4: Get final stats
    const stats = await voiceCatalogue.getCacheStats();
    
    console.log('🎯 FORTRESS COMPLETE! Voice cache populated:');
    console.log(`   Total voices: ${stats.totalVoices}`);
    console.log(`   ElevenLabs: ${stats.byProvider.elevenlabs}`);
    console.log(`   Lovo: ${stats.byProvider.lovo}`);
    console.log(`   OpenAI: ${stats.byProvider.openai}`);
    
    return NextResponse.json({
      success: true,
      message: '🔥 Voice fortress erected! The dragon will never see it coming.',
      stats: {
        totalVoices: stats.totalVoices,
        byProvider: stats.byProvider,
        voicesProcessed: voices.length,
        timestamp: Date.now()
      }
    });
    
  } catch (error) {
    console.error('💥 FORTRESS CONSTRUCTION FAILED:', error);
    
    return NextResponse.json({
      error: 'Failed to populate voice cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const stats = await voiceCatalogue.getCacheStats();
    
    return NextResponse.json({
      stats,
      ready: stats.totalVoices > 0,
      message: stats.totalVoices > 0 
        ? '🏰 Voice fortress is ready for battle!' 
        : '⚠️  Voice fortress not built yet. Run POST to build.'
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get cache stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await voiceCatalogue.clearCache();
    
    return NextResponse.json({
      success: true,
      message: '🗑️ Voice fortress demolished. Ready to rebuild!'
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to clear cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}