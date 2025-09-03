import { redis } from '@/lib/redis';
import { Provider, Language } from '@/types';
import { accentRegions, normalizeLanguageCode } from '@/utils/language';

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
 * Three mighty towers with region support - clean data architecture!
 */

type VoiceTower = {
  [provider in ActualProvider]: {
    [language: string]: {
      [region: string]: {  // NEW: Region layer
        [accent: string]: string[]; // voice IDs
      }
    }
  }
}

type VoiceDataTower = {
  [voiceKey: string]: UnifiedVoice; // "provider:voiceId" -> voice data
}

type CountsTower = {
  [language: string]: {
    [region: string]: {  // NEW: Region layer
      [accent: string]: VoiceCounts;
    }
  }
}

export class VoiceCatalogueService {
  private readonly TOWER_KEYS = {
    VOICES: 'voice_tower',      // Tower of organized voices
    DATA: 'voice_data_tower',   // Tower of voice details  
    COUNTS: 'counts_tower'      // Tower of counts
  } as const;

  // Helper: Map an accent to its region for a language
  private getRegionForAccent(language: string, accent: string): string {
    const lang = normalizeLanguageCode(language).split('-')[0];
    const regions = accentRegions[lang];
    
    if (!regions) {
      return 'global'; // Default region for languages without regional grouping
    }
    
    // Find which region contains this accent
    for (const [regionCode, accents] of Object.entries(regions)) {
      if (accents.includes(accent)) {
        return regionCode;
      }
    }
    
    // If accent not found in any region, put it in 'other' 
    return 'other';
  }
  
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
    
