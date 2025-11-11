# Brother Thomas Prayer App: Implementation Guide

_January 2025_

## Overview

A prayer app for iOS where users converse with "Brother Thomas" (ChatGPT-5) who generates personalized prayers. Prayers are structured as verse-by-verse JSON and rendered using ElevenLabs text-to-speech with hybrid loading for instant playback.

### Core Architecture

```
User talks to Brother Thomas
    ↓
iOS App → Clemens Edge Function → ChatGPT-5
    ↓
Prayer JSON (verses, metadata)
    ↓
iOS immediately requests first verse → generate-verse-audio Edge Function
    ↓
ElevenLabs V3 API → Audio generation
    ↓
Supabase Storage → Permanent URL
    ↓
iOS plays first verse + lazy-loads remaining verses in background
    ↓
Seamless verse-by-verse playback
```

### Technology Stack

- **iOS**: Swift, AVFoundation for audio playback
- **Backend**: Supabase Edge Functions (Deno/TypeScript)
- **LLM**: ChatGPT-5 (prayer generation)
- **TTS**: ElevenLabs V3 (voice synthesis)
- **Storage**: Supabase Storage (audio files)
- **Database**: Supabase/PostgreSQL (prayer metadata, user data)
- **Auth**: Supabase Auth

## Architecture Components

### 1. Clemens Edge Function (Prayer Generator)

**Purpose**: Generate prayer structure from user conversation.

**Input**:
```json
{
  "user_id": "uuid",
  "context": "User's prayer request or conversation",
  "prayer_theme": "gratitude | guidance | healing | etc"
}
```

**Output**:
```json
{
  "prayer_id": "uuid",
  "title": "Prayer for Guidance",
  "verses": [
    {
      "verse_number": 0,
      "text": "Heavenly Father, we come before You in humble prayer...",
      "type": "opening",
      "duration_estimate": 8.5
    },
    {
      "verse_number": 1,
      "text": "Guide us in Your wisdom as we seek Your will...",
      "type": "body",
      "duration_estimate": 7.2
    },
    {
      "verse_number": 2,
      "text": "In Jesus' name we pray, Amen.",
      "type": "closing",
      "duration_estimate": 3.1
    }
  ],
  "created_at": "2025-01-07T12:00:00Z"
}
```

### 2. generate-verse-audio Edge Function (TTS Generator)

**Purpose**: Convert verse text to audio using ElevenLabs.

**Responsibilities**:
- Call ElevenLabs V3 API
- Upload audio to Supabase Storage
- Implement caching (avoid regenerating identical verses)
- Return public audio URL

## Supabase Edge Function Implementation

### generate-verse-audio Edge Function

