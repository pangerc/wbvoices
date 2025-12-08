# Voice System Implementation Guide

## Quick Start

### How Voice Selection Works

1. **User selects language** → System loads available regions
2. **User selects region** (optional) → System filters voices by region
3. **User selects accent** (optional) → System shows provider counts
4. **System auto-selects provider** based on:
   - Campaign format (dialog needs 2+ voices)
   - Language (Chinese prefers Qwen/ByteDance)
   - Voice availability

### Provider Selection Logic

```typescript
// Implemented in: /src/utils/providerSelection.ts

// Chinese language hierarchy:
if (language === 'zh') {
  if (qwen >= minVoices) return 'qwen';
  if (bytedance >= minVoices) return 'bytedance';
  if (elevenlabs >= minVoices) return 'elevenlabs';
  return 'openai';
}

// Other languages:
if (elevenlabs >= minVoices) return 'elevenlabs';
return 'openai'; // Always has voices
```

### Cache Management

**Rebuild cache** (admin only):
```bash
curl -X POST http://localhost:3000/api/admin/voice-cache
```

**Check cache stats**:
```bash
curl http://localhost:3000/api/voice-catalogue?operation=stats
```

## Adding a New Voice Provider

### Step-by-Step Guide

#### 1. Update Type Definitions

**File**: `/src/types/index.ts`

```typescript
// Add to Provider union type
export type Provider =
  | "any"
  | "lovo"
  | "elevenlabs"
  | "openai"
  | "qwen"
  | "bytedance"
  | "newprovider"; // Add here
```

#### 2. Create Provider Class

**File**: `/src/lib/providers/NewProviderVoiceProvider.ts`

```typescript
import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { uploadVoiceToBlob } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';

export class NewProviderVoiceProvider extends BaseAudioProvider {
  readonly providerName = 'newprovider';
  readonly providerType = 'voice' as const;

  validateParams(body: Record<string, unknown>): ValidationResult {
    const { text, voiceId } = body;

    if (!text || typeof text !== 'string') {
      return { isValid: false, error: 'Text is required' };
    }

    if (!voiceId || typeof voiceId !== 'string') {
      return { isValid: false, error: 'Voice ID is required' };
    }

    return { isValid: true };
  }

  canAuthenticate(): boolean {
    return !!process.env.NEWPROVIDER_API_KEY;
  }

  async authenticate(): Promise<AuthCredentials> {
    const apiKey = process.env.NEWPROVIDER_API_KEY;

    if (!apiKey) {
      throw new Error("NewProvider API key is missing");
    }

    return { apiKey };
  }

  async makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { text, voiceId, projectId } = params;
    const { apiKey } = credentials;

    // Call provider API
    const response = await this.makeFetch(
      "https://api.newprovider.com/v1/tts",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          voice_id: voiceId,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await this.handleApiError(response);
      return {
        success: false,
        error: errorText,
      };
    }

    // Get audio data
    const audioData = await response.arrayBuffer();
    const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });

    // Upload to Vercel Blob
    const { url } = await uploadVoiceToBlob(
      audioBlob,
      text as string,
      'newprovider',
      projectId as string
    );

    return {
      success: true,
      audioUrl: url,
    };
  }
}
```

#### 3. Register Provider

**File**: `/src/lib/providers/index.ts`

```typescript
import { NewProviderVoiceProvider } from './NewProviderVoiceProvider';

// Register provider
AudioProviderFactory.register('voice', 'newprovider', NewProviderVoiceProvider);

// Export
export { NewProviderVoiceProvider } from './NewProviderVoiceProvider';
```

#### 4. Create API Route

**File**: `/src/app/api/voice/newprovider-v2/route.ts`

```typescript
// Use Node.js runtime if provider needs Node-specific APIs
// Otherwise use Edge runtime

import { NextRequest } from "next/server";
import { createProvider } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const provider = createProvider('voice', 'newprovider');
  return provider.handleRequest(req);
}
```

#### 5. Update Voice Cache Builder

**File**: `/src/app/api/admin/voice-cache/route.ts`

Add provider to cache building:

