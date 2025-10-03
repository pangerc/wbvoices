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
  projectId: string
): Promise<{ audio_url: string; model: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error('ElevenLabs API key is missing');
  }

  // Strip language suffix from voice ID if present
  const cleanVoiceId = voiceId.replace(/-[a-z]{2}(-[A-Z]{2})?$/, '');

  console.log(`🎭 Generating audio with ${modelId}:`);
  console.log(`  Voice ID: ${cleanVoiceId}`);
  console.log(`  Text length: ${text.length} chars`);

  const requestBody = {
    text,
    model_id: modelId,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.3,
      use_speaker_boost: false,
    },
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
      },
      instructions: {
        message: 'Listen to both audio samples to compare emotional expressiveness',
        expected_difference: 'V3 should have better emotional range and more natural intonation with emotional tags',
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
