import { NextRequest, NextResponse } from 'next/server';
import { voiceMetadataService } from '@/services/voiceMetadataService';
import { Language } from '@/types';

/**
 * Admin API for managing voice blacklist
 *
 * BLACKLIST LOGIC: Voices are visible by default.
 * POST adds to blacklist (hides voice), DELETE removes from blacklist (shows voice).
 *
 * GET    ?voiceKey=provider:voiceId              - Get blacklist entries for a voice
 * GET    ?language=es&accent=mexican             - Get all blacklisted voices for language/accent
 * POST   { voiceKey, language, accent, reason }  - Add voice to blacklist
 * DELETE ?voiceKey=...&language=...&accent=...   - Remove voice from blacklist
 */

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const voiceKey = url.searchParams.get('voiceKey');
    const language = url.searchParams.get('language');
    const accent = url.searchParams.get('accent');

    // Get blacklist entries for a specific voice
    if (voiceKey) {
      const entries = await voiceMetadataService.getBlacklistEntries(voiceKey);
      return NextResponse.json({ voiceKey, blacklist: entries });
    }

    // Get all blacklisted voices for a language/accent combination
    if (language && accent) {
      const blacklisted = await voiceMetadataService.getBlacklistedVoices(
        language as Language,
        accent
      );
      return NextResponse.json({ language, accent, blacklist: blacklisted });
    }

    return NextResponse.json(
      { error: 'Either voiceKey or both language+accent required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error fetching blacklist:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch blacklist' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { voiceKey, language, accent, reason, batch } = body;

    // Validate required fields
    if (!language || !accent) {
      return NextResponse.json(
        { error: 'language and accent are required' },
        { status: 400 }
      );
    }

    // Batch blacklist
    if (batch && Array.isArray(voiceKey)) {
      await voiceMetadataService.batchBlacklist(
        voiceKey,
        language as Language,
        accent,
        reason
      );
      return NextResponse.json({
        success: true,
        message: `Blacklisted ${voiceKey.length} voices for ${language}/${accent}`,
        count: voiceKey.length,
      });
    }

    // Single blacklist
    if (!voiceKey || typeof voiceKey !== 'string') {
      return NextResponse.json(
        { error: 'voiceKey is required and must be a string' },
        { status: 400 }
      );
    }

    await voiceMetadataService.addToBlacklist(
      voiceKey,
      language as Language,
      accent,
      reason
    );

    return NextResponse.json({
      success: true,
      message: `Blacklisted ${voiceKey} for ${language}/${accent}`,
    });
  } catch (error) {
    console.error('Error blacklisting voice:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to blacklist voice' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const voiceKey = url.searchParams.get('voiceKey');
    const language = url.searchParams.get('language');
    const accent = url.searchParams.get('accent');

    // Validate required fields
    if (!voiceKey || !language || !accent) {
      return NextResponse.json(
        { error: 'voiceKey, language, and accent are required' },
        { status: 400 }
      );
    }

    await voiceMetadataService.removeFromBlacklist(
      voiceKey,
      language as Language,
      accent
    );

    return NextResponse.json({
      success: true,
      message: `Removed ${voiceKey} from blacklist for ${language}/${accent}`,
    });
  } catch (error) {
    console.error('Error removing from blacklist:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove from blacklist' },
      { status: 500 }
    );
  }
}
