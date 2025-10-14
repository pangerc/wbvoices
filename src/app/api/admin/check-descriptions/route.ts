import { NextRequest, NextResponse } from 'next/server';
import { voiceDescriptionService } from '@/services/voiceDescriptionService';

/**
 * Debug endpoint to check specific voice descriptions in the database
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const voiceIds = url.searchParams.get('ids')?.split(',') || [];

    if (voiceIds.length === 0) {
      return NextResponse.json(
        { error: 'Provide comma-separated voice IDs via ?ids=xxx,yyy,zzz' },
        { status: 400 }
      );
    }

    // Build voiceKeys for lookup (with elevenlabs prefix)
    const voiceKeys = voiceIds.map(id => `elevenlabs:${id}`);

    // Bulk fetch descriptions
    const descriptionMap = await voiceDescriptionService.bulkGetDescriptions(voiceKeys);

    // Format results
    const results = voiceIds.map(id => ({
      id,
      voiceKey: `elevenlabs:${id}`,
      found: !!descriptionMap[`elevenlabs:${id}`],
      description: descriptionMap[`elevenlabs:${id}`] || null,
    }));

    // Also get total stats
    const stats = await voiceDescriptionService.getStats();

    return NextResponse.json({
      queried: voiceIds.length,
      found: results.filter(r => r.found).length,
      results,
      stats,
    });
  } catch (error) {
    console.error('Error checking descriptions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check descriptions' },
      { status: 500 }
    );
  }
}