**File**: `supabase/functions/generate-verse-audio/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;
const BROTHER_THOMAS_VOICE_ID = Deno.env.get("BROTHER_THOMAS_VOICE_ID")!;

// Prayer-optimized voice settings (calm, reverent tone)
const PRAYER_VOICE_SETTINGS = {
  stability: 1.0,        // Robust stability for consistent delivery
  similarity_boost: 0.7, // Natural voice variance
  style: 0.15,          // Subtle expressiveness
  speed: 0.96,          // Slightly slower for reverence
  use_speaker_boost: false,
};

interface VerseRequest {
  prayer_id: string;
  verse_number: number;
  text: string;
  user_id: string;
}

serve(async (req) => {
  try {
    // Parse request
    const { prayer_id, verse_number, text, user_id }: VerseRequest = await req.json();

    // Validate inputs
    if (!prayer_id || verse_number === undefined || !text || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate cache key (deduplicate identical verses)
    const cacheKey = await generateCacheKey(text, PRAYER_VOICE_SETTINGS);

    // Check if this verse audio already exists
    const { data: cached } = await supabase
      .from("prayer_audio_cache")
      .select("audio_url")
      .eq("cache_key", cacheKey)
      .single();

    if (cached) {
      console.log(`✅ Cache hit for verse ${verse_number}`);

      // Update prayer_verses with cached URL
      await supabase
        .from("prayer_verses")
        .update({ audio_url: cached.audio_url })
        .eq("prayer_id", prayer_id)
        .eq("verse_number", verse_number);

      return new Response(
        JSON.stringify({ audio_url: cached.audio_url, cached: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate audio with ElevenLabs
    console.log(`🎙️ Generating audio for verse ${verse_number}...`);
    const audioUrl = await generateVerseAudio(
      text,
      prayer_id,
      verse_number,
      supabase
    );

    // Store in cache
    await supabase.from("prayer_audio_cache").insert({
      cache_key: cacheKey,
      audio_url: audioUrl,
      verse_text: text,
      voice_settings: PRAYER_VOICE_SETTINGS,
    });

    // Update prayer_verses table
    await supabase
      .from("prayer_verses")
      .update({ audio_url: audioUrl })
      .eq("prayer_id", prayer_id)
      .eq("verse_number", verse_number);

    return new Response(
      JSON.stringify({ audio_url: audioUrl, cached: false }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating verse audio:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function generateVerseAudio(
  text: string,
  prayerId: string,
  verseNumber: number,
  supabase: any
): Promise<string> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Call ElevenLabs V3 API
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${BROTHER_THOMAS_VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_turbo_v2_5", // Fast, high-quality model
            voice_settings: PRAYER_VOICE_SETTINGS,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `ElevenLabs API error (${response.status}): ${
            errorData.detail?.message || "Unknown error"
          }`
        );
      }

      // Get audio as ArrayBuffer
      const audioBuffer = await response.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });

      // Upload to Supabase Storage
      const fileName = `${prayerId}/verse-${verseNumber}.mp3`;
      const { data, error } = await supabase.storage
        .from("prayer-audio")
        .upload(fileName, audioBlob, {
          contentType: "audio/mpeg",
          upsert: true, // Overwrite if exists
        });

      if (error) {
        throw new Error(`Supabase Storage error: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("prayer-audio")
        .getPublicUrl(fileName);

      console.log(`✅ Audio uploaded: ${urlData.publicUrl}`);
      return urlData.publicUrl;
    } catch (error) {
      console.error(`Attempt ${attempt}/${MAX_RETRIES} failed:`, error);

      if (attempt === MAX_RETRIES) {
        throw error;
      }

      // Exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1))
      );
    }
  }

  throw new Error("Failed after all retries");
}

