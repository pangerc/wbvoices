import { NextResponse } from "next/server";
import { voiceCatalogue, UnifiedVoice } from "@/services/voiceCatalogueService";
import { normalizeLanguageCode } from "@/utils/language";
import { normalizeAccent } from "@/utils/accents";
import { Language } from "@/types";

// Use Node.js runtime for proper Redis access
// export const runtime = 'edge'; // REMOVED - Edge Runtime causes env var issues

// Type for voice data from providers
type ProviderVoice = {
  id: string;
  name: string;
  gender?: string;
  language?: string;
  accent?: string;
  description?: string;
  age?: string;
  style?: string;
  sampleUrl?: string;
  use_case?: string;
  isMultilingual?: boolean;
};

/**
 * 🔥 SECRET WEAPON: Admin endpoint to populate voice cache
 * This builds our fortress in the shadows while the dragon sleeps
 */

/**
 * Helper function to resolve the base URL for internal API calls
 * Tries multiple sources to work in both dev and production
 */
function getBaseUrl(): string {
  // 1. Try NEXTAUTH_URL (explicit configuration)
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }

  // 2. Try VERCEL_URL (automatic Vercel deployment URL)
  if (process.env.VERCEL_URL) {
    // VERCEL_URL doesn't include protocol, add https for production
    return `https://${process.env.VERCEL_URL}`;
  }

  // 3. Fallback to localhost for local development
  return "http://localhost:3000";
}

