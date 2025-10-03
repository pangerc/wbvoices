/**
 * Test endpoint for ElevenLabs V3 model with emotional dialogue
 *
 * This endpoint tests the eleven_v3 model with emotional tags and compares it to v2.
 *
 * Usage: POST /api/admin/test-v3-dialogue
 * Body: {
 *   text: "Dialogue text with emotional tags (e.g., '[laughs] Hello there!')",
 *   language: "pl" (optional, defaults to Polish),
 *   voiceId: "voice_id" (optional, uses default Polish voice)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { uploadVoiceToBlob } from '@/utils/blob-storage';

export const runtime = 'edge';

// Default Polish test voice (female, ElevenLabs)
const DEFAULT_POLISH_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // Bella - Polish female voice

// Default test dialogue in English (will be translated)
const DEFAULT_DIALOGUE = `[laughs] Alright...guys - guys. Seriously.
[exhales] Can you believe just how - realistic - this sounds now?
[laughing hysterically] I mean OH MY GOD...it's so good.
Like you could never do this with the old model.
For example [pauses] could you switch my accent in the old model?
[dismissive] didn't think so. [excited] but you can now!`;

function stripEmotionalTags(text: string): string {
  // Remove all [emotional direction] tags
  return text.replace(/\[.*?\]\s*/g, '');
}

async function translateToPolish(text: string): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    throw new Error('OpenAI API key is missing');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Translate the following English text to Polish while preserving all emotional tags in brackets like [laughs], [whispers], etc. Keep the tags in English but translate all other text to natural, conversational Polish. Maintain the same emotional tone and style.'
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI translation failed: ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || text;
}

