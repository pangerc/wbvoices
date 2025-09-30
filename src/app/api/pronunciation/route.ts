/**
 * Pronunciation Dictionary API
 *
 * Endpoints:
 * - GET: List all pronunciation dictionaries (with optional language filter)
 * - POST: Create a new pronunciation dictionary
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createDictionary,
  listDictionaries,
  PronunciationRule,
  PronunciationRuleType,
  PhoneticAlphabet,
  validateRules,
} from '@/utils/elevenlabs-pronunciation';
import { PronunciationDictionary } from '@/types';

export const runtime = 'edge';

/**
 * List all pronunciation dictionaries
 * Returns metadata only (rules stored in localStorage on client)
 */
export async function GET() {
  try {
    console.log('📖 Fetching pronunciation dictionaries...');
    const dictionaries = await listDictionaries();

    // Transform API response to match our type structure (metadata only)
    const transformedDictionaries: PronunciationDictionary[] = dictionaries.map((dict) => ({
      id: dict.id,
      versionId: dict.version_id,
      name: dict.name,
      rules: [], // Rules not fetched - client manages them in localStorage
      description: dict.description,
      createdAt: dict.creation_time_unix
        ? new Date(dict.creation_time_unix * 1000).toISOString()
        : new Date().toISOString(),
    }));

    return NextResponse.json({
      success: true,
      dictionaries: transformedDictionaries,
      count: transformedDictionaries.length,
    });
  } catch (error) {
    console.error('❌ Failed to list dictionaries:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list dictionaries',
      },
      { status: 500 }
    );
  }
}

/**
 * Create a new pronunciation dictionary
 * Body: {
 *   name: string,
 *   rules: PronunciationRule[],
 *   description?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, rules, description } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'name is required and must be a string' },
        { status: 400 }
      );
    }

    if (!Array.isArray(rules) || rules.length === 0) {
      return NextResponse.json(
        { success: false, error: 'rules must be a non-empty array' },
        { status: 400 }
      );
    }

    // Transform our camelCase rules to ElevenLabs snake_case format
    const apiRules: PronunciationRule[] = rules.map((rule: { stringToReplace?: string; string_to_replace?: string; type: string; alias?: string; phoneme?: string; alphabet?: string }) => ({
      string_to_replace: (rule.stringToReplace || rule.string_to_replace) as string,
      type: rule.type as PronunciationRuleType,
      ...(rule.alias && { alias: rule.alias }),
      ...(rule.phoneme && { phoneme: rule.phoneme }),
      ...(rule.alphabet && { alphabet: rule.alphabet as PhoneticAlphabet }),
    }));

    // Validate rules
    const validation = validateRules(apiRules);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid pronunciation rules',
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    console.log('📖 Creating pronunciation dictionary:', {
      name,
      ruleCount: apiRules.length,
    });

    // Create dictionary in ElevenLabs
    const dictionary = await createDictionary(name, apiRules, description);

    // Transform response to match our type structure
    const result: PronunciationDictionary = {
      id: dictionary.id,
      versionId: dictionary.version_id,
      name: dictionary.name,
      rules: rules, // Return original rules in camelCase
      description: dictionary.description || description,
      createdAt: dictionary.creation_time_unix
        ? new Date(dictionary.creation_time_unix * 1000).toISOString()
        : new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      dictionary: result,
      message: 'Pronunciation dictionary created successfully',
    });
  } catch (error) {
    console.error('❌ Failed to create dictionary:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create dictionary',
      },
      { status: 500 }
    );
  }
}