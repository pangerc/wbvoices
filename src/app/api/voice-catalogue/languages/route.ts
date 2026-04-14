import { NextResponse } from 'next/server';
import { voiceCatalogue } from '@/services/voiceCatalogueService';
import { getLanguageName } from '@/utils/language';
import { Language } from '@/types';

// Use Node.js runtime for proper Redis access
// export const runtime = 'edge'; // REMOVED - Edge Runtime causes env var issues

/**
 * Get all languages that actually have voices in the tower, with per-language
 * counts. Reads the data tower directly — avoids stale hardcoded lists and
 * ensures the dropdown only surfaces languages with content.
 */
export async function GET() {
  try {
    const stats = await voiceCatalogue.getCacheStats();
    if (stats.totalVoices === 0) {
      return NextResponse.json({ languages: [] });
    }

    const allVoices = await voiceCatalogue.getAllVoices();

    const counts = new Map<string, number>();
    for (const voice of allVoices) {
      if (!voice.language) continue;
      counts.set(voice.language, (counts.get(voice.language) || 0) + 1);
    }

    const languages = Array.from(counts.entries())
      .map(([code, count]) => ({
        code: code as Language,
        // Strip parenthetical region suffix from getLanguageName output —
        // we render flags separately and unify regional variants in display.
        name: getLanguageName(code).split(' (')[0],
        count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ languages });
  } catch (error) {
    console.error('Failed to get languages:', error);
    return NextResponse.json(
      { error: 'Failed to get languages', languages: [] },
      { status: 500 }
    );
  }
}
