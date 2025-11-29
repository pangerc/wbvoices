/**
 * Test Data Population Script for Version Streams
 *
 * Creates realistic test data in the V3 Redis instance including:
 * - Ad with Spotify Premium brief
 * - Multiple voice versions (LLM + user-created)
 * - Music versions with different providers
 * - Sound effects versions
 * - Activated versions for mixer testing
 *
 * Usage: pnpm tsx scripts/create-test-ad.ts
 */

import type {
  VoiceVersion,
  MusicVersion,
  SfxVersion,
} from "../src/types/versions";
import type { Voice } from "../src/types";

// ========== REALISTIC TEST DATA ==========

const testBrief = {
  clientDescription: "Spotify - Leading music streaming platform",
  creativeBrief:
    "Promote Spotify Premium with emphasis on ad-free listening and offline downloads. Target young professionals aged 25-35.",
  campaignFormat: "dialog" as const,
  selectedLanguage: "en" as const,
  selectedProvider: "elevenlabs" as const,
  adDuration: 30,
  selectedAccent: null,
  selectedAiModel: "openai" as const,
  musicProvider: "loudly" as const,
  selectedCTA: "Try Premium free for 1 month",
  selectedPacing: null,
};

// Realistic voice selections (ElevenLabs voices)
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

// ========== VOICE VERSIONS ==========

// Version 1: LLM-generated dialog (female-male)
const voiceV1: Omit<VoiceVersion, "createdAt"> = {
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
  generatedUrls: [], // Empty - not generated yet
  createdBy: "llm",
  status: "draft",
  promptContext: JSON.stringify(testBrief),
};

// Version 2: User-edited version (single narrator)
const voiceV2: Omit<VoiceVersion, "createdAt"> = {
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
  generatedUrls: ["/placeholder-voice-v2-0.mp3"], // Has audio so it can be activated
  createdBy: "user",
  status: "active", // This one is active
};

// Version 3: LLM recast with different voices
const voiceV3: Omit<VoiceVersion, "createdAt"> = {
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
      overlap: 0.5, // slight overlap
      isConcurrent: false,
    },
  ],
  generatedUrls: [],
  createdBy: "llm",
  status: "draft",
};

// ========== MUSIC VERSIONS ==========

const musicV1: Omit<MusicVersion, "createdAt"> = {
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
};

const musicV2: Omit<MusicVersion, "createdAt"> = {
  musicPrompt: "Chill ambient electronic with subtle piano",
  musicPrompts: {
    loudly: "Ambient, Electronic, Chill, Piano, Subtle",
    mubert: "ambient electronic chill 90bpm piano",
    elevenlabs: "Chill ambient electronic with piano background",
  },
  generatedUrl: "",
  duration: 30,
  provider: "loudly",
  createdBy: "user",
  status: "draft",
};

// ========== SFX VERSIONS ==========

const sfxV1: Omit<SfxVersion, "createdAt"> = {
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
};

const sfxV2: Omit<SfxVersion, "createdAt"> = {
  soundFxPrompts: [
    {
      description: "Digital notification ping",
      duration: 0.8,
      playAfter: "voice-1",
      overlap: 0,
      placement: { type: "afterVoice", index: 1 },
    },
    {
      description: "Uplifting chord progression",
      duration: 2,
      playAfter: "voice-2",
      overlap: 0.5,
      placement: { type: "end" },
    },
  ],
  generatedUrls: [],
  createdBy: "user",
  status: "draft",
};

// ========== SCRIPT EXECUTION ==========