```typescript
// Fetch NewProvider voices
try {
  const response = await fetch(
    `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/voice/list?provider=newprovider`
  );
  if (response.ok) {
    const data = await response.json();
    const newproviderVoices = data.voices || [];

    for (const voice of newproviderVoices as ProviderVoice[]) {
      const normalizedLanguage = normalizeLanguageCode(voice.language || "en");
      const normalizedAccent = normalizeAccent(voice.accent, normalizedLanguage);

      voices.push({
        id: voice.id,
        provider: "newprovider",
        catalogueId: `voice:newprovider:${voice.id}`,
        name: voice.name,
        displayName: `${voice.name} (NewProvider)`,
        gender: voice.gender === "male" || voice.gender === "female"
          ? voice.gender : "neutral",
        language: normalizedLanguage as Language,
        accent: normalizedAccent,
        region: getRegionForAccent(normalizedAccent, normalizedLanguage),
        sampleUrl: voice.sampleUrl,
        personality: voice.personality,
        age: voice.age,
        useCase: voice.use_case,
        lastUpdated: timestamp,
      });
    }

    console.log(`✅ NewProvider: ${newproviderVoices.length} voices`);
  }
} catch (error) {
  console.error("❌ Failed to fetch NewProvider voices:", error);
}
```

#### 6. Update VoiceCounts Type

**File**: `/src/utils/providerSelection.ts`

```typescript
export type VoiceCounts = {
  elevenlabs: number;
  lovo: number;
  openai: number;
  qwen: number;
  bytedance: number;
  newprovider: number; // Add here
  any: number;
};
```

**File**: `/src/services/voiceCatalogueService.ts`

Update all VoiceCounts initializations:
```typescript
const totals: VoiceCounts = {
  elevenlabs: 0,
  lovo: 0,
  openai: 0,
  qwen: 0,
  bytedance: 0,
  newprovider: 0, // Add here
  any: 0
};
```

#### 7. Update Provider Selection

**File**: `/src/utils/providerSelection.ts`

Add to selection logic if needed:
```typescript
// If newprovider should be prioritized for certain languages
if (language === 'special' && voiceCounts.newprovider >= minVoices) {
  return "newprovider";
}
```

#### 8. Update Blob Storage Type

**File**: `/src/utils/blob-storage.ts`

```typescript
export async function uploadVoiceToBlob(
  audioBlob: Blob,
  voiceId: string,
  provider: 'elevenlabs' | 'lovo' | 'openai' | 'qwen' | 'bytedance' | 'newprovider',
  projectId?: string
): Promise<{ url: string; downloadUrl: string }> {
  // ...
}
```

#### 9. Add Environment Variables

**File**: `.env.local`

```bash
NEWPROVIDER_API_KEY=your-api-key-here
```

#### 10. Test Integration

```bash
# Rebuild cache
curl -X POST http://localhost:3000/api/admin/voice-cache

# Test TTS generation
curl -X POST http://localhost:3000/api/voice/newprovider-v2 \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test",
    "voiceId": "test-voice-id",
    "projectId": "test-project"
  }'
```

## Provider-Specific Considerations

### ElevenLabs
- **Multilingual voices**: Create multiple entries per `verified_languages`
- **Voice IDs**: Format `{voice_id}-{language}` for multilingual
- **API**: Requires `xi-api-key` header
- **Caveat**: Filter non-string values from `verified_languages` array

#### Voice Consistency Settings

To maintain voice identity consistency across different lines in dialogue ads:

- **`similarity_boost: 1.0`** - Maximum adherence to original voice identity
- **`use_speaker_boost: true`** - Boosts similarity to original speaker (slight latency increase)

These settings are applied to all presets in `ElevenLabsVoiceProvider.ts`.

**Why not use `seed`?** The ElevenLabs `seed` parameter only provides **reproducibility** (same text + same seed = identical output), not cross-line consistency. Different text will still produce natural variation regardless of seed. The `similarity_boost` and `use_speaker_boost` parameters actually target voice identity consistency.

**Trade-offs:**
- `use_speaker_boost: true` adds slight latency per request
- Very high similarity may slightly reduce emotional range (mitigated by keeping stability at expressive levels)