    // Collect voice IDs from all providers, regions, and accents for this language
    for (const provider of ['elevenlabs', 'lovo', 'openai', 'qwen'] as ActualProvider[]) {
      const languageData = voiceTower[provider]?.[language] || {};
      for (const region of Object.keys(languageData)) {
        const regionData = languageData[region] || {};
        for (const accent of Object.keys(regionData)) {
          allVoiceIds.push(...regionData[accent]);
        }
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
    
    // Collect voice IDs from all providers and regions for this language+accent
    for (const provider of ['elevenlabs', 'lovo', 'openai', 'qwen'] as ActualProvider[]) {
      const languageData = voiceTower[provider]?.[language] || {};
      for (const region of Object.keys(languageData)) {
        const voiceIds = languageData[region]?.[accent] || [];
        allVoiceIds.push(...voiceIds);
      }
    }
    
    // Fetch voice data
    return allVoiceIds
      .map(id => dataTower[id])
      .filter(voice => voice !== undefined);
  }
  
  async getVoiceCounts(language: Language, accent?: string): Promise<VoiceCounts> {
    const countsTower = await redis.get<CountsTower>(this.TOWER_KEYS.COUNTS) || {};
    
    if (accent) {
      // Specific accent counts across all regions - but include all OpenAI voices for any accent
      const totals: VoiceCounts = { elevenlabs: 0, lovo: 0, openai: 0, qwen: 0, any: 0 };
      let openaiTotal = 0;
      
      const languageData = countsTower[language] || {};
      
      // Sum across all regions for this specific accent
      for (const region of Object.keys(languageData)) {
        const regionData = languageData[region] || {};
        const accentCounts = regionData[accent];
        if (accentCounts) {
          totals.elevenlabs += accentCounts.elevenlabs || 0;
          totals.lovo += accentCounts.lovo || 0;
          totals.qwen += accentCounts.qwen || 0;
        }
        
        // For OpenAI, sum ALL accents in this region since they handle accents via instructions
        for (const counts of Object.values(regionData)) {
          openaiTotal += counts.openai || 0;
        }
      }
      
      totals.openai = openaiTotal;
      totals.any = totals.elevenlabs + totals.lovo + totals.openai + totals.qwen;
      return totals;
    } else {
      // Sum all accents and regions for this language
      const languageData = countsTower[language] || {};
      const totals: VoiceCounts = { elevenlabs: 0, lovo: 0, openai: 0, qwen: 0, any: 0 };
      
      for (const region of Object.keys(languageData)) {
        const regionData = languageData[region] || {};
        for (const accentCounts of Object.values(regionData)) {
          totals.elevenlabs += accentCounts.elevenlabs || 0;
          totals.lovo += accentCounts.lovo || 0;
          totals.openai += accentCounts.openai || 0;
          totals.qwen += accentCounts.qwen || 0;
        }
      }
      
      totals.any = totals.elevenlabs + totals.lovo + totals.openai + totals.qwen;
      return totals;
    }
  }

  // 🔥 NEW: Region-aware methods for clean architecture
  async getRegionsForLanguage(language: Language): Promise<string[]> {
    const countsTower = await redis.get<CountsTower>(this.TOWER_KEYS.COUNTS) || {};
    const languageData = countsTower[language] || {};
    return Object.keys(languageData);
  }

  async getVoicesByRegion(language: Language, region: string): Promise<UnifiedVoice[]> {
    const voiceTower = await redis.get<VoiceTower>(this.TOWER_KEYS.VOICES) || {} as VoiceTower;
    const dataTower = await redis.get<VoiceDataTower>(this.TOWER_KEYS.DATA) || {};
    
    const allVoiceIds: string[] = [];
    
    // Collect voice IDs from all providers and accents for this language+region
    for (const provider of ['elevenlabs', 'lovo', 'openai', 'qwen'] as ActualProvider[]) {
      const regionData = voiceTower[provider]?.[language]?.[region] || {};
      for (const accent of Object.keys(regionData)) {
        allVoiceIds.push(...regionData[accent]);
      }
    }
    
    // Fetch voice data
    return allVoiceIds
      .map(id => dataTower[id])
      .filter(voice => voice !== undefined);
  }

  async getVoiceCountsByRegion(language: Language, region: string): Promise<VoiceCounts> {
    const countsTower = await redis.get<CountsTower>(this.TOWER_KEYS.COUNTS) || {};
    const regionData = countsTower[language]?.[region] || {};
    
    const totals: VoiceCounts = { elevenlabs: 0, lovo: 0, openai: 0, qwen: 0, any: 0 };
    
    // Sum all accents in this region
    for (const accentCounts of Object.values(regionData)) {
      totals.elevenlabs += accentCounts.elevenlabs || 0;
      totals.lovo += accentCounts.lovo || 0;
      totals.openai += accentCounts.openai || 0;
      totals.qwen += accentCounts.qwen || 0;
    }
    
    totals.any = totals.elevenlabs + totals.lovo + totals.openai + totals.qwen;
    return totals;
  }

  // 🗡️ THE DRAGON SLAYER: Single method to replace all three provider list builders
  async getProviderOptions(filters: {
    language: Language;
    region?: string;
    excludeProviders?: Provider[];
  }): Promise<Array<{ provider: Provider; count: number; label: string; disabled?: boolean }>> {
    
    let counts: VoiceCounts;
    
    if (filters.region) {
      // Get region-specific counts
      counts = await this.getVoiceCountsByRegion(filters.language, filters.region);
      
      // OpenAI voices are global - get their actual count regardless of region
      const openAIVoices = await this.getVoicesForProvider('openai', filters.language);
      counts.openai = openAIVoices.length;
    } else {
      // Get all counts for language
      counts = await this.getVoiceCounts(filters.language);
    }
    
    const excludeProviders = filters.excludeProviders || [];
    const totalVoices = counts.elevenlabs + counts.openai + counts.qwen + 
      (excludeProviders.includes('lovo') ? 0 : counts.lovo);
    
    const options = [
      {
        provider: 'any' as Provider,
        count: totalVoices,
        label: `Any Provider (${totalVoices} voices)`,
        disabled: totalVoices === 0
      },
      {
        provider: 'elevenlabs' as Provider,
        count: counts.elevenlabs,
        label: `ElevenLabs (${counts.elevenlabs} voices)`,
        disabled: counts.elevenlabs === 0
      },
      {
        provider: 'openai' as Provider,
        count: counts.openai,
        label: `OpenAI (${counts.openai} voices)`,
        disabled: counts.openai === 0
      },
      {
        provider: 'qwen' as Provider,
        count: counts.qwen,
        label: `Qwen (${counts.qwen} voices)`,
        disabled: counts.qwen === 0
      }
    ];

    // Add Lovo only if not excluded
    if (!excludeProviders.includes('lovo')) {
      options.splice(2, 0, {
        provider: 'lovo' as Provider,
        count: counts.lovo,
        label: `Lovo (${counts.lovo} voices)`,
        disabled: counts.lovo === 0
      });
    }
    
    return options.filter(option => !excludeProviders.includes(option.provider));
  }
  
  async getVoicesForProvider(
    provider: Provider, 
    language: Language, 
    accent?: string
  ): Promise<UnifiedVoice[]> {
    const voiceTower = await redis.get<VoiceTower>(this.TOWER_KEYS.VOICES) || {} as VoiceTower;
    const dataTower = await redis.get<VoiceDataTower>(this.TOWER_KEYS.DATA) || {};
    
    const voiceIds: string[] = [];
    
    if (provider === 'any') {
      // Get voices from all providers across all regions
      for (const actualProvider of ['elevenlabs', 'lovo', 'openai', 'qwen'] as ActualProvider[]) {
        const languageData = voiceTower[actualProvider]?.[language] || {};
        for (const region of Object.keys(languageData)) {
          const regionData = languageData[region] || {};
          if (accent) {
            voiceIds.push(...(regionData[accent] || []));
          } else {
            for (const accentVoices of Object.values(regionData)) {
              voiceIds.push(...accentVoices);
            }
          }
        }
      }
    } else {
      // Specific provider across all regions
      const actualProvider = provider as ActualProvider;
      const languageData = voiceTower[actualProvider]?.[language] || {};
      
      for (const region of Object.keys(languageData)) {
        const regionData = languageData[region] || {};
        
        if (accent) {
          // For OpenAI, always include all voices regardless of accent
          // since OpenAI handles accents via instructions parameter
          if (actualProvider === 'openai') {
            for (const accentVoices of Object.values(regionData)) {
              voiceIds.push(...accentVoices);
            }
          } else {
            // For other providers, filter by specific accent
            voiceIds.push(...(regionData[accent] || []));
          }
        } else {
          // All accents for this provider and language
          for (const accentVoices of Object.values(regionData)) {
            voiceIds.push(...accentVoices);
          }
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
    console.log('🏰 BUILDING MAGNIFICENT TOWERS WITH REGIONS...');
    
    // Initialize our towers
    const voiceTower: VoiceTower = {
      elevenlabs: {},
      lovo: {},
      openai: {},
      qwen: {}
    } as VoiceTower;
    
    const dataTower: VoiceDataTower = {};
    const countsTower: CountsTower = {};
    
    // Process each voice and organize into towers
    for (const voice of voices) {
      const voiceKey = `${voice.provider}:${voice.id}`;
      const region = this.getRegionForAccent(voice.language, voice.accent);
      
      // Store in data tower
      dataTower[voiceKey] = voice;
      
      // Organize in voice tower with region layer
      if (!voiceTower[voice.provider][voice.language]) {
        voiceTower[voice.provider][voice.language] = {};
      }
      if (!voiceTower[voice.provider][voice.language][region]) {
        voiceTower[voice.provider][voice.language][region] = {};
      }
      if (!voiceTower[voice.provider][voice.language][region][voice.accent]) {
        voiceTower[voice.provider][voice.language][region][voice.accent] = [];
      }
      voiceTower[voice.provider][voice.language][region][voice.accent].push(voiceKey);
      
      // Update counts tower with region layer
      if (!countsTower[voice.language]) {
        countsTower[voice.language] = {};
      }
      if (!countsTower[voice.language][region]) {
        countsTower[voice.language][region] = {};
      }
      if (!countsTower[voice.language][region][voice.accent]) {
        countsTower[voice.language][region][voice.accent] = { elevenlabs: 0, lovo: 0, openai: 0, qwen: 0, any: 0 };
      }
      countsTower[voice.language][region][voice.accent][voice.provider]++;
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
    
    const byProvider: VoiceCounts = { elevenlabs: 0, lovo: 0, openai: 0, qwen: 0, any: 0 };
    
    for (const voice of voices) {
      byProvider[voice.provider]++;
    }
    
    byProvider.any = byProvider.elevenlabs + byProvider.lovo + byProvider.openai + byProvider.qwen;
    
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