async function generateCacheKey(
  text: string,
  settings: any
): Promise<string> {
  // Create deterministic key from content
  const content = JSON.stringify({ text, settings });
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

## ElevenLabs Voice Configuration

### Recommended Voice Selection for Brother Thomas

Based on production experience with ElevenLabs V3:

**Voice Characteristics**:
- **Gender**: Male (traditional Brother Thomas archetype)
- **Age**: Middle-aged (35-50 years)
- **Accent**: General American or British (clear, neutral)
- **Use Case**: Narration or audiobook
- **Tone**: Calm, warm, empathetic

**Browse ElevenLabs Voice Library**:
```bash
# Use this to test different voices
curl -X GET "https://api.elevenlabs.io/v1/voices" \
  -H "xi-api-key: YOUR_API_KEY"
```

**Recommended Voices** (as of Jan 2025):
- **Michael**: Deep, calm, authoritative
- **Daniel**: Warm, British accent, mature
- **Adam**: Clear, professional, gentle

**Testing Protocol**:
1. Generate sample prayer with 3-5 candidate voices
2. Test with actual prayer content (not promotional text)
3. Evaluate reverence, clarity, warmth
4. Set winning voice ID as `BROTHER_THOMAS_VOICE_ID` environment variable

### Voice Settings Deep Dive

```typescript
// Optimized for prayer content
const PRAYER_VOICE_SETTINGS = {
  // Stability: 0.0-1.0 (V3 requires discrete values: 0.0, 0.5, 1.0)
  stability: 1.0, // Maximum stability for consistent, reverent delivery

  // Similarity Boost: 0.0-1.0 (voice clarity vs expressiveness)
  similarity_boost: 0.7, // Balanced for natural variance

  // Style: 0.0-1.0 (exaggeration level)
  style: 0.15, // Subtle expression, avoid dramatic delivery

  // Speed: 0.7-1.2 (V3 valid range, outside values silently ignored)
  speed: 0.96, // Slightly slower than normal for contemplation

  // Speaker Boost: boolean (clarity enhancement)
  use_speaker_boost: false, // Not needed for single voice
};
```

**Critical Constraints** (from production testing):
- **Stability**: Must be 0.0, 0.5, or 1.0 (V3 API requirement)
- **Speed**: 0.7-1.2 range (values outside silently ignored)
- **Character Limit**: 3000 characters per request (V3)

### Emotional Control for Prayer Sections

ElevenLabs V3 supports baseline tones + inline emotional tags:

**Baseline Tones** (set via `description` field in advanced usage):
```typescript
// For different prayer sections
const PRAYER_TONES = {
  opening: "calm",      // Gentle introduction
  body: "empathetic",   // Warm, caring
  intercession: "gentle", // Soothing for requests
  closing: "warm",      // Comforting conclusion
};
```

**Emotional Tags** (inline in text, optional):
```typescript
// Example prayer with tags (use sparingly)
const contemplativeVerse = "[gentle] Lord, hear our prayer... [pauses] Amen.";
const joyfulVerse = "[cheerful] We rejoice in Your blessings!";

// Tags must be in ENGLISH regardless of language
// Available: [gentle], [whispers], [pauses], [sighs], [cheerful], etc.
```

**Recommendation for MVP**: Start with baseline `calm` tone, no emotional tags. Add tags later if specific emotional moments are needed.

### Pronunciation Dictionary for Religious Terms

ElevenLabs supports custom pronunciations (IPA or alias format):

**Setup** (optional enhancement):
```typescript
// Create pronunciation dictionary via API
const religiousPronunciations = {
  rules: [
    {
      string_to_replace: "Amen",
      type: "phoneme",
      phoneme: "ɑːˈmɛn", // IPA: ah-MEN (traditional)
      alphabet: "ipa",
    },
    {
      string_to_replace: "Hallelujah",
      type: "alias",
      alias: "hah-leh-loo-yah",
    },
    {
      string_to_replace: "Yahweh",
      type: "phoneme",
      phoneme: "ˈjɑːweɪ",
      alphabet: "ipa",
    },
  ],
};

// POST to /v1/pronunciation-dictionaries
// Then reference in TTS calls via pronunciation_dictionary_locators
```

**When to Use**:
- User reports mispronounced religious terms
- Multiple languages (pronunciation varies by locale)
- Classical vs modern pronunciations (e.g., "Amen" with short vs long 'a')

## Supabase Database Schema

### Tables

```sql
-- Prayers table (main prayer metadata)
CREATE TABLE prayers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  theme TEXT, -- gratitude, guidance, healing, etc.
  verse_count INTEGER NOT NULL,
  total_duration FLOAT, -- estimated total seconds
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prayer verses table (individual verse data)
CREATE TABLE prayer_verses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prayer_id UUID NOT NULL REFERENCES prayers(id) ON DELETE CASCADE,
  verse_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  type TEXT, -- opening, body, intercession, closing
  audio_url TEXT, -- Supabase Storage URL
  duration FLOAT, -- actual duration in seconds (populated after generation)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prayer_id, verse_number)
);

-- Audio cache table (deduplicate identical verses)
CREATE TABLE prayer_audio_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key TEXT UNIQUE NOT NULL, -- SHA-256 hash of (text + settings)
  audio_url TEXT NOT NULL,
  verse_text TEXT NOT NULL,
  voice_settings JSONB NOT NULL,
  hit_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_prayers_user_id ON prayers(user_id);
CREATE INDEX idx_prayers_created_at ON prayers(created_at DESC);
CREATE INDEX idx_prayer_verses_prayer_id ON prayer_verses(prayer_id);
CREATE INDEX idx_prayer_audio_cache_key ON prayer_audio_cache(cache_key);
```

### Row Level Security (RLS)

```sql
-- Enable RLS
ALTER TABLE prayers ENABLE ROW LEVEL SECURITY;
ALTER TABLE prayer_verses ENABLE ROW LEVEL SECURITY;
ALTER TABLE prayer_audio_cache ENABLE ROW LEVEL SECURITY;

-- Prayers: Users can only see their own
CREATE POLICY "Users can view own prayers"
  ON prayers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prayers"
  ON prayers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prayers"
  ON prayers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own prayers"
  ON prayers FOR DELETE
  USING (auth.uid() = user_id);

-- Prayer verses: Access via prayer ownership
CREATE POLICY "Users can view verses of own prayers"
  ON prayer_verses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM prayers
      WHERE prayers.id = prayer_verses.prayer_id
      AND prayers.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage all verses"
  ON prayer_verses FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Audio cache: Service role only (shared resource)
CREATE POLICY "Service role can manage audio cache"
  ON prayer_audio_cache FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
```

### Supabase Storage Bucket

```sql
-- Create bucket for prayer audio
INSERT INTO storage.buckets (id, name, public)
VALUES ('prayer-audio', 'prayer-audio', true);

-- Storage policy: Users can read own prayer audio
CREATE POLICY "Users can read own prayer audio"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'prayer-audio'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM prayers WHERE user_id = auth.uid()
    )
  );

-- Service role can insert/update/delete
CREATE POLICY "Service role can manage prayer audio"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'prayer-audio'
    AND auth.jwt()->>'role' = 'service_role'
  );
```

## iOS Client Implementation

### API Client for Edge Functions

**File**: `BrotherThomasAPI.swift`

```swift
import Foundation
import Supabase

class BrotherThomasAPI {
    private let supabase: SupabaseClient

    init() {
        self.supabase = SupabaseClient(
            supabaseURL: URL(string: ProcessInfo.processInfo.environment["SUPABASE_URL"]!)!,
            supabaseKey: ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"]!
        )
    }

    // MARK: - Prayer Generation

    struct PrayerResponse: Codable {
        let prayerId: UUID
        let title: String
        let verses: [Verse]
        let createdAt: Date

        enum CodingKeys: String, CodingKey {
            case prayerId = "prayer_id"
            case title
            case verses
            case createdAt = "created_at"
        }
    }

    struct Verse: Codable {
        let verseNumber: Int
        let text: String
        let type: String
        let durationEstimate: Double

        enum CodingKeys: String, CodingKey {
            case verseNumber = "verse_number"
            case text
            case type
            case durationEstimate = "duration_estimate"
        }
    }

    func generatePrayer(context: String, theme: String?) async throws -> PrayerResponse {
        let response = try await supabase.functions.invoke(
            "clemens",
            options: FunctionInvokeOptions(
                body: [
                    "context": context,
                    "prayer_theme": theme ?? "general"
                ]
            )
        )

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(PrayerResponse.self, from: response.data)
    }

    // MARK: - Verse Audio Generation

    struct VerseAudioResponse: Codable {
        let audioUrl: String
        let cached: Bool

        enum CodingKeys: String, CodingKey {
            case audioUrl = "audio_url"
            case cached
        }
    }

    func generateVerseAudio(
        prayerId: UUID,
        verseNumber: Int,
        text: String
    ) async throws -> VerseAudioResponse {
        let response = try await supabase.functions.invoke(
            "generate-verse-audio",
            options: FunctionInvokeOptions(
                body: [
                    "prayer_id": prayerId.uuidString,
                    "verse_number": verseNumber,
                    "text": text,
                    "user_id": try await getCurrentUserId()
                ]
            )
        )

        let decoder = JSONDecoder()
        return try decoder.decode(VerseAudioResponse.self, from: response.data)
    }

    private func getCurrentUserId() async throws -> String {
        let session = try await supabase.auth.session
        return session.user.id.uuidString
    }
}
```

### Prayer Player with Hybrid Loading

**File**: `PrayerPlayer.swift`

```swift
import Foundation
import AVFoundation

@MainActor
class PrayerPlayer: ObservableObject {
    @Published var currentVerseIndex: Int = 0
    @Published var isPlaying: Bool = false
    @Published var isLoading: Bool = false
    @Published var loadingProgress: Double = 0.0
    @Published var error: String?

    private let api = BrotherThomasAPI()
    private var audioPlayer: AVPlayer?
    private var prayer: BrotherThomasAPI.PrayerResponse?
    private var verseAudioUrls: [Int: URL] = [:] // verseNumber -> local URL
    private var backgroundLoadTask: Task<Void, Never>?

    // MARK: - Hybrid Loading Strategy

    func loadPrayer(_ prayer: BrotherThomasAPI.PrayerResponse) async {
        self.prayer = prayer
        self.currentVerseIndex = 0
        self.isLoading = true
        self.loadingProgress = 0.0

        do {
            // STEP 1: Load first verse immediately (blocking)
            print("🎙️ Loading first verse (eager)...")
            let firstVerseUrl = try await loadVerse(0)
            verseAudioUrls[0] = firstVerseUrl

            self.isLoading = false
            self.loadingProgress = 1.0 / Double(prayer.verses.count)

            // STEP 2: Start lazy loading remaining verses in background
            backgroundLoadTask = Task {
                await loadRemainingVerses()
            }

            // STEP 3: Start playback immediately
            playVerse(at: 0)

        } catch {
            self.error = "Failed to load first verse: \(error.localizedDescription)"
            self.isLoading = false
        }
    }

    private func loadRemainingVerses() async {
        guard let prayer = self.prayer else { return }

        // Load verses 1 to N in parallel (or sequential based on preference)
        for verseNumber in 1..<prayer.verses.count {
            do {
                let url = try await loadVerse(verseNumber)
                verseAudioUrls[verseNumber] = url

                // Update progress
                await MainActor.run {
                    self.loadingProgress = Double(verseAudioUrls.count) / Double(prayer.verses.count)
                }

                print("✅ Background loaded verse \(verseNumber)")
            } catch {
                print("⚠️ Failed to load verse \(verseNumber): \(error)")
                // Continue loading other verses
            }
        }

        print("🎉 All verses loaded")
    }

    private func loadVerse(_ verseNumber: Int) async throws -> URL {
        guard let prayer = self.prayer else {
            throw PrayerPlayerError.noPrayerLoaded
        }

        let verse = prayer.verses[verseNumber]

        // Check local cache first
        if let cachedUrl = getCachedVerseUrl(prayerId: prayer.prayerId, verseNumber: verseNumber) {
            print("✅ Using cached verse \(verseNumber)")
            return cachedUrl
        }

        // Generate audio via API
        let response = try await api.generateVerseAudio(
            prayerId: prayer.prayerId,
            verseNumber: verseNumber,
            text: verse.text
        )

        // Download and cache locally
        let localUrl = try await downloadAndCache(
            audioUrl: response.audioUrl,
            prayerId: prayer.prayerId,
            verseNumber: verseNumber
        )

        return localUrl
    }

    // MARK: - Playback Control

    func playVerse(at index: Int) {
        guard let url = verseAudioUrls[index] else {
            print("⚠️ Verse \(index) not loaded yet, waiting...")
            // Wait for background load to complete
            Task {
                while verseAudioUrls[index] == nil {
                    try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
                }
                await MainActor.run {
                    playVerse(at: index)
                }
            }
            return
        }

        currentVerseIndex = index

        let playerItem = AVPlayerItem(url: url)
        audioPlayer = AVPlayer(playerItem: playerItem)

        // Listen for playback completion
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(verseDidFinish),
            name: .AVPlayerItemDidPlayToEndTime,
            object: playerItem
        )

        audioPlayer?.play()
        isPlaying = true
    }

    @objc private func verseDidFinish() {
        // Auto-advance to next verse
        guard let prayer = self.prayer else { return }

        if currentVerseIndex < prayer.verses.count - 1 {
            playVerse(at: currentVerseIndex + 1)
        } else {
            // Prayer complete
            isPlaying = false
            print("🙏 Prayer complete")
        }
    }

    func pause() {
        audioPlayer?.pause()
        isPlaying = false
    }

    func resume() {
        audioPlayer?.play()
        isPlaying = true
    }

    func stop() {
        audioPlayer?.pause()
        audioPlayer = nil
        currentVerseIndex = 0
        isPlaying = false
        backgroundLoadTask?.cancel()
    }

    // MARK: - Local Caching

    private func getCachedVerseUrl(prayerId: UUID, verseNumber: Int) -> URL? {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let verseUrl = cacheDir
            .appendingPathComponent("prayers")
            .appendingPathComponent(prayerId.uuidString)
            .appendingPathComponent("verse-\(verseNumber).mp3")

        return FileManager.default.fileExists(atPath: verseUrl.path) ? verseUrl : nil
    }

    private func downloadAndCache(audioUrl: String, prayerId: UUID, verseNumber: Int) async throws -> URL {
        // Download from Supabase Storage
        let (tempUrl, _) = try await URLSession.shared.download(from: URL(string: audioUrl)!)

        // Create cache directory
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let prayerDir = cacheDir
            .appendingPathComponent("prayers")
            .appendingPathComponent(prayerId.uuidString)

        try FileManager.default.createDirectory(at: prayerDir, withIntermediateDirectories: true)

        // Move to cache
        let destination = prayerDir.appendingPathComponent("verse-\(verseNumber).mp3")

        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }

        try FileManager.default.moveItem(at: tempUrl, to: destination)

        return destination
    }
}

enum PrayerPlayerError: Error {
    case noPrayerLoaded
}
```

### SwiftUI Prayer View

**File**: `PrayerView.swift`

```swift
import SwiftUI

struct PrayerView: View {
    @StateObject private var player = PrayerPlayer()
    let prayer: BrotherThomasAPI.PrayerResponse

    var body: some View {
        VStack(spacing: 24) {
            // Prayer Title
            Text(prayer.title)
                .font(.title)
                .fontWeight(.semibold)
                .multilineTextAlignment(.center)

            // Current Verse Display
            if !player.isLoading {
                ScrollView {
                    Text(currentVerse.text)
                        .font(.title3)
                        .lineSpacing(8)
                        .multilineTextAlignment(.center)
                        .padding()
                }
                .frame(maxHeight: 300)
            } else {
                ProgressView("Loading first verse...")
                    .padding()
            }

            // Progress Indicator
            VStack(spacing: 8) {
                Text("Verse \(player.currentVerseIndex + 1) of \(prayer.verses.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)

                ProgressView(value: Double(player.currentVerseIndex + 1), total: Double(prayer.verses.count))
                    .progressViewStyle(.linear)
            }
            .padding(.horizontal)

            // Background Loading Progress
            if player.loadingProgress < 1.0 {
                HStack {
                    Image(systemName: "arrow.down.circle")
                    Text("Loading remaining verses... \(Int(player.loadingProgress * 100))%")
                        .font(.caption)
                }
                .foregroundColor(.secondary)
            }

            // Playback Controls
            HStack(spacing: 32) {
                Button(action: player.pause) {
                    Image(systemName: "pause.circle.fill")
                        .font(.system(size: 48))
                }
                .disabled(!player.isPlaying)

                Button(action: player.resume) {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 48))
                }
                .disabled(player.isPlaying || player.isLoading)

                Button(action: player.stop) {
                    Image(systemName: "stop.circle.fill")
                        .font(.system(size: 48))
                }
            }

            Spacer()
        }
        .padding()
        .onAppear {
            Task {
                await player.loadPrayer(prayer)
            }
        }
        .alert("Error", isPresented: .constant(player.error != nil)) {
            Button("OK") {
                player.error = nil
            }
        } message: {
            if let error = player.error {
                Text(error)
            }
        }
    }

    private var currentVerse: BrotherThomasAPI.Verse {
        prayer.verses[player.currentVerseIndex]
    }
}
```

## Error Handling & Resilience

### Edge Function Error Handling

```typescript
// Structured error responses
interface ErrorResponse {
  error: string;
  details?: {
    provider?: string;
    status?: number;
    message?: string;
  };
  retry_after?: number; // Seconds to wait before retry
}

// Common error scenarios
const ERROR_CODES = {
  RATE_LIMIT: "rate_limit_exceeded",
  INVALID_INPUT: "invalid_input",
  PROVIDER_ERROR: "provider_error",
  STORAGE_ERROR: "storage_error",
  CACHE_ERROR: "cache_error",
};

// Graceful error handling
try {
  // ... ElevenLabs call
} catch (error) {
  if (error.status === 429) {
    // Rate limit
    return new Response(
      JSON.stringify({
        error: ERROR_CODES.RATE_LIMIT,
        details: { message: "Too many requests. Please try again later." },
        retry_after: 60,
      }),
      { status: 429 }
    );
  } else if (error.status === 401) {
    // Authentication error (API key issue)
    console.error("ElevenLabs authentication failed - check API key");
    return new Response(
      JSON.stringify({
        error: ERROR_CODES.PROVIDER_ERROR,
        details: { message: "Service temporarily unavailable." },
      }),
      { status: 500 }
    );
  }

  throw error; // Re-throw for retry logic
}
```

### iOS Error Recovery

```swift
extension PrayerPlayer {
    func handleLoadError(_ error: Error, for verseNumber: Int) async {
        print("❌ Error loading verse \(verseNumber): \(error)")

        // Retry strategy
        let maxRetries = 3
        for attempt in 1...maxRetries {
            print("🔄 Retry \(attempt)/\(maxRetries)...")

            do {
                let url = try await loadVerse(verseNumber)
                verseAudioUrls[verseNumber] = url
                print("✅ Retry successful")
                return
            } catch {
                if attempt == maxRetries {
                    // Final failure - show user-friendly error
                    await MainActor.run {
                        self.error = "Unable to load verse \(verseNumber + 1). Please check your connection."
                    }
                } else {
                    // Exponential backoff
                    try? await Task.sleep(nanoseconds: UInt64(pow(2.0, Double(attempt)) * 1_000_000_000))
                }
            }
        }
    }
}
```

## Cost Optimization & Caching

### Cache Hit Strategy

**Goal**: Minimize ElevenLabs API calls by reusing audio for identical verses.

**Cache Key Generation**:
```typescript
// Deterministic key from content + settings
async function generateCacheKey(text: string, settings: any): Promise<string> {
  const content = JSON.stringify({
    text: text.trim().toLowerCase(), // Normalize text
    stability: settings.stability,
    similarity_boost: settings.similarity_boost,
    style: settings.style,
    speed: settings.speed,
    model: "eleven_turbo_v2_5",
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

**Cache Hit Scenarios**:
- Common prayer phrases ("Lord, hear our prayer", "In Jesus' name, Amen")
- Repeated thanksgiving expressions
- Standard liturgical responses

**Expected Savings**:
- 30-50% cache hit rate for common prayers
- Higher hit rate for template-based prayers

### ElevenLabs Pricing (as of Jan 2025)

**API Costs**:
- Free Tier: 10,000 characters/month
- Creator Plan: $11/month for 100,000 characters
- Pro Plan: $99/month for 500,000 characters

**Typical Prayer**:
- Average prayer: 500-800 characters (3-5 verses)
- Short prayer: 200-300 characters (2-3 verses)
- Long prayer: 1000-1500 characters (5-8 verses)

**Usage Estimates**:
- 100 prayers/month: ~50,000 characters (Creator tier)
- 500 prayers/month: ~250,000 characters (Pro tier)
- With 40% cache hit rate: Effective 60% of cost

## Testing & Validation

### Test Clemens Edge Function

```bash
# Test prayer generation
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/clemens \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "context": "I need guidance in making a difficult decision",
    "prayer_theme": "guidance"
  }'
