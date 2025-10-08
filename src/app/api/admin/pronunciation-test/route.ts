/**
 * POC test endpoint for ElevenLabs pronunciation dictionaries
 *
 * This endpoint creates a test dictionary and generates audio samples
 * with and without pronunciation customization for comparison.
 *
 * Usage: POST /api/admin/pronunciation-test
 * Body: {
 *   text: "Text to test (e.g., 'YSL is amazing')",
 *   language: "pl" (optional, defaults to Polish),
 *   voiceId: "voice_id" (optional, uses default Polish voice)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createDictionary, PronunciationRule, removeRules } from '@/utils/elevenlabs-pronunciation';
import { createProvider } from '@/lib/providers';

export const runtime = 'edge';

// Default test text in Polish
const DEFAULT_TEST_TEXT = 'YSL to luksusowa marka modowa Yves Saint Laurent';

// Default Polish test voice (female, ElevenLabs)
const DEFAULT_POLISH_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // Bella - Polish female voice

// Test pronunciation rules for Polish brands
const TEST_RULES: PronunciationRule[] = [
  {
    string_to_replace: 'YSL',
    type: 'alias',
    alias: 'igrek es el',
  },
  {
    string_to_replace: 'Yves Saint Laurent',
    type: 'alias',
    alias: 'iw sen loran',
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text = DEFAULT_TEST_TEXT,
      voiceId = DEFAULT_POLISH_VOICE,
      language = 'pl-PL',
      cleanup = false, // Whether to delete test dictionary after use (default: keep it)
    } = body;

    console.log('🧪 Starting pronunciation POC test');
    console.log(`  Text: "${text}"`);
    console.log(`  Voice: ${voiceId}`);
    console.log(`  Language: ${language}`);

    // Step 1: Create test dictionary with language encoding
    console.log('📖 Creating test pronunciation dictionary...');
    const dictionary = await createDictionary(
      `[${language}] Polish Brand Names (YSL)`,
      TEST_RULES,
      'POC test dictionary for pronunciation comparison'
    );

    console.log(`✅ Dictionary created: ${dictionary.id}`);

    const provider = createProvider('voice', 'elevenlabs');

    // Step 2: Generate audio WITHOUT dictionary (baseline)
    console.log('🎤 Generating baseline audio (without dictionary)...');
    const baselineRequest = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceId,
        projectId: `test-baseline-${Date.now()}`,
      }),
    });

    const baselineResponse = await provider.handleRequest(baselineRequest as NextRequest);
    const baselineData = await baselineResponse.json();

    if (!baselineData.audio_url) {
      throw new Error('Failed to generate baseline audio');
    }

    console.log(`✅ Baseline audio generated: ${baselineData.audio_url}`);

    // Step 3: Generate audio WITH dictionary
    console.log('🎤 Generating test audio (with dictionary)...');
    const testRequest = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceId,
        projectId: `test-with-dict-${Date.now()}`,
        pronunciationDictionaryId: dictionary.id,
        pronunciationVersionId: dictionary.version_id,
      }),
    });

    const testResponse = await provider.handleRequest(testRequest as NextRequest);
    const testData = await testResponse.json();

    if (!testData.audio_url) {
      throw new Error('Failed to generate test audio');
    }

    console.log(`✅ Test audio generated: ${testData.audio_url}`);

    // Step 4: Cleanup (optional)
    if (cleanup) {
      console.log('🧹 Cleaning up test dictionary (removing all rules)...');
      const ruleStrings = TEST_RULES.map(r => r.string_to_replace);
      await removeRules(dictionary.id, ruleStrings);
      console.log('✅ Test dictionary rules removed');
    }

    // Return comparison results
    return NextResponse.json({
      success: true,
      test: {
        text,
        voiceId,
        language,
        rules: TEST_RULES,
      },
      dictionary: {
        id: dictionary.id,
        version_id: dictionary.version_id,
        name: dictionary.name,
        cleaned_up: cleanup,
      },
      results: {
        baseline: {
          audio_url: baselineData.audio_url,
          description: 'Audio generated WITHOUT pronunciation dictionary',
        },
        with_dictionary: {
          audio_url: testData.audio_url,
          description: 'Audio generated WITH pronunciation dictionary',
        },
      },
      instructions: {
        message: 'Listen to both audio samples to compare pronunciation',
        expected_difference: 'In the dictionary version, "YSL" should be pronounced as "igrek es el" and "Yves Saint Laurent" as "iw sen loran"',
      },
    });

  } catch (error) {
    console.error('❌ POC test failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/admin/pronunciation-test',
    method: 'POST',
    description: 'Test ElevenLabs pronunciation dictionary functionality',
    parameters: {
      text: {
        type: 'string',
        required: false,
        default: DEFAULT_TEST_TEXT,
        description: 'Text to test pronunciation with',
      },
      voiceId: {
        type: 'string',
        required: false,
        default: DEFAULT_POLISH_VOICE,
        description: 'ElevenLabs voice ID to use',
      },
      language: {
        type: 'string',
        required: false,
        default: 'pl',
        description: 'Language code',
      },
      cleanup: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Whether to remove all rules from test dictionary after use',
      },
    },
    test_rules: TEST_RULES,
    example_request: {
      text: 'YSL to luksusowa marka',
      voiceId: DEFAULT_POLISH_VOICE,
      language: 'pl-PL',
      cleanup: false,
    },
  });
}