### OpenAI
- **Always included**: Bypass region filtering for global coverage
- **Accent**: Always "neutral" (synthetic)
- **Voice IDs**: Simple format (e.g., "alloy", "echo")
- **Pacing**: Support "default", "slow" via `speed` parameter

### Qwen (Chinese Specialist)
- **Language**: Only Chinese (zh)
- **Priority**: First choice for Chinese content
- **API**: Alibaba Cloud authentication

### ByteDance (Cantonese Specialist)
- **Languages**: Chinese variants + Japanese
- **Authentication**: Custom headers (not Bearer tokens)
  - `X-Api-App-Id`
  - `X-Api-Access-Key`
  - `X-Api-Resource-Id: volc.service_type.1000009`
  - `X-Api-App-Key: aGjiRDfUWi`
- **Request**: Requires `app.appid`, `app.cluster`, `request.reqid`
- **Edge Runtime**: Use Web Crypto API (no Node.js `crypto`)

### Lahajati (Arabic Specialist)
- **Languages**: Arabic with 116 dialect variants
- **Priority**: Primary choice for Arabic content
- **Dialects**: Dynamically fetched from Lahajati API during cache refresh
  - Stored in Redis via `lahajatiDialectService`
  - Fallback to hardcoded mappings if cache empty
- **Voice Instructions**: Uses Arabic persona/role format (not OpenAI structured format)
  - `input_mode: "0"` - Structured mode with `performance_id` + `dialect_id`
  - `input_mode: "1"` - Custom prompt mode with Arabic persona instructions
- **API**: Bearer token authentication (`LAHAJATI_SECRET_KEY`)
- **Accent Mapping**: Arabic country names → dialect IDs (e.g., "egyptian" → 7)
- **Key Files**:
  - Provider: `/src/lib/providers/LahajatiVoiceProvider.ts`
  - Dialect Service: `/src/services/lahajatiDialectService.ts`
  - Dialect Mapping: `/src/lib/providers/lahajatiDialectMapping.ts`

## Working with Multilingual Voices

### ElevenLabs Multilingual Expansion

Some ElevenLabs voices support multiple languages via `verified_languages`:

```typescript
// Raw API response
{
  voice_id: "abc123",
  name: "Sarah",
  verified_languages: ["en", "pl", "es"]
}

// Gets expanded to 3 voices:
[
  { id: "abc123-en", name: "Sarah", language: "en" },
  { id: "abc123-pl", name: "Sarah", language: "pl" },
  { id: "abc123-es", name: "Sarah", language: "es" }
]
```

**Implementation**: `/src/app/api/voice/list/route.ts`

```typescript
const voices = data.voices.flatMap((voice: ElevenLabsVoice): Voice[] => {
  if (voice.verified_languages && voice.verified_languages.length > 0) {
    return voice.verified_languages
      .filter((lang) => typeof lang === 'string' && lang) // Type safety!
      .map((langString) => ({
        id: `${voice.voice_id}-${langString}`,
        name: voice.name,
        language: normalizeLanguageCode(langString),
        isMultilingual: voice.verified_languages!.length > 1,
        // ... other properties
      }));
  }

  // Fallback for voices without verified_languages
  return [{ /* single voice */ }];
});
```

## Accent & Region Normalization

### Accent Normalization

**File**: `/src/utils/language.ts`

```typescript
export const normalizeAccent = (
  rawAccent: string | undefined,
  language: string
): string => {
  if (!rawAccent) return 'neutral';

  const accentLower = rawAccent.toLowerCase().trim();

  // Language-specific mappings
  const mappings: Record<string, Record<string, string>> = {
    es: {
      'mexican': 'mexican',
      'castilian': 'castilian',
      'argentinian': 'argentinian',
    },
    zh: {
      'cantonese': 'cantonese',
      'mandarin': 'mandarin',
    },
    pl: {
      'polish': 'polish',
      'mazovian': 'polish',
      'warsaw': 'polish',
    },
  };

  return mappings[language]?.[accentLower] || 'neutral';
};
```

### Region Mapping