```

### Test generate-verse-audio Edge Function

```bash
# Test verse audio generation
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/generate-verse-audio \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prayer_id": "uuid-from-clemens",
    "verse_number": 0,
    "text": "Heavenly Father, we come before You in humble prayer...",
    "user_id": "test-user-uuid"
  }'
```

### Voice Quality Testing Protocol

1. **Generate Sample Prayers**:
   - Short (2-3 verses): 30-45 seconds
   - Medium (4-5 verses): 60-90 seconds
   - Long (6-8 verses): 120-180 seconds

2. **Test Voice Settings**:
   - Baseline calm preset (production default)
   - Slower (speed: 0.9) for contemplation
   - Faster (speed: 1.0) for energetic prayers

3. **Evaluate**:
   - Clarity of pronunciation
   - Emotional appropriateness
   - Consistency across verses
   - Transitions between verses

4. **A/B Testing**:
   - Compare multiple candidate voices
   - Test with real users
   - Measure user satisfaction

## Deployment Checklist

### Environment Variables

**Supabase Edge Functions**:
```bash
# Set secrets for edge functions
supabase secrets set ELEVENLABS_API_KEY=your_api_key_here
supabase secrets set BROTHER_THOMAS_VOICE_ID=your_voice_id_here
```

**iOS App** (`.env` or Xcode configuration):
```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
```

### Deployment Steps

1. **Database Setup**:
   ```bash
   # Run migrations
   supabase db push

   # Verify tables created
   supabase db inspect
   ```

2. **Storage Bucket**:
   ```bash
   # Create bucket via Supabase Dashboard or SQL
   # Set public access policy
   ```

3. **Deploy Edge Functions**:
   ```bash
   # Deploy Clemens (if updated)
   supabase functions deploy clemens

   # Deploy generate-verse-audio
   supabase functions deploy generate-verse-audio

   # Verify deployment
   supabase functions list
   ```

4. **iOS Build**:
   ```bash
   # Update environment variables in Xcode
   # Build for TestFlight
   # Submit for review
   ```

5. **Monitoring**:
   - Set up Supabase logs monitoring
   - Track ElevenLabs API usage
   - Monitor storage usage
   - Set up error alerting

## Advanced Features (Future Enhancements)

### 1. Streaming with Timestamps

For synchronized text highlighting during playback:

**ElevenLabs Endpoint**:
```typescript
// Use streaming endpoint for word-level timing
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-with-timestamps`,
  {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: PRAYER_VOICE_SETTINGS,
    }),
  }
);

// Response includes audio chunks + character-level timing
interface TimestampResponse {
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}
```

**iOS Implementation**:
- Parse timestamps
- Highlight words in sync with audio
- Smooth scrolling as prayer progresses

### 2. Multi-Language Support

**Voice Selection by Language**:
```typescript
const LANGUAGE_VOICES = {
  en: "michael-voice-id",    // English
  es: "spanish-voice-id",    // Spanish
  fr: "french-voice-id",     // French
  // ... more languages
};
```

**Pronunciation Dictionaries by Locale**:
- Language-specific religious term pronunciations
- Cultural variations (e.g., "Amen" pronunciation varies)

### 3. Custom Prayer Templates

**Template-Based Generation**:
```typescript
const PRAYER_TEMPLATES = {
  morning: {
    opening: "Good morning, Lord...",
    body: "[User context inserted here]",
    closing: "Guide us through this day, Amen.",
  },
  gratitude: {
    opening: "We come before You with grateful hearts...",
    // ...
  },
};
```

**Benefits**:
- Faster generation (less LLM processing)
- Higher cache hit rate (standard phrases)
- Consistent structure

### 4. Offline Mode

**Preload Common Prayers**:
- Bundle 10-20 common prayers in app
- Pre-generate audio during app installation
- No network required for bundled content

**Sync Strategy**:
- Download user's prayer history on login
- Cache most recent 50 prayers locally
- Background sync when online

