/**
 * Individual Pronunciation Dictionary API
 *
 * Endpoints:
 * - GET: Get a specific dictionary by ID
 * - DELETE: Delete a dictionary by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDictionary, removeRules, addRules, PronunciationRule as ApiPronunciationRule, PronunciationRuleType, PhoneticAlphabet } from '@/utils/elevenlabs-pronunciation';
import { getRedis } from '@/lib/redis';
import { PronunciationRule } from '@/types';

export const runtime = 'edge';

// Redis key for storing pronunciation rules
const PRONUNCIATION_RULES_KEY = 'pronunciation:global_rules';

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Get a specific pronunciation dictionary
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Dictionary ID is required' },
        { status: 400 }
      );
    }

    console.log('📖 Fetching dictionary:', id);
    const dictionary = await getDictionary(id);

    return NextResponse.json({
      success: true,
      dictionary: {
        id: dictionary.id,
        versionId: dictionary.version_id,
        name: dictionary.name,
        description: dictionary.description,
        createdAt: dictionary.creation_time_unix
          ? new Date(dictionary.creation_time_unix * 1000).toISOString()
          : new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Failed to get dictionary:', error);

    // Handle 404 specifically
    const errorMessage = error instanceof Error ? error.message : 'Failed to get dictionary';
    const status = errorMessage.includes('404') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status }
    );
  }
}

/**
 * Delete a pronunciation dictionary
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Dictionary ID is required' },
        { status: 400 }
      );
    }

    console.log('📖 Clearing dictionary rules:', id);

    // Get current rules from Redis to know what to remove
    const redis = getRedis();
    const rulesData = await redis.get<{ rules: PronunciationRule[]; dictionaryId: string }>(PRONUNCIATION_RULES_KEY);

    if (rulesData && rulesData.rules && rulesData.rules.length > 0) {
      // Extract rule strings to remove
      const ruleStrings = rulesData.rules.map(r => r.stringToReplace).filter(Boolean);

      if (ruleStrings.length > 0) {
        console.log(`🗑️ Removing ${ruleStrings.length} rules from ElevenLabs dictionary...`);
        try {
          await removeRules(id, ruleStrings);
          console.log('✅ Rules removed from ElevenLabs dictionary');
        } catch (removeError) {
          console.error('⚠️ Failed to remove rules from ElevenLabs:', removeError);
          // Continue even if removal fails - Redis is authoritative
        }
      }
    }

    // Clear rules from Redis (this is the authoritative source)
    console.log('💾 Clearing pronunciation rules from Redis...');
    await redis.del(PRONUNCIATION_RULES_KEY);
    console.log('✅ Pronunciation rules cleared from Redis');

    return NextResponse.json({
      success: true,
      message: 'Dictionary deleted successfully',
      dictionaryId: id,
    });
  } catch (error) {
    console.error('❌ Failed to delete dictionary:', error);

    // Handle 404 specifically
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete dictionary';
    const status = errorMessage.includes('404') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status }
    );
  }
}

/**
 * Update a pronunciation dictionary by removing old rules and adding new ones
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Dictionary ID is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { rules } = body;

    if (!Array.isArray(rules)) {
      return NextResponse.json(
        { success: false, error: 'rules must be an array' },
        { status: 400 }
      );
    }

    console.log('📖 Updating pronunciation dictionary:', { id, newRuleCount: rules.length });

    // Get current rules from Redis to know what to remove
    const redis = getRedis();
    const rulesData = await redis.get<{ rules: PronunciationRule[]; dictionaryId: string }>(PRONUNCIATION_RULES_KEY);

    // Step 1: Remove old rules if they exist
    if (rulesData && rulesData.rules && rulesData.rules.length > 0) {
      const oldRuleStrings = rulesData.rules.map(r => r.stringToReplace).filter(Boolean);

      if (oldRuleStrings.length > 0) {
        console.log(`🗑️ Removing ${oldRuleStrings.length} old rules...`);
        await removeRules(id, oldRuleStrings);
      }
    }

    // Step 2: Add new rules if provided
    if (rules.length > 0) {
      // Transform camelCase to snake_case for ElevenLabs API
      const apiRules: ApiPronunciationRule[] = rules.map((rule: { stringToReplace?: string; string_to_replace?: string; type: string; alias?: string; phoneme?: string; alphabet?: string }) => ({
        string_to_replace: (rule.stringToReplace || rule.string_to_replace) as string,
        type: rule.type as PronunciationRuleType,
        ...(rule.alias && { alias: rule.alias }),
        ...(rule.phoneme && { phoneme: rule.phoneme }),
        ...(rule.alphabet && { alphabet: rule.alphabet as PhoneticAlphabet }),
      }));

      console.log(`➕ Adding ${apiRules.length} new rules...`);
      const result = await addRules(id, apiRules);

      // Update Redis with new rules
      console.log('💾 Updating pronunciation rules in Redis...');
      await redis.set(PRONUNCIATION_RULES_KEY, {
        rules,
        dictionaryId: id,
        timestamp: Date.now(),
      });
      console.log('✅ Pronunciation rules updated in Redis');

      return NextResponse.json({
        success: true,
        message: 'Dictionary updated successfully',
        dictionary: {
          id: result.id,
          versionId: result.version_id,
          rulesCount: result.version_rules_num,
        },
      });
    } else {
      // No new rules - just clear Redis
      await redis.del(PRONUNCIATION_RULES_KEY);

      return NextResponse.json({
        success: true,
        message: 'All rules removed from dictionary',
      });
    }
  } catch (error) {
    console.error('❌ Failed to update dictionary:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update dictionary',
      },
      { status: 500 }
    );
  }
}