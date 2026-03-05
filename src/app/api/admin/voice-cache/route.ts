import { NextResponse } from "next/server";
import { voiceCatalogue, UnifiedVoice } from "@/services/voiceCatalogueService";
import { normalizeLanguageCode } from "@/utils/language";
import { normalizeAccent } from "@/utils/accents";
import { Language } from "@/types";
import {
  fetchElevenLabsVoices,
  fetchLovoVoices,
  getOpenAIVoices,
  fetchLahajatiVoices,
} from "@/services/voiceProviderService";
import { lahajatiDialectService } from "@/services/lahajatiDialectService";
import { lahajatiPerformanceService } from "@/services/lahajatiPerformanceService";

// Use Node.js runtime for proper Redis access
// export const runtime = 'edge'; // REMOVED - Edge Runtime causes env var issues

/**
 * 🔥 SECRET WEAPON: Admin endpoint to populate voice cache
 * This builds our fortress in the shadows while the dragon sleeps
 *
 * FIXED: Now calls provider APIs directly instead of internal HTTP
 * This prevents cascading timeouts and empty database issues on Vercel
 */

// Voice normalization from existing providers
async function fetchAndNormalizeVoices() {
  const voices: UnifiedVoice[] = [];
  const timestamp = Date.now();

  console.log("🔄 Fetching voices from all providers (DIRECT CALLS)...");

  // ELEVENLABS - Best quality
  try {
    console.log("📡 Fetching ElevenLabs voices directly from API...");
    const elevenlabsVoices = await fetchElevenLabsVoices();

    for (const voice of elevenlabsVoices) {
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
          supportsEmotional: false,
          supportsWhispering: false,
          isMultilingual: voice.isMultilingual || false,
        },
        sampleUrl: voice.sampleUrl,
        useCase: voice.use_case,
        lastUpdated: timestamp,
      });
    }

    console.log(`✅ ElevenLabs: ${elevenlabsVoices.length} voices (direct API call)`);
  } catch (error) {
    console.error("❌ Failed to fetch ElevenLabs voices:", error);
  }

  // LOVO - Wide coverage
  try {
    console.log("📡 Fetching Lovo voices directly from API...");
    const lovoVoices = await fetchLovoVoices();

    for (const voice of lovoVoices) {
      const normalizedLanguage = normalizeLanguageCode(voice.language || "en");

      // 🗡️ EXTRACT REGIONAL ACCENT FROM LOVO'S SAMPLE URL!
      let accentToNormalize = voice.accent;

      // Lovo hides regional info in sampleUrl - extract it!
      if (
        voice.sampleUrl &&
        voice.sampleUrl.includes("speaker-tts-samples")
      ) {
        const urlMatch = voice.sampleUrl.match(/\/([a-z]{2}-[A-Z]{2})-/);
        if (urlMatch) {
          const originalLanguageCode = urlMatch[1];
          const regionCode = originalLanguageCode.split("-")[1];
          console.log(
            `🔥 RESCUED REGIONAL ACCENT: ${originalLanguageCode} → ${regionCode} for voice ${voice.name}`
          );
          accentToNormalize = regionCode;
        }
      }

      const normalizedAccent = normalizeAccent(accentToNormalize, normalizedLanguage);

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
          supportsEmotional: true,
          supportsWhispering:
            voice.style?.toLowerCase().includes("whisper") || false,
          isMultilingual: false,
        },
        sampleUrl: voice.sampleUrl,
        useCase: voice.use_case,
        lastUpdated: timestamp,
      });
    }

    console.log(`✅ Lovo: ${lovoVoices.length} voices (direct API call)`);
  } catch (error) {
    console.error("❌ Failed to fetch Lovo voices:", error);
  }

  // OPENAI - Fallback (hardcoded, no API needed)
  try {
    console.log("📋 Loading OpenAI voices (hardcoded)...");
    const openAIVoices = getOpenAIVoices();

    for (const voice of openAIVoices) {
      const normalizedLanguage = normalizeLanguageCode(voice.language || "en");

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
        accent: "neutral",
        personality: voice.description || undefined,
        age: voice.age || undefined,
        capabilities: {
          supportsEmotional: true,
          supportsWhispering: true,
          isMultilingual: true,
        },
        sampleUrl: voice.sampleUrl,
        useCase: voice.use_case,
        lastUpdated: timestamp,
      });
    }

    console.log(`✅ OpenAI: ${openAIVoices.length} voices (hardcoded)`);
  } catch (error) {
    console.error("❌ Failed to load OpenAI voices:", error);
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

  // BYTEDANCE - TTS 2.0 only (emotion + style control)
  const bytedanceVoices = [
    // English voices
    {
      id: "en_female_stokie_uranus_bigtts",
      name: "Stokie",
      gender: "female" as const,
      language: "en",
      accent: "neutral",
      description: "Clear and natural English speaker",
      age: "young",
      use_case: "general",
    },
    {
      id: "en_female_dacey_uranus_bigtts",
      name: "Dacey",
      gender: "female" as const,
      language: "en",
      accent: "neutral",
      description: "Sweet and warm English speaker",
      age: "young",
      use_case: "general",
    },
    {
      id: "en_male_tim_uranus_bigtts",
      name: "Tim",
      gender: "male" as const,
      language: "en",
      accent: "neutral",
      description: "Clear and articulate English speaker",
      age: "middle_aged",
      use_case: "general",
    },
    // German voice
    {
      id: "de_male_seven_uranus_bigtts",
      name: "Sven",
      gender: "male" as const,
      language: "de",
      accent: "neutral",
      description: "Clear German speaker",
      age: "middle_aged",
      use_case: "general",
    },
    // French voice
    {
      id: "fr_male_usseau_uranus_bigtts",
      name: "Usseau",
      gender: "male" as const,
      language: "fr",
      accent: "neutral",
      description: "Clear French speaker",
      age: "middle_aged",
      use_case: "general",
    },
    // Mexican Spanish voice
    {
      id: "es_male_felipe_uranus_bigtts",
      name: "Felipe",
      gender: "male" as const,
      language: "es",
      accent: "mexican",
      description: "Clear Mexican Spanish speaker",
      age: "middle_aged",
      use_case: "general",
    },
    // Indonesian voice
    {
      id: "id_male_han_uranus_bigtts",
      name: "Han",
      gender: "male" as const,
      language: "id",
      accent: "neutral",
      description: "Clear Indonesian speaker",
      age: "middle_aged",
      use_case: "general",
    },
    // Brazilian Portuguese voice
    {
      id: "pt_male_martins_uranus_bigtts",
      name: "Martins",
      gender: "male" as const,
      language: "pt",
      accent: "brazilian",
      description: "Clear Brazilian Portuguese speaker",
      age: "middle_aged",
      use_case: "general",
    },
    // Japanese TTS 2.0 voice
    {
      id: "jp_female_minimi_uranus_bigtts",
      name: "Minimi",
      gender: "female" as const,
      language: "ja",
      accent: "neutral",
      description: "Clear and natural Japanese speaker",
      age: "young",
      use_case: "general",
    },
    // Multilingual TTS 2.0 voices (registered under zh, support ja/es/id/pt too)
    {
      id: "zh_female_vv_uranus_bigtts",
      name: "Vivi",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Vivid multilingual speaker",
      age: "young",
      use_case: "general",
    },
    {
      id: "zh_female_xiaohe_uranus_bigtts",
      name: "Mindy",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Vivid multilingual speaker",
      age: "young",
      use_case: "general",
    },
    {
      id: "zh_female_kefunvsheng_uranus_bigtts",
      name: "Tracy",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Warm multilingual speaker",
      age: "young",
      use_case: "general",
    },
    {
      id: "zh_male_shaonianzixin_uranus_bigtts",
      name: "Jess",
      gender: "male" as const,
      language: "zh",
      accent: "neutral",
      description: "Vivid multilingual speaker",
      age: "young",
      use_case: "general",
    },
    {
      id: "zh_female_linjianvhai_uranus_bigtts",
      name: "Pinky",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Sweet multilingual speaker",
      age: "young",
      use_case: "general",
    },
    {
      id: "zh_female_kiwi_uranus_bigtts",
      name: "Sweety",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Vivid multilingual speaker",
      age: "young",
      use_case: "general",
    },
    {
      id: "zh_female_sajiaoxuemei_uranus_bigtts",
      name: "Sandy",
      gender: "female" as const,
      language: "zh",
      accent: "neutral",
      description: "Sweet multilingual speaker",
      age: "young",
      use_case: "general",
    },
  ];

  // Add ByteDance TTS 2.0 voices to cache
  for (const bytedanceVoice of bytedanceVoices) {
    voices.push({
      id: bytedanceVoice.id,
      provider: "bytedance",
      catalogueId: `voice:bytedance:${bytedanceVoice.id}`,
      name: bytedanceVoice.name,
      displayName: `${bytedanceVoice.name} (ByteDance)`,
      gender: bytedanceVoice.gender,
      language: bytedanceVoice.language as Language,
      accent: bytedanceVoice.accent,
      personality: bytedanceVoice.description,
      age: bytedanceVoice.age,
      capabilities: {
        supportsEmotional: true,
        supportsWhispering: false,
        isMultilingual: bytedanceVoice.language === "zh", // zh-prefixed multilingual voices support ja/es/id/pt too
      },
      sampleUrl: undefined,
      useCase: bytedanceVoice.use_case,
      lastUpdated: timestamp,
    });
  }

  console.log(
    `ByteDance: ${bytedanceVoices.length} TTS 2.0 voices`
  );

  // LAHAJATI - Arabic dialect specialist (339 voices, 116 dialects)
  try {
    console.log("📡 Fetching Lahajati voices directly from API...");
    const lahajatiVoices = await fetchLahajatiVoices();

    for (const voice of lahajatiVoices) {
      voices.push({
        id: voice.id,
        provider: "lahajati",
        catalogueId: `voice:lahajati:${voice.id}`,
        name: voice.name,
        displayName: `${voice.name} (Lahajati)`,
        gender:
          voice.gender === "male" || voice.gender === "female"
            ? voice.gender
            : "neutral",
        language: "ar" as Language, // All Lahajati voices are Arabic
        accent: "standard", // Dialect-agnostic (dialect passed at TTS time)
        personality: voice.description || undefined,
        age: voice.age || undefined,
        capabilities: {
          supportsEmotional: true, // Via performance_id
          supportsWhispering: false,
          isMultilingual: false,
        },
        sampleUrl: voice.sampleUrl,
        useCase: voice.use_case,
        lastUpdated: timestamp,
      });
    }

    console.log(`✅ Lahajati: ${lahajatiVoices.length} voices (Arabic dialects)`);
  } catch (error) {
    console.error("❌ Failed to fetch Lahajati voices:", error);
  }

  return voices;
}

export async function POST() {
  try {
    console.log("🏰 BUILDING VOICE FORTRESS IN THE SHADOWS...");

    // Step 1: Clear existing cache
    await voiceCatalogue.clearCache();

    // Rate limit delay helper for Lahajati API
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Step 2: Refresh Lahajati dialect and performance definitions from API
    // Add delays between operations to avoid rate limiting
    console.log("🔄 Refreshing Lahajati dialect definitions...");
    const dialectResult = await lahajatiDialectService.refresh();
    if (!dialectResult.success) {
      console.warn("⚠️ Failed to refresh Lahajati dialects - using fallback mappings");
    }

    // Wait before next Lahajati operation (10s cooldown to avoid rate limiting)
    await sleep(10000);

    console.log("🔄 Refreshing Lahajati performance styles...");
    const performanceResult = await lahajatiPerformanceService.refresh();
    if (!performanceResult.success) {
      console.warn("⚠️ Failed to refresh Lahajati performances - ad-related styles may be limited");
    }

    // Wait before fetching voices (which includes Lahajati voices) - 10s cooldown
    await sleep(10000);

    // Step 3: Fetch and normalize all voices
    const voices = await fetchAndNormalizeVoices();

    if (voices.length === 0) {
      return NextResponse.json(
        {
          error: "No voices fetched from any provider",
        },
        { status: 500 }
      );
    }

    // Step 4: Build the magnificent towers!
    console.log(
      `🏗️ Building magnificent towers with ${voices.length} voices...`
    );

    await voiceCatalogue.buildTowers(voices);

    // Step 5: Get final stats
    const stats = await voiceCatalogue.getCacheStats();

    console.log("🎯 FORTRESS COMPLETE! Voice cache populated:");
    console.log(`   Total voices: ${stats.totalVoices}`);
    console.log(`   ElevenLabs: ${stats.byProvider.elevenlabs}`);
    console.log(`   Lovo: ${stats.byProvider.lovo}`);
    console.log(`   OpenAI: ${stats.byProvider.openai}`);
    console.log(`   Qwen: ${stats.byProvider.qwen}`);
    console.log(`   ByteDance: ${stats.byProvider.bytedance}`);
    console.log(`   Lahajati: ${stats.byProvider.lahajati}`);

    return NextResponse.json({
      success: true,
      message:
        "🔥 Voice fortress erected! The dragon will never see it coming.",
      stats: {
        totalVoices: stats.totalVoices,
        byProvider: stats.byProvider,
        voicesProcessed: voices.length,
        lahajatiDialects: dialectResult, // Dialect refresh stats
        lahajatiPerformances: performanceResult, // Performance style refresh stats
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