// Voice normalization from existing providers
async function fetchAndNormalizeVoices() {
  const voices: UnifiedVoice[] = [];
  const timestamp = Date.now();

  console.log("🔄 Fetching voices from all providers...");

  // ELEVENLABS - Best quality
  try {
    const response = await fetch(
      `${getBaseUrl()}/api/voice/list?provider=elevenlabs`
    );
    if (response.ok) {
      const data = await response.json();
      const elevenlabsVoices = data.voices || [];

      for (const voice of elevenlabsVoices as ProviderVoice[]) {
        const normalizedLanguage = normalizeLanguageCode(
          voice.language || "en"
        );
        const normalizedAccent = normalizeAccent(
          voice.accent,
          normalizedLanguage
        );

        voices.push({
          id: voice.id,
          provider: "elevenlabs",
          catalogueId: `voice:elevenlabs:${voice.id}`,
          name: voice.name,
          displayName: `${voice.name} (ElevenLabs)`,
          gender:
            voice.gender === "male" || voice.gender === "female"
              ? voice.gender
              : "neutral",
          language: normalizedLanguage as Language,
          accent: normalizedAccent,
          personality: voice.description || undefined,
          age: voice.age || undefined,
          capabilities: {
            supportsEmotional: false, // ElevenLabs uses voice selection for emotion
            supportsWhispering: false,
            isMultilingual: voice.isMultilingual || false,
          },
          sampleUrl: voice.sampleUrl,
          useCase: voice.use_case,
          lastUpdated: timestamp,
        });
      }

      console.log(`✅ ElevenLabs: ${elevenlabsVoices.length} voices`);
    }
  } catch (error) {
    console.error("❌ Failed to fetch ElevenLabs voices:", error);
  }

  // LOVO - Wide coverage
  try {
    const response = await fetch(
      `${getBaseUrl()}/api/voice/list?provider=lovo`
    );
    if (response.ok) {
      const data = await response.json();
      const voicesByLanguage = data.voicesByLanguage || {};

      for (const [language, languageVoices] of Object.entries(
        voicesByLanguage
      )) {
        const normalizedLanguage = normalizeLanguageCode(language);

        for (const voice of languageVoices as ProviderVoice[]) {
          // 🗡️ EXTRACT REGIONAL ACCENT FROM LOVO'S SAMPLE URL!
          let accentToNormalize = voice.accent;

          // Lovo hides regional info in sampleUrl - extract it!
          if (
            voice.sampleUrl &&
            voice.sampleUrl.includes("speaker-tts-samples")
          ) {
            // 🗡️ DRAGON SLAYING REGEX: Extract ANY language-region code!
            const urlMatch = voice.sampleUrl.match(/\/([a-z]{2}-[A-Z]{2})-/);
            if (urlMatch) {
              const originalLanguageCode = urlMatch[1]; // e.g., "es-AR", "ar-SA", "en-US"
              const regionCode = originalLanguageCode.split("-")[1]; // Extract region (AR, SA, US)
              console.log(
                `🔥 RESCUED REGIONAL ACCENT: ${originalLanguageCode} → ${regionCode} for voice ${voice.name}`
              );

              // Use the region code for accent normalization
              accentToNormalize = regionCode; // AR, MX, SA, etc.
            }
          }

          const normalizedAccent = normalizeAccent(accentToNormalize, language);

          voices.push({
            id: voice.id,
            provider: "lovo",
            catalogueId: `voice:lovo:${voice.id}`,
            name: voice.name,
            displayName: `${voice.name} (Lovo)`,
            gender:
              voice.gender === "male"
                ? "male"
                : voice.gender === "female"
                ? "female"
                : "neutral",
            language: normalizedLanguage as Language,
            accent: normalizedAccent,
            personality: voice.description || undefined,
            age: voice.age || undefined,
            styles: voice.style ? [voice.style] : undefined,
            capabilities: {
              supportsEmotional: true, // Lovo has style system
              supportsWhispering:
                voice.style?.toLowerCase().includes("whisper") || false,
              isMultilingual: false,
            },
            sampleUrl: voice.sampleUrl,
            useCase: voice.use_case,
            lastUpdated: timestamp,
          });
        }
      }

      console.log(
        `✅ Lovo: ${voices.filter((v) => v.provider === "lovo").length} voices`
      );
    }
  } catch (error) {
    console.error("❌ Failed to fetch Lovo voices:", error);
  }

  // OPENAI - Fallback
  try {
    const response = await fetch(
      `${getBaseUrl()}/api/voice/list?provider=openai`
    );
    if (response.ok) {
      const data = await response.json();
      const voicesByLanguage = data.voicesByLanguage || {};

      for (const [language, languageVoices] of Object.entries(
        voicesByLanguage
      )) {
        const normalizedLanguage = normalizeLanguageCode(language);

        for (const voice of languageVoices as ProviderVoice[]) {
          voices.push({
            id: voice.id,
            provider: "openai",
            catalogueId: `voice:openai:${voice.id}`,
            name: voice.name,
            displayName: `${voice.name} (OpenAI)`,
            gender:
              voice.gender === "male" || voice.gender === "female"
                ? voice.gender
                : "neutral",
            language: normalizedLanguage as Language,
            accent: "neutral", // OpenAI doesn't have real accents
            personality: voice.description || undefined,
            age: voice.age || undefined,
            styles: voice.style ? [voice.style] : undefined,
            capabilities: {
              supportsEmotional: true, // OpenAI has text modifiers
              supportsWhispering: true,
              isMultilingual: true,
            },
            sampleUrl: voice.sampleUrl,
            useCase: voice.use_case,
            lastUpdated: timestamp,
          });
        }
      }

      console.log(
        `✅ OpenAI: ${
          voices.filter((v) => v.provider === "openai").length
        } voices`
      );
    }
  } catch (error) {
    console.error("❌ Failed to fetch OpenAI voices:", error);
  }

  // QWEN - Chinese TTS with dialect support
  // Hardcoded since Qwen doesn't provide a voice list API
  const qwenVoices = [
    // Standard Chinese voices
    {
      id: "chelsie",
      name: "Chelsie",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Friendly and warm",
      age: "young",
      use_case: "general",
    },
    {
      id: "cherry",
      name: "Cherry",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Cheerful and bright",
      age: "young",
      use_case: "general",
    },
    {
      id: "ethan",
      name: "Ethan",
      gender: "male" as const,
      language: "zh",
      accent: "neutral",
      description: "Professional and clear",
      age: "middle_aged",
      use_case: "general",
    },
    {
      id: "serena",
      name: "Serena",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Calm and sophisticated",
      age: "middle_aged",
      use_case: "general",
    },
    // Dialect voices (requires qwen-tts-latest model)
    {
      id: "dylan",
      name: "Dylan",
      gender: "male" as const,
      language: "zh",
      accent: "beijing",
      description: "Beijing dialect speaker",
      age: "middle_aged",
      use_case: "regional",
    },
    {
      id: "jada",
      name: "Jada",
      gender: "female" as const,
      language: "zh",
      accent: "shanghai",
      description: "Shanghai dialect speaker",
      age: "young",
      use_case: "regional",
    },
    {
      id: "sunny",
      name: "Sunny",
      gender: "female" as const,
      language: "zh",
      accent: "sichuan",
      description: "Sichuan dialect speaker",
      age: "young",
      use_case: "regional",
    },
  ];

  // Add Qwen voices with both Chinese and English support
  for (const qwenVoice of qwenVoices) {
    // Chinese version
    voices.push({
      id: qwenVoice.id,
      provider: "qwen",
      catalogueId: `voice:qwen:${qwenVoice.id}`,
      name: qwenVoice.name,
      displayName: `${qwenVoice.name} (Qwen)`,
      gender: qwenVoice.gender,
      language: "zh" as Language,
      accent: qwenVoice.accent, // Already normalized values
      personality: qwenVoice.description,
      age: qwenVoice.age,
      capabilities: {
        supportsEmotional: false,
        supportsWhispering: false,
        isMultilingual: true, // Qwen supports mixed Chinese-English
      },
      sampleUrl: undefined,
      useCase: qwenVoice.use_case,
      lastUpdated: timestamp,
    });

    // English version (Qwen can handle mixed Chinese-English text)
    voices.push({
      id: `${qwenVoice.id}-en`,
      provider: "qwen",
      catalogueId: `voice:qwen:${qwenVoice.id}-en`,
      name: qwenVoice.name,
      displayName: `${qwenVoice.name} (Qwen)`,
      gender: qwenVoice.gender,
      language: "en-US" as Language,
      accent: qwenVoice.accent, // Already normalized values
      personality: `${qwenVoice.description} (supports mixed Chinese-English)`,
      age: qwenVoice.age,
      capabilities: {
        supportsEmotional: false,
        supportsWhispering: false,
        isMultilingual: true,
      },
      sampleUrl: undefined,
      useCase: qwenVoice.use_case,
      lastUpdated: timestamp,
    });
  }

  console.log(
    `✅ Qwen: ${qwenVoices.length * 2} voices (${qwenVoices.length} Chinese + ${
      qwenVoices.length
    } English)`
  );

  // BYTEDANCE - Chinese and Japanese TTS
  const bytedanceVoices = [
    // Standard Chinese Mandarin voices
    {
      id: "zh_male_baqiqingshu_mars_bigtts",
      name: "Edward",
      gender: "male" as const,
      language: "zh",
      accent: "neutral",
      description: "Deep, audiobook style",
      age: "middle_aged",
      use_case: "narration",
    },
    {
      id: "zh_female_wenroushunv_mars_bigtts",
      name: "Emma",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Soft and gentle",
      age: "young",
      use_case: "narration",
    },
    {
      id: "zh_female_gaolengyujie_moon_bigtts",
      name: "Charlotte",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Clear and professional",
      age: "middle_aged",
      use_case: "general",
    },
    {
      id: "zh_female_linjianvhai_moon_bigtts",
      name: "Lila",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Clear and youthful",
      age: "young",
      use_case: "general",
    },
    {
      id: "zh_male_yuanboxiaoshu_moon_bigtts",
      name: "Joseph",
      gender: "male" as const,
      language: "zh",
      accent: "neutral",
      description: "Deep and articulate",
      age: "middle_aged",
      use_case: "general",
    },
    {
      id: "zh_male_yangguangqingnian_moon_bigtts",
      name: "George",
      gender: "male" as const,
      language: "zh",
      accent: "neutral",
      description: "Clear and energetic",
      age: "young",
      use_case: "general",
    },
    // Cantonese voices - map to Hong Kong region
    {
      id: "zh_male_guozhoudege_moon_bigtts",
      name: "Andrew",
      gender: "male" as const,
      language: "zh",
      region: "HK", // Hong Kong region
      accent: "cantonese", // Cantonese accent
      description: "Clear Cantonese speaker",
      age: "middle_aged",
      use_case: "regional",
    },
    {
      id: "zh_female_wanqudashu_moon_bigtts", // Note: Documentation says male but ID suggests female
      name: "Robert",
      gender: "male" as const,
      language: "zh",
      region: "HK", // Hong Kong region
      accent: "cantonese", // Cantonese accent
      description: "Fun Cantonese style",
      age: "middle_aged",
      use_case: "regional",
    },
    // Sichuan dialect voice
    {
      id: "zh_female_daimengchuanmei_moon_bigtts",
      name: "Elena",
      gender: "female" as const,
      language: "zh",
      accent: "sichuan",
      description: "Sichuan dialect speaker",
      age: "young",
      use_case: "regional",
    },
    // Taiwanese voice
    {
      id: "zh_female_wanwanxiaohe_moon_bigtts",
      name: "Isabella",
      gender: "female" as const,
      language: "zh",
      accent: "taiwanese",
      description: "Vivid Taiwanese speaker",
      age: "young",
      use_case: "regional",
    },
    // Japanese voices
    {
      id: "multi_male_jingqiangkanye_moon_bigtts",
      name: "かずね",
      gender: "male" as const,
      language: "ja",
      accent: "neutral",
      description: "Fun Japanese speaker",
      age: "young",
      use_case: "general",
    },
    {
      id: "multi_female_shuangkuaisisi_moon_bigtts",
      name: "はるこ",
      gender: "female" as const,
      language: "ja",
      accent: "neutral",
      description: "Vivid Japanese speaker",
      age: "young",
      use_case: "general",
    },
    {
      id: "multi_male_wanqudashu_moon_bigtts",
      name: "ひろし",
      gender: "male" as const,
      language: "ja",
      accent: "neutral",
      description: "Fun Japanese speaker",
      age: "middle_aged",
      use_case: "general",
    },
    {
      id: "multi_female_gaolengvujie_moon_bigtts",
      name: "あけみ",
      gender: "female" as const,
      language: "ja",
      accent: "neutral",
      description: "Clear Japanese speaker",
      age: "young",
      use_case: "general",
    },
  ];

  // Add ByteDance voices to cache (Chinese and Japanese)
  for (const bytedanceVoice of bytedanceVoices) {
    voices.push({
      id: bytedanceVoice.id,
      provider: "bytedance",
      catalogueId: `voice:bytedance:${bytedanceVoice.id}`,
      name: bytedanceVoice.name,
      displayName: `${bytedanceVoice.name} (ByteDance)`,
      gender: bytedanceVoice.gender,
      language: bytedanceVoice.language as Language, // Use the language from each voice
      accent: bytedanceVoice.accent,
      personality: bytedanceVoice.description,
      age: bytedanceVoice.age,
      capabilities: {
        supportsEmotional: false,
        supportsWhispering: false,
        isMultilingual: false, // ByteDance voices are language-specific
      },
      sampleUrl: undefined,
      useCase: bytedanceVoice.use_case,
      lastUpdated: timestamp,
    });
  }

  console.log(
    `✅ ByteDance: ${bytedanceVoices.length} voices (Chinese with regional dialects)`
  );

  return voices;
}

