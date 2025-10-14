import { NextResponse } from 'next/server';
import { voiceDescriptionService } from '@/services/voiceDescriptionService';
import descriptions from '@/../data/voice-descriptions.json';

/**
 * Admin API for importing voice descriptions from scraped data
 *
 * POST - Import all 125 ElevenLabs voice descriptions into the database
 *
 * This is a repeatable operation - uses upsert so it can be run multiple times
 * to update descriptions without creating duplicates.
 */

export async function POST() {
  try {
    const entries = Object.entries(descriptions);
    console.log(`📦 Importing ${entries.length} voice descriptions...`);

    // Convert to format expected by batch upsert
    const batch = entries.map(([voiceId, description]) => ({
      voiceKey: `elevenlabs:${voiceId}`,
      description: description as string,
    }));

    // Perform batch upsert
    await voiceDescriptionService.batchUpsert(batch, 'scraped_elevenlabs_2024');

    // Get updated stats
    const stats = await voiceDescriptionService.getStats();

    console.log(`✅ Import complete! Total descriptions: ${stats.total}`);

    return NextResponse.json({
      success: true,
      message: `Imported ${batch.length} voice descriptions`,
      imported: batch.length,
      stats: {
        total: stats.total,
        bySource: stats.bySource,
      },
    });
  } catch (error) {
    console.error('❌ Import failed:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to import descriptions',
      },
      { status: 500 }
    );
  }
}