```typescript
export const accentRegions: Record<string, string> = {
  // Chinese
  cantonese: 'hong_kong',
  mandarin: 'china',

  // Spanish
  mexican: 'latin_america',
  castilian: 'spain',

  // Polish
  polish: 'poland',

  // Default
  neutral: 'all',
};

export function getRegionForAccent(accent: string, language: string): string {
  return accentRegions[accent] || 'all';
}
```

## Common Patterns

### Server-Side Voice Filtering

Always filter voices server-side for consistency:

```typescript
// Client code
const response = await fetch(
  `/api/voice-catalogue?operation=filtered-voices` +
  `&language=${language}` +
  `&region=${region}` +
  `&campaignFormat=${campaignFormat}` +
  `&exclude=lovo`
);

const { voices, count, selectedProvider } = await response.json();
```

### Direct Voice Passing (Project Restoration)

Bypass state management for faster restoration:

```typescript
// Pass voices directly to avoid async state dependencies
const restoredVoices = await loadVoicesFromIds(project.voiceIds);

voiceManager.setCurrentVoices(restoredVoices, {
  bypassStateUpdate: true // Skip unnecessary re-renders
});
```

### Provider Count Updates

Real-time counts during accent selection:

```typescript
// Automatically updates when accent changes
useEffect(() => {
  if (!selectedLanguage) return;

  const updateCounts = async () => {
    const url = `/api/voice-catalogue?operation=region-counts` +
      `&language=${selectedLanguage}` +
      `&region=${selectedRegion}`;

    const counts = await fetch(url).then(r => r.json());
    setProviderCounts(counts);
  };

  updateCounts();
}, [selectedLanguage, selectedRegion, selectedAccent]);
```

## Troubleshooting

### Issue: Polish Voices Not Appearing

**Symptom**: ElevenLabs shows 0 Polish voices despite API returning them

**Cause**: `normalizeLanguageCode` receiving non-string values from `verified_languages`

**Fix**: Add type guard and filter

```typescript
// In normalizeLanguageCode
if (typeof locale !== 'string' || !locale) {
  return "en";
}

// In voice list expansion
.filter((lang) => typeof lang === 'string' && lang)
```

### Issue: ByteDance 401 Authentication Error

**Symptom**: "missing Authorization header" or "invalid auth token"

**Cause**: Incorrect header format

**Fix**: Use exact headers from documentation
```typescript
{
  'X-Api-App-Id': appId,
  'X-Api-Access-Key': accessToken,
  'X-Api-Resource-Id': 'volc.service_type.1000009',
  'X-Api-App-Key': 'aGjiRDfUWi',
}
```

### Issue: ByteDance "Missing required: app.appid"

**Symptom**: 400 error about missing fields

**Cause**: Field name mismatch in request body

**Fix**: Use exact field names
```typescript
{
  app: {
    appid: appId,        // NOT app_id
    token: accessToken,
    cluster: "volcano_tts" // NOT cluster_id
  },
  request: {
    reqid: `unique-id`,  // Required!
    text: "...",
  }
}
```

### Issue: Voice Count Discrepancy

**Symptom**: Provider dropdown shows different count than status text

**Cause**: Different APIs returning inconsistent results

**Fix**: Ensure both use same server-side filtering
```typescript
// Both should call filtered-voices operation
const counts = await fetch(
  `/api/voice-catalogue?operation=filtered-voices&...`
);
```

### Issue: Cache Not Updating

**Symptom**: New voices not appearing after provider update

**Solution**:
```bash
# Force rebuild cache
curl -X POST http://localhost:3000/api/admin/voice-cache

# Verify rebuild
curl http://localhost:3000/api/voice-catalogue?operation=stats
```

### Issue: Edge Runtime Compatibility

**Symptom**: "Module not found: Can't resolve 'crypto'"

**Cause**: Using Node.js `crypto` in Edge Runtime

**Fix**: Use Web Crypto API or switch to Node.js runtime
```typescript
// Remove Edge runtime if needed
// export const runtime = "edge";

// Or use Web Crypto
const hash = await crypto.subtle.digest('SHA-256', data);
```