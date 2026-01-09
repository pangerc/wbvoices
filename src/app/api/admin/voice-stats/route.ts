import { NextResponse } from 'next/server';
import { voiceCatalogue } from '@/services/voiceCatalogueService';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    // Get overall stats
    const stats = await voiceCatalogue.getCacheStats();

    // Get the counts tower for detailed language breakdown
    const countsTower = await redis.get('counts_tower') as Record<string, Record<string, Record<string, { elevenlabs?: number; lovo?: number; openai?: number; qwen?: number; bytedance?: number; lahajati?: number }>>> || {};
    const languages = Object.keys(countsTower).sort();

    const languageBreakdown: Array<{
      language: string;
      total: number;
      providers: { elevenlabs: number; lovo: number; openai: number; qwen: number; bytedance: number; lahajati: number };
      regionCount: number;
      accentCount: number;
      regions: string[];
      accents: string[];
    }> = [];
    // let totalVoicesByLanguage = 0; // Removed - unused variable

    for (const language of languages) {
      const languageData = countsTower[language];
      const providerTotals = { elevenlabs: 0, lovo: 0, openai: 0, qwen: 0, bytedance: 0, lahajati: 0 };

      // Sum across all regions and accents
      for (const region of Object.keys(languageData)) {
        const regionData = languageData[region];
        for (const accent of Object.keys(regionData)) {
          const counts = regionData[accent];
          providerTotals.elevenlabs += counts.elevenlabs || 0;
          providerTotals.lovo += counts.lovo || 0;
          providerTotals.openai += counts.openai || 0;
          providerTotals.qwen += counts.qwen || 0;
          providerTotals.bytedance += counts.bytedance || 0;
          providerTotals.lahajati += counts.lahajati || 0;
        }
      }

      const languageTotal = providerTotals.elevenlabs + providerTotals.lovo + providerTotals.openai + providerTotals.qwen + providerTotals.bytedance + providerTotals.lahajati;
      // totalVoicesByLanguage += languageTotal; // Removed - unused variable

      // Get unique accents and regions
      const regions = Object.keys(languageData);
      const accents = new Set<string>();
      for (const region of regions) {
        Object.keys(languageData[region]).forEach(accent => accents.add(accent));
      }

      languageBreakdown.push({
        language,
        total: languageTotal,
        providers: providerTotals,
        regionCount: regions.length,
        accentCount: accents.size,
        regions: regions,
        accents: Array.from(accents)
      });
    }

    // Get sample voices
    const dataTower = await redis.get('voice_data_tower') as Record<string, {
      displayName?: string;
      language?: string;
      accent?: string;
      gender?: string;
      provider?: string;
    }> || {};
    const sampleVoices = Object.values(dataTower).slice(0, 5).map((voice) => ({
      name: voice.displayName || 'Unknown',
      language: voice.language || 'Unknown',
      accent: voice.accent || 'Unknown',
      gender: voice.gender || 'Unknown',
      provider: voice.provider || 'Unknown'
    }));

    return NextResponse.json({
      summary: {
        totalVoices: stats.totalVoices,
        totalLanguages: languages.length,
        byProvider: stats.byProvider,
        lastUpdated: stats.lastUpdated
      },
      languages: languageBreakdown,
      sampleVoices
    });

  } catch (error) {
    console.error('Failed to get voice stats:', error);
    return NextResponse.json({
      error: 'Failed to get voice statistics'
    }, { status: 500 });
  }
}