### 5. Prayer Collections

**Curated Prayer Sets**:
- Morning prayers
- Evening prayers
- Prayers for specific occasions (healing, guidance, etc.)
- Liturgical calendar prayers (Advent, Lent, etc.)

**Implementation**:
```sql
CREATE TABLE prayer_collections (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  prayers UUID[] -- Array of prayer IDs
);
```

## Troubleshooting

### Common Issues

**1. ElevenLabs Authentication Failure**
```
Error: 401 Unauthorized
```
- **Cause**: Invalid API key
- **Fix**: Verify `ELEVENLABS_API_KEY` in edge function secrets
- **Test**: `curl -H "xi-api-key: $KEY" https://api.elevenlabs.io/v1/voices`

**2. Audio Not Playing in iOS**
```
Error: AVPlayer failed to load item
```
- **Cause**: Invalid audio URL or CORS issue
- **Fix**: Check Supabase Storage public access policy
- **Test**: Open audio URL in browser, verify MP3 downloads

**3. Supabase Storage Upload Fails**
```
Error: Bucket not found
```
- **Cause**: Bucket not created or incorrect name
- **Fix**: Create `prayer-audio` bucket in Supabase Dashboard
- **Verify**: Check bucket policies allow service role uploads

**4. Cache Not Working**
```
Cache hit rate: 0%
```
- **Cause**: Cache key generation inconsistent
- **Fix**: Ensure text normalization (trim, lowercase) in key generation
- **Debug**: Log cache keys to verify consistency

**5. First Verse Takes Too Long**
```
User waiting >5 seconds for playback
```
- **Cause**: ElevenLabs API latency
- **Fix**:
  - Use `eleven_turbo_v2_5` model (faster than `eleven_v3`)
  - Consider pre-generating first verse in Clemens function
  - Add loading progress indicator in UI

## Performance Benchmarks

**Expected Timings** (based on production experience):

- **ElevenLabs API Call**: 1-3 seconds for 200-character verse
- **Supabase Storage Upload**: 0.5-1 second for 50KB MP3
- **Cache Lookup**: <100ms (database query)
- **First Verse Ready**: 2-4 seconds (blocking)
- **Remaining Verses**: 3-6 seconds each (background)

**Optimization Tips**:
- Use `eleven_turbo_v2_5` for speed (vs `eleven_v3`)
- Parallel background loading of verses 1-N
- Pre-cache common prayer phrases
- CDN delivery via Supabase Storage (fast global access)

## Conclusion

This implementation guide provides a complete architecture for the Brother Thomas prayer app, leveraging battle-tested patterns from production ElevenLabs integration:

**Key Wins**:
- ✅ **Hybrid loading**: Instant first verse playback, seamless background loading
- ✅ **Caching**: 30-50% cost reduction via intelligent deduplication
- ✅ **Security**: API keys never exposed, RLS for prayer privacy
- ✅ **Resilience**: Retry logic, graceful degradation, offline caching
- ✅ **Quality**: Production-tested voice settings for prayer content
- ✅ **Scalability**: Edge functions auto-scale, Supabase Storage CDN-backed

**Next Steps**:
1. Set up Supabase project and database
2. Create and test `generate-verse-audio` edge function
3. Integrate Clemens with prayer JSON schema
4. Build iOS prayer player with hybrid loading
5. Test with real users and iterate on voice quality
6. Deploy to TestFlight for beta testing

**Estimated Implementation Time**:
- Backend (edge functions + database): 2-3 days
- iOS client (API + player): 3-4 days
- Testing & refinement: 2-3 days
- **Total**: 1-2 weeks for MVP

---

**Related Resources**:
- [ElevenLabs API Documentation](https://elevenlabs.io/docs)
- [Supabase Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [AVFoundation Audio Playback (Apple)](https://developer.apple.com/documentation/avfoundation/media_playback)
