/**
 * Create Comprehensive Test Ad - Direct Redis Write
 *
 * Creates a fully populated test ad with multiple versions across all three streams
 */

import { config } from "dotenv";
import { getRedisV3 } from "../src/lib/redis-v3";
import { generateProjectId } from "../src/utils/projectId";
import type {
  VoiceVersion,
  MusicVersion,
  SfxVersion,
} from "../src/types/versions";
import type { Voice } from "../src/types";

config();

// Test voices
const rachel: Voice = {
  id: "21m00Tcm4TlvDq8ikWAM",
  name: "Rachel",
  provider: "elevenlabs",
  gender: "female",
  language: "en",
  accent: "American",
  style: "Narrative",
  description: "Calm, confident, professional",
  age: "young",
  use_case: "Narration, audiobooks",
};

const adam: Voice = {
  id: "pNInz6obpgDQGcFmaJgB",
  name: "Adam",
  provider: "elevenlabs",
  gender: "male",
  language: "en",
  accent: "American",
  style: "Narrative",
  description: "Deep, resonant, authoritative",
  age: "middle_aged",
  use_case: "Narration, documentaries",
};

async function createTestAd() {
  console.log("🚀 Creating comprehensive test ad directly in Redis...\n");

  try {
    const redis = getRedisV3();
    const adId = generateProjectId();
    const sessionId = "default-session";
    const now = Date.now();

    console.log(`Ad ID: ${adId}`);
    console.log(`Session ID: ${sessionId}\n`);

    // 1. Create ad metadata
    const adMetadata = {
      name: "Spotify Premium - Test Campaign",
      brief: {
        clientDescription: "Spotify - Leading music streaming platform",
        creativeBrief: "Promote Spotify Premium with ad-free listening and offline downloads",
      },
      createdAt: now,
      lastModified: now,
      owner: sessionId,
    };

    await redis.set(`ad:${adId}:meta`, JSON.stringify(adMetadata));
    console.log(`✅ Created ad metadata`);

    // 2. Add to user's ads list
    const userAdsKey = `ads:by_user:${sessionId}`;
    const existingAds = await redis.get<string[]>(userAdsKey) || [];
    await redis.set(userAdsKey, JSON.stringify([...existingAds, adId]));
    console.log(`✅ Added to user's ads list`);

    // 3. Add to global ads index
    const allAds = await redis.get<string[]>("ads:all") || [];
    await redis.set("ads:all", JSON.stringify([...allAds, adId]));
    console.log(`✅ Added to global ads index\n`);

    // 4. Create voice versions
    console.log("📢 Creating voice versions...");

    const voiceVersions: VoiceVersion[] = [
      {
        voiceTracks: [
          {
            voice: rachel,
            text: "Ever get tired of ads interrupting your favorite songs?",
            playAfter: "start",
            overlap: 0,
            isConcurrent: false,
          },
          {
            voice: adam,
            text: "With Spotify Premium, you can listen ad-free. Plus download music for offline listening.",
            playAfter: "voice-0",
            overlap: 0,
            isConcurrent: false,
          },
          {
            voice: rachel,
            text: "Try Premium free for 1 month. Your music, uninterrupted.",
            playAfter: "voice-1",
            overlap: 0,
            isConcurrent: false,
          },
        ],
        generatedUrls: [],
        createdBy: "llm",
        status: "draft",
        createdAt: now - 3600000,
        promptContext: JSON.stringify({ format: "dialog" }),
      },
      {
        voiceTracks: [
          {
            voice: adam,
            text: "Spotify Premium. All your music. No ads. Download for offline. Try it free for 30 days.",
            playAfter: "start",
            overlap: 0,
            isConcurrent: false,
            speed: 1.0,
          },
        ],
        generatedUrls: ["/placeholder-voice-v2-0.mp3"],
        createdBy: "user",
        status: "active",
        createdAt: now - 1800000,
      },
      {
        voiceTracks: [
          {
            voice: adam,
            text: "Music without interruptions. That's Spotify Premium.",
            playAfter: "start",
            overlap: 0,
            isConcurrent: false,
          },
          {
            voice: rachel,
            text: "Ad-free listening, offline downloads, and unlimited skips. Get one month free.",
            playAfter: "voice-0",
            overlap: 0.5,
            isConcurrent: false,
          },
        ],
        generatedUrls: [],
        createdBy: "llm",
        status: "draft",
        createdAt: now - 600000,
      },
    ];

    // Write voice versions using correct Redis key pattern
    await redis.rpush(`ad:${adId}:voices:versions`, "v1");
    await redis.rpush(`ad:${adId}:voices:versions`, "v2");
    await redis.rpush(`ad:${adId}:voices:versions`, "v3");
    await redis.set(`ad:${adId}:voices:active`, "v2");
    await redis.set(`ad:${adId}:voices:v:v1`, JSON.stringify(voiceVersions[0]));
    await redis.set(`ad:${adId}:voices:v:v2`, JSON.stringify(voiceVersions[1]));
    await redis.set(`ad:${adId}:voices:v:v3`, JSON.stringify(voiceVersions[2]));
    console.log(`   ✅ Created 3 voice versions (v1: draft, v2: active, v3: draft)`);

    // 5. Create music versions
    console.log("🎵 Creating music versions...");

    const musicVersions: MusicVersion[] = [
      {
        musicPrompt: "Upbeat electronic music with modern synth sounds",
        musicPrompts: {
          loudly: "Electronic, Upbeat, Modern, Synth, Energetic",
          mubert: "electronic upbeat modern 128bpm",
          elevenlabs: "Upbeat electronic background music with synth",
        },
        generatedUrl: "/placeholder-music-v1.mp3",
        duration: 30,
        provider: "loudly",
        createdBy: "llm",
        status: "active",
        createdAt: now - 3500000,
      },
      {
        musicPrompt: "Chill ambient electronic with subtle piano",
        musicPrompts: {
          loudly: "Ambient, Chill, Electronic, Piano, Subtle",
          mubert: "ambient chill piano 90bpm",
          elevenlabs: "Chill ambient music with piano and electronic elements",
        },
        generatedUrl: "",
        duration: 30,
        provider: "mubert",
        createdBy: "user",
        status: "draft",
        createdAt: now - 1200000,
      },
    ];

    // Write music versions using correct Redis key pattern
    await redis.rpush(`ad:${adId}:music:versions`, "v1");
    await redis.rpush(`ad:${adId}:music:versions`, "v2");
    await redis.set(`ad:${adId}:music:active`, "v1");
    await redis.set(`ad:${adId}:music:v:v1`, JSON.stringify(musicVersions[0]));
    await redis.set(`ad:${adId}:music:v:v2`, JSON.stringify(musicVersions[1]));
    console.log(`   ✅ Created 2 music versions (v1: active, v2: draft)`);

    // 6. Create SFX versions
    console.log("🔊 Creating SFX versions...");

    const sfxVersions: SfxVersion[] = [
      {
        soundFxPrompts: [
          {
            description: "Soft whoosh transition sound",
            duration: 1.5,
            playAfter: "start",
            overlap: 0,
            placement: { type: "start" },
          },
        ],
        generatedUrls: ["/placeholder-sfx-v1-0.mp3"],
        createdBy: "llm",
        status: "active",
        createdAt: now - 3400000,
      },
      {
        soundFxPrompts: [
          {
            description: "Notification ping sound",
            duration: 0.5,
            playAfter: "voice-1",
            overlap: 0,
            placement: { type: "afterVoice", index: 1 },
          },
          {
            description: "Uplifting chord progression",
            duration: 2.0,
            playAfter: "voice-2",
            overlap: 0.5,
            placement: { type: "end" },
          },
        ],
        generatedUrls: [],
        createdBy: "user",
        status: "draft",
        createdAt: now - 900000,
      },
    ];

    // Write SFX versions using correct Redis key pattern
    await redis.rpush(`ad:${adId}:sfx:versions`, "v1");
    await redis.rpush(`ad:${adId}:sfx:versions`, "v2");
    await redis.set(`ad:${adId}:sfx:active`, "v1");
    await redis.set(`ad:${adId}:sfx:v:v1`, JSON.stringify(sfxVersions[0]));
    await redis.set(`ad:${adId}:sfx:v:v2`, JSON.stringify(sfxVersions[1]));
    console.log(`   ✅ Created 2 SFX versions (v1: active, v2: draft)\n`);

    console.log(`🎉 Test ad created successfully!`);
    console.log(`\n📊 Summary:`);
    console.log(`   • Ad ID: ${adId}`);
    console.log(`   • Session: ${sessionId}`);
    console.log(`   • Voice versions: 3 (1 active, 2 drafts)`);
    console.log(`   • Music versions: 2 (1 active, 1 draft)`);
    console.log(`   • SFX versions: 2 (1 active, 1 draft)`);
    console.log(`\n🌐 Visit: http://localhost:3003/ad/${adId}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating test ad:", error);
    process.exit(1);
  }
}

createTestAd();