async function generateAudio(
  text: string,
  voiceId: string,
  modelId: 'eleven_multilingual_v2' | 'eleven_v3',
  projectId: string,
  speedTest?: 'fast' | 'slow' | null
): Promise<{ audio_url: string; model: string; speed_tested?: number }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error('ElevenLabs API key is missing');
  }

  // Strip language suffix from voice ID if present
  const cleanVoiceId = voiceId.replace(/-[a-z]{2}(-[A-Z]{2})?$/, '');

  console.log(`🎭 Generating audio with ${modelId}:`);
  console.log(`  Voice ID: ${cleanVoiceId}`);
  console.log(`  Text length: ${text.length} chars`);
  if (speedTest) {
    console.log(`  🧪 SPEED TEST: ${speedTest}`);
  }

  // Build voice settings - test if V3 accepts speed parameter
  const voiceSettings: Record<string, unknown> = {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.3,
    use_speaker_boost: false,
  };

  // Add speed parameter for testing
  let speedValue: number | undefined;
  if (speedTest === 'fast') {
    speedValue = 1.15; // fast_read preset value
    voiceSettings.speed = speedValue;
  } else if (speedTest === 'slow') {
    speedValue = 0.9; // slow_read preset value
    voiceSettings.speed = speedValue;
  }

  const requestBody = {
    text,
    model_id: modelId,
    voice_settings: voiceSettings,
  };

  const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${cleanVoiceId}?output_format=mp3_44100_128`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  console.log(`ElevenLabs API response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`ElevenLabs error: ${errorText}`);
    throw new Error(`ElevenLabs API failed: ${errorText}`);
  }

  const audioArrayBuffer = await response.arrayBuffer();

  // Upload to Vercel Blob
  console.log('Uploading audio to Vercel Blob...');
  const audioBlob = new Blob([audioArrayBuffer], { type: 'audio/mpeg' });
  const blobResult = await uploadVoiceToBlob(
    audioBlob,
    `${modelId}-test-${text.substring(0, 30)}`,
    'elevenlabs',
    projectId
  );

  console.log(`Audio uploaded: ${blobResult.url}`);

  return {
    audio_url: blobResult.url,
    model: modelId,
    ...(speedValue ? { speed_tested: speedValue } : {}),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text = DEFAULT_DIALOGUE,
      voiceId = DEFAULT_POLISH_VOICE,
      language = 'pl',
      skipTranslation = false,
    } = body;

    console.log('🧪 Starting V3 dialogue test');
    console.log(`  Voice: ${voiceId}`);
    console.log(`  Language: ${language}`);
    console.log(`  Skip translation: ${skipTranslation}`);

    // Step 1: Translate to Polish if needed
    let polishTextWithTags = text;
    if (!skipTranslation && language === 'pl') {
      console.log('🌍 Translating to Polish...');
      polishTextWithTags = await translateToPolish(text);
      console.log('✅ Translation complete');
      console.log(`  Translated text preview: ${polishTextWithTags.substring(0, 100)}...`);
    }

    // Step 2: Create V2 version WITHOUT emotional tags (v2 doesn't support them)
    const polishTextNoTags = stripEmotionalTags(polishTextWithTags);
    console.log(`📝 V2 text (no tags): ${polishTextNoTags.substring(0, 100)}...`);
    console.log(`📝 V3 text (with tags): ${polishTextWithTags.substring(0, 100)}...`);

    const projectId = `v3-test-${Date.now()}`;

    // Step 3: Generate audio with V2 model (baseline, NO emotional tags)
    console.log('🎤 Generating baseline audio (V2 model - no emotional tags)...');
    const v2Result = await generateAudio(
      polishTextNoTags,
      voiceId,
      'eleven_multilingual_v2',
      `${projectId}-v2`
    );
    console.log(`✅ V2 audio generated: ${v2Result.audio_url}`);

    // Step 4: Generate audio with V3 model (WITH emotional tags)
    console.log('🎤 Generating test audio (V3 model - with emotional tags)...');
    const v3Result = await generateAudio(
      polishTextWithTags,
      voiceId,
      'eleven_v3',
      `${projectId}-v3`
    );
    console.log(`✅ V3 audio generated: ${v3Result.audio_url}`);

    // Step 5: 🧪 TEST FAST SPEED with V3
    console.log('🧪 Testing V3 with FAST speed parameter (1.15)...');
    let v3FastResult;
    let fastSpeedError = null;
    try {
      v3FastResult = await generateAudio(
        polishTextWithTags,
        voiceId,
        'eleven_v3',
        `${projectId}-v3-fast`,
        'fast'
      );
      console.log(`✅ V3 FAST audio generated: ${v3FastResult.audio_url}`);
    } catch (error) {
      fastSpeedError = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ V3 FAST speed test failed: ${fastSpeedError}`);
    }

    // Step 6: 🧪 TEST SLOW SPEED with V3
    console.log('🧪 Testing V3 with SLOW speed parameter (0.9)...');
    let v3SlowResult;
    let slowSpeedError = null;
    try {
      v3SlowResult = await generateAudio(
        polishTextWithTags,
        voiceId,
        'eleven_v3',
        `${projectId}-v3-slow`,
        'slow'
      );
      console.log(`✅ V3 SLOW audio generated: ${v3SlowResult.audio_url}`);
    } catch (error) {
      slowSpeedError = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ V3 SLOW speed test failed: ${slowSpeedError}`);
    }

    // Return comparison results
    return NextResponse.json({
      success: true,
      test: {
        voiceId,
        language,
      },
      results: {
        v2_model: {
          audio_url: v2Result.audio_url,
          model: 'eleven_multilingual_v2',
          text_used: polishTextNoTags,
          description: 'V2 model (no emotional tags support)',
        },
        v3_model: {
          audio_url: v3Result.audio_url,
          model: 'eleven_v3',
          text_used: polishTextWithTags,
          description: 'V3 model (with emotional tags)',
        },
        v3_fast_speed: fastSpeedError ? {
          error: fastSpeedError,
          description: '🧪 V3 with speed=1.15 - FAILED (expected if V3 doesn\'t support speed parameter)',
        } : {
          audio_url: v3FastResult?.audio_url,
          model: 'eleven_v3',
          speed_tested: v3FastResult?.speed_tested,
          description: '🧪 V3 with speed=1.15 - SUCCESS (unexpected! V3 accepts speed parameter)',
        },
        v3_slow_speed: slowSpeedError ? {
          error: slowSpeedError,
          description: '🧪 V3 with speed=0.9 - FAILED (expected if V3 doesn\'t support speed parameter)',
        } : {
          audio_url: v3SlowResult?.audio_url,
          model: 'eleven_v3',
          speed_tested: v3SlowResult?.speed_tested,
          description: '🧪 V3 with speed=0.9 - SUCCESS (unexpected! V3 accepts speed parameter)',
        },
      },
      instructions: {
        message: 'Listen to all audio samples to compare emotional expressiveness AND pacing',
        expected_difference: 'V3 should have better emotional range. Speed parameter tests show if V3 supports pacing control.',
        speed_test_explanation: 'If speed tests FAIL, V3 requires LLM-based pacing control (text/punctuation). If SUCCESS, we can use speed parameter.',
      },
    });

  } catch (error) {
    console.error('❌ V3 test failed:', error);
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
    endpoint: '/api/admin/test-v3-dialogue',
    method: 'POST',
    description: 'Test ElevenLabs V3 model with emotional dialogue tags',
    parameters: {
      text: {
        type: 'string',
        required: false,
        default: 'Sample dialogue with emotional tags',
        description: 'Text with emotional tags like [laughs], [whispers], etc.',
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
        description: 'Language code (will translate if pl)',
      },
      skipTranslation: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Skip translation and use text as-is',
      },
    },
    example_request: {
      text: '[laughs] This is amazing! [excited] I love it!',
      voiceId: DEFAULT_POLISH_VOICE,
      language: 'pl',
      skipTranslation: false,
    },
  });
}