export async function POST() {
  try {
    console.log("🏰 BUILDING VOICE FORTRESS IN THE SHADOWS...");

    // Step 1: Clear existing cache
    await voiceCatalogue.clearCache();

    // Step 2: Fetch and normalize all voices
    const voices = await fetchAndNormalizeVoices();

    if (voices.length === 0) {
      return NextResponse.json(
        {
          error: "No voices fetched from any provider",
        },
        { status: 500 }
      );
    }

    // Step 3: Build the magnificent towers!
    console.log(
      `🏗️ Building magnificent towers with ${voices.length} voices...`
    );

    await voiceCatalogue.buildTowers(voices);

    // Step 4: Get final stats
    const stats = await voiceCatalogue.getCacheStats();

    console.log("🎯 FORTRESS COMPLETE! Voice cache populated:");
    console.log(`   Total voices: ${stats.totalVoices}`);
    console.log(`   ElevenLabs: ${stats.byProvider.elevenlabs}`);
    console.log(`   Lovo: ${stats.byProvider.lovo}`);
    console.log(`   OpenAI: ${stats.byProvider.openai}`);
    console.log(`   Qwen: ${stats.byProvider.qwen}`);
    console.log(`   ByteDance: ${stats.byProvider.bytedance}`);

    return NextResponse.json({
      success: true,
      message:
        "🔥 Voice fortress erected! The dragon will never see it coming.",
      stats: {
        totalVoices: stats.totalVoices,
        byProvider: stats.byProvider,
        voicesProcessed: voices.length,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error("💥 FORTRESS CONSTRUCTION FAILED:", error);

    return NextResponse.json(
      {
        error: "Failed to populate voice cache",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const stats = await voiceCatalogue.getCacheStats();

    return NextResponse.json({
      stats,
      ready: stats.totalVoices > 0,
      message:
        stats.totalVoices > 0
          ? "🏰 Voice fortress is ready for battle!"
          : "⚠️  Voice fortress not built yet. Run POST to build.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to get cache stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await voiceCatalogue.clearCache();

    return NextResponse.json({
      success: true,
      message: "🗑️ Voice fortress demolished. Ready to rebuild!",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to clear cache",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
