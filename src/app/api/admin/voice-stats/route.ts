import { NextResponse } from 'next/server';
import { voiceCatalogue } from '@/services/voiceCatalogueService';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    // Get overall stats
    const stats = await voiceCatalogue.getCacheStats();

    // Get the counts tower for detailed language breakdown
    const countsTower = await redis.get('counts_tower') as any || {};
    const languages = Object.keys(countsTower).sort();

    const languageBreakdown: any[] = [];
    let totalVoicesByLanguage = 0;

    for (const language of languages) {
      const languageData = countsTower[language];
      let providerTotals = { elevenlabs: 0, lovo: 0, openai: 0, qwen: 0, bytedance: 0 };

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
        }
      }

      const languageTotal = providerTotals.elevenlabs + providerTotals.lovo + providerTotals.openai + providerTotals.qwen + providerTotals.bytedance;
      totalVoicesByLanguage += languageTotal;

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
    const dataTower = await redis.get('voice_data_tower') as any || {};
    const sampleVoices = Object.values(dataTower).slice(0, 5).map((voice: any) => ({
      name: voice.displayName,
      language: voice.language,
      accent: voice.accent,
      gender: voice.gender,
      provider: voice.provider
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