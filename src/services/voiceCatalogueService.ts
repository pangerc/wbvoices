import { redis } from '@/lib/redis';
import { Provider, Language } from '@/types';

// Actual provider types (excluding "any")
type ActualProvider = Exclude<Provider, 'any'>;

export type UnifiedVoice = {
  // Core identifiers
  id: string;                    // Provider-specific ID
  provider: ActualProvider;      // "elevenlabs" | "lovo" | "openai"
  catalogueId: string;          // Redis key: "voice:{provider}:{id}"
  
  // Display properties
  name: string;                  // Original voice name
  displayName: string;           // "Rachel (ElevenLabs)"
  
  // Core properties
  gender: "male" | "female" | "neutral";
  language: Language;            // "es-ES", "ar-SA", etc.
  accent: string;                // REQUIRED: "mexican", "kuwaiti", "american"
  
  // Optional characteristics
  personality?: string;          // "warm", "professional", "energetic"
  age?: string;                 // "young", "middle_aged", "senior"
  
  // Provider capabilities
  styles?: string[];             // Available style options for Lovo
  capabilities?: {
    supportsEmotional: boolean;
    supportsWhispering: boolean;
    isMultilingual: boolean;
  };
  
  // Metadata
  sampleUrl?: string;
  useCase?: string;
  lastUpdated: number;
}

export type VoiceCounts = Record<Provider, number>;

/**
 * 🏰 MAGNIFICENT TOWER ARCHITECTURE 🏰
 * Three mighty towers instead of 1000 scattered keys!
 */

type VoiceTower = {
  [provider in ActualProvider]: {
    [language: string]: {
      [accent: string]: string[]; // voice IDs
    }
  }
}

type VoiceDataTower = {
  [voiceKey: string]: UnifiedVoice; // "provider:voiceId" -> voice data
}

type CountsTower = {
  [language: string]: {
    [accent: string]: VoiceCounts;
  }
}

export class VoiceCatalogueService {
  private readonly TOWER_KEYS = {
    VOICES: 'voice_tower',      // Tower of organized voices
    DATA: 'voice_data_tower',   // Tower of voice details  
    COUNTS: 'counts_tower'      // Tower of counts
  } as const;
  
  // Core operations - Query the magnificent towers
  async getVoice(provider: Provider, voiceId: string): Promise<UnifiedVoice | null> {
    const dataTower = await redis.get<VoiceDataTower>(this.TOWER_KEYS.DATA) || {};
    const voiceKey = `${provider}:${voiceId}`;
    return dataTower[voiceKey] || null;
  }
  
  async getVoicesByLanguage(language: Language): Promise<UnifiedVoice[]> {
    const voiceTower = await redis.get<VoiceTower>(this.TOWER_KEYS.VOICES) || {} as VoiceTower;
    const dataTower = await redis.get<VoiceDataTower>(this.TOWER_KEYS.DATA) || {};
    
    const allVoiceIds: string[] = [];
    
    // Collect voice IDs from all providers and accents for this language
    for (const provider of ['elevenlabs', 'lovo', 'openai'] as ActualProvider[]) {
      const providerVoices = voiceTower[provider]?.[language] || {};
      for (const accent of Object.keys(providerVoices)) {
        allVoiceIds.push(...providerVoices[accent]);
      }
    }
    
    // Fetch voice data
    return allVoiceIds
      .map(id => dataTower[id])
      .filter(voice => voice !== undefined);
  }
  
  async getVoicesByAccent(language: Language, accent: string): Promise<UnifiedVoice[]> {
    const voiceTower = await redis.get<VoiceTower>(this.TOWER_KEYS.VOICES) || {} as VoiceTower;
    const dataTower = await redis.get<VoiceDataTower>(this.TOWER_KEYS.DATA) || {};
    
    const allVoiceIds: string[] = [];
    
    // Collect voice IDs from all providers for this language+accent
    for (const provider of ['elevenlabs', 'lovo', 'openai'] as ActualProvider[]) {
      const voiceIds = voiceTower[provider]?.[language]?.[accent] || [];
      allVoiceIds.push(...voiceIds);
    }
    
    // Fetch voice data
    return allVoiceIds
      .map(id => dataTower[id])
      .filter(voice => voice !== undefined);
  }
  
  async getVoiceCounts(language: Language, accent?: string): Promise<VoiceCounts> {
    const countsTower = await redis.get<CountsTower>(this.TOWER_KEYS.COUNTS) || {};
    
    if (accent) {
      // Specific accent counts
      return countsTower[language]?.[accent] || { elevenlabs: 0, lovo: 0, openai: 0, any: 0 };
    } else {
      // Sum all accents for this language
      const languageCounts = countsTower[language] || {};
      const totals: VoiceCounts = { elevenlabs: 0, lovo: 0, openai: 0, any: 0 };
      
      for (const accentCounts of Object.values(languageCounts)) {
        totals.elevenlabs += accentCounts.elevenlabs || 0;
        totals.lovo += accentCounts.lovo || 0;
        totals.openai += accentCounts.openai || 0;
      }
      
      totals.any = totals.elevenlabs + totals.lovo + totals.openai;
      
      return totals;
    }
  }
  
  async getVoicesForProvider(
    provider: Provider, 
    language: Language, 
    accent?: string
  ): Promise<UnifiedVoice[]> {
    const voiceTower = await redis.get<VoiceTower>(this.TOWER_KEYS.VOICES) || {} as VoiceTower;
    const dataTower = await redis.get<VoiceDataTower>(this.TOWER_KEYS.DATA) || {};
    
    let voiceIds: string[] = [];
    
    if (provider === 'any') {
      // Get voices from all providers
      for (const actualProvider of ['elevenlabs', 'lovo', 'openai'] as ActualProvider[]) {
        if (accent) {
          voiceIds.push(...(voiceTower[actualProvider]?.[language]?.[accent] || []));
        } else {
          const providerLanguage = voiceTower[actualProvider]?.[language] || {};
          for (const accentVoices of Object.values(providerLanguage)) {
            voiceIds.push(...accentVoices);
          }
        }
      }
    } else {
      // Specific provider
      const actualProvider = provider as ActualProvider;
      if (accent) {
        voiceIds = voiceTower[actualProvider]?.[language]?.[accent] || [];
      } else {
        const providerLanguage = voiceTower[actualProvider]?.[language] || {};
        for (const accentVoices of Object.values(providerLanguage)) {
          voiceIds.push(...accentVoices);
        }
      }
    }
    
    // Fetch voice data
    return voiceIds
      .map(id => dataTower[id])
      .filter(voice => voice !== undefined);
  }
  
  // 🏗️ TOWER BUILDING OPERATIONS 🏗️
  async buildTowers(voices: UnifiedVoice[]): Promise<void> {
    console.log('🏰 BUILDING MAGNIFICENT TOWERS...');
    
    // Initialize our towers
    const voiceTower: VoiceTower = {
      elevenlabs: {},
      lovo: {},
      openai: {}
    } as VoiceTower;
    
    const dataTower: VoiceDataTower = {};
    const countsTower: CountsTower = {};
    
    // Process each voice and organize into towers
    for (const voice of voices) {
      const voiceKey = `${voice.provider}:${voice.id}`;
      
      // Store in data tower
      dataTower[voiceKey] = voice;
      
      // Organize in voice tower
      if (!voiceTower[voice.provider][voice.language]) {
        voiceTower[voice.provider][voice.language] = {};
      }
      if (!voiceTower[voice.provider][voice.language][voice.accent]) {
        voiceTower[voice.provider][voice.language][voice.accent] = [];
      }
      voiceTower[voice.provider][voice.language][voice.accent].push(voiceKey);
      
      // Update counts tower
      if (!countsTower[voice.language]) {
        countsTower[voice.language] = {};
      }
      if (!countsTower[voice.language][voice.accent]) {
        countsTower[voice.language][voice.accent] = { elevenlabs: 0, lovo: 0, openai: 0, any: 0 };
      }
      countsTower[voice.language][voice.accent][voice.provider]++;
    }
    
    // Store all three towers atomically
    await Promise.all([
      redis.set(this.TOWER_KEYS.VOICES, voiceTower),
      redis.set(this.TOWER_KEYS.DATA, dataTower), 
      redis.set(this.TOWER_KEYS.COUNTS, countsTower)
    ]);
    
    console.log('🏰 THREE MAGNIFICENT TOWERS ERECTED!');
    console.log(`   Voice Tower: ${Object.keys(voiceTower).length} providers`);
    console.log(`   Data Tower: ${Object.keys(dataTower).length} voices`);
    console.log(`   Counts Tower: ${Object.keys(countsTower).length} languages`);
  }
  
  async clearCache(): Promise<void> {
    // Simple! Just delete our three tower keys
    await Promise.all([
      redis.del(this.TOWER_KEYS.VOICES),
      redis.del(this.TOWER_KEYS.DATA),
      redis.del(this.TOWER_KEYS.COUNTS)
    ]);
    
    console.log('🔥 THE THREE TOWERS HAVE BEEN DEMOLISHED!');
  }
  
  async getCacheStats(): Promise<{
    totalVoices: number;
    byProvider: VoiceCounts;
    lastUpdated?: number;
  }> {
    const dataTower = await redis.get<VoiceDataTower>(this.TOWER_KEYS.DATA) || {};
    const voices = Object.values(dataTower);
    
    const byProvider: VoiceCounts = { elevenlabs: 0, lovo: 0, openai: 0, any: 0 };
    
    for (const voice of voices) {
      byProvider[voice.provider]++;
    }
    
    byProvider.any = byProvider.elevenlabs + byProvider.lovo + byProvider.openai;
    
    return {
      totalVoices: voices.length,
      byProvider,
      lastUpdated: voices.length > 0 ? Math.max(...voices.map(v => v.lastUpdated)) : undefined
    };
  }
  
  // Helper methods
  private async getVoicesByIds(voiceIds: string[]): Promise<UnifiedVoice[]> {
    if (voiceIds.length === 0) return [];
    
    const voicesData = await Promise.all(
      voiceIds.map(id => redis.get<UnifiedVoice>(id))
    );
    
    return voicesData.filter(voice => voice !== null) as UnifiedVoice[];
  }
  
  private deserializeVoice(data: unknown): UnifiedVoice {
    // Since we're storing as JSON objects now, just return the data
    // with proper type casting
    return data as UnifiedVoice;
  }
}

// Singleton instance
export const voiceCatalogue = new VoiceCatalogueService();