async function createTestAd() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3003";
  // Use default-session so it appears in history drawer
  const sessionId = "default-session";

  console.log("🚀 Creating test ad with realistic data...\n");

  try {
    // 1. Create ad
    console.log("1️⃣  Creating ad...");
    const adResponse = await fetch(`${baseUrl}/api/ads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Spotify Premium - Test Campaign",
        brief: testBrief,
        sessionId,
      }),
    });

    if (!adResponse.ok) {
      const errorText = await adResponse.text();
      throw new Error(`Failed to create ad: ${errorText}`);
    }

    const { adId } = await adResponse.json();
    console.log(`   ✅ Created ad: ${adId}\n`);

    // 2. Create voice versions
    console.log("2️⃣  Creating voice versions...");
    const now = Date.now();
    const voiceVersions = [
      { ...voiceV1, createdAt: now - 3600000 }, // 1 hour ago
      { ...voiceV2, createdAt: now - 1800000 }, // 30 min ago
      { ...voiceV3, createdAt: now - 600000 }, // 10 min ago
    ];

    for (let i = 0; i < voiceVersions.length; i++) {
      const version = voiceVersions[i];
      const response = await fetch(`${baseUrl}/api/ads/${adId}/voices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(version),
      });

      if (!response.ok) {
        throw new Error(`Failed to create voice version: ${await response.text()}`);
      }

      const { versionId } = await response.json();
      console.log(
        `   ✅ Created voice ${versionId} (${version.createdBy}, ${version.status})`
      );

      // Activate if status is active
      if (version.status === "active") {
        const activateResponse = await fetch(
          `${baseUrl}/api/ads/${adId}/voices/${versionId}/activate`,
          {
            method: "POST",
          }
        );

        if (!activateResponse.ok) {
          throw new Error(
            `Failed to activate voice version: ${await activateResponse.text()}`
          );
        }

        console.log(`   🎯 Activated voice ${versionId}`);
      }
    }
    console.log();

    // 3. Create music versions
    console.log("3️⃣  Creating music versions...");
    const musicVersions = [
      { ...musicV1, createdAt: now - 3500000 }, // slightly before voice v1
      { ...musicV2, createdAt: now - 1200000 }, // 20 min ago
    ];

    for (let i = 0; i < musicVersions.length; i++) {
      const version = musicVersions[i];
      const response = await fetch(`${baseUrl}/api/ads/${adId}/music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(version),
      });

      if (!response.ok) {
        throw new Error(`Failed to create music version: ${await response.text()}`);
      }

      const { versionId } = await response.json();
      console.log(
        `   ✅ Created music ${versionId} (${version.createdBy}, ${version.status})`
      );

      if (version.status === "active") {
        const activateResponse = await fetch(
          `${baseUrl}/api/ads/${adId}/music/${versionId}/activate`,
          {
            method: "POST",
          }
        );

        if (!activateResponse.ok) {
          throw new Error(
            `Failed to activate music version: ${await activateResponse.text()}`
          );
        }

        console.log(`   🎯 Activated music ${versionId}`);
      }
    }
    console.log();

    // 4. Create SFX versions
    console.log("4️⃣  Creating SFX versions...");
    const sfxVersions = [
      { ...sfxV1, createdAt: now - 3400000 },
      { ...sfxV2, createdAt: now - 900000 }, // 15 min ago
    ];

    for (let i = 0; i < sfxVersions.length; i++) {
      const version = sfxVersions[i];
      const response = await fetch(`${baseUrl}/api/ads/${adId}/sfx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(version),
      });

      if (!response.ok) {
        throw new Error(`Failed to create SFX version: ${await response.text()}`);
      }

      const { versionId } = await response.json();
      console.log(
        `   ✅ Created SFX ${versionId} (${version.createdBy}, ${version.status})`
      );

      if (version.status === "active") {
        const activateResponse = await fetch(
          `${baseUrl}/api/ads/${adId}/sfx/${versionId}/activate`,
          {
            method: "POST",
          }
        );

        if (!activateResponse.ok) {
          throw new Error(
            `Failed to activate SFX version: ${await activateResponse.text()}`
          );
        }

        console.log(`   🎯 Activated SFX ${versionId}`);
      }
    }
    console.log();

    // 5. Rebuild mixer
    console.log("5️⃣  Rebuilding mixer...");
    const mixerResponse = await fetch(
      `${baseUrl}/api/ads/${adId}/mixer/rebuild`,
      {
        method: "POST",
      }
    );

    if (!mixerResponse.ok) {
      throw new Error(`Failed to rebuild mixer: ${await mixerResponse.text()}`);
    }

    console.log("   ✅ Mixer rebuilt\n");

    // 6. Summary
    console.log("=".repeat(60));
    console.log("🎉 Test ad created successfully!\n");
    console.log(`Ad ID: ${adId}`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`View at: ${baseUrl}/ad/${adId}`);
    console.log("=".repeat(60));
    console.log("\nVersion Summary:");
    console.log("  Voices: 3 versions (v2 active)");
    console.log("  Music:  2 versions (v1 active)");
    console.log("  SFX:    2 versions (v1 active)");
    console.log("\nWhat to test:");
    console.log("  ✓ Accordion expand/collapse");
    console.log("  ✓ Active badges and buttons");
    console.log("  ✓ Version activation (checkboxes)");
    console.log("  ✓ Tabbed interface (Voices/Music/SFX)");
    console.log("  ✓ Read-only content display");
  } catch (error) {
    console.error("\n❌ Error creating test ad:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the script
createTestAd();
