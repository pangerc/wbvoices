# Death to useVoiceManagerV2

**Goal:** Delete useVoiceManagerV2 entirely, replace with simple Redis-backed form

---

## The Problem

Single language dropdown change triggers 12+ API calls due to cascading useEffects in useVoiceManagerV2.

**Root cause:** useVoiceManagerV2 was built for ScripterPanel which no longer exists in this branch. It's dead code being used by BriefPanelV3 which doesn't need voice objects - LLM picks voices at generation time.

---

## The V3 Model

```
Brief Panel                          Voice Versions
─────────────                        ──────────────
provider = "elevenlabs"  ──────►     v1: elevenlabs voices
     (preference)           │
                           │
provider = "openai"     ───┘──►      v2: openai voices
     (changed)
                                     User compares v1 vs v2 in accordion
```

- **Brief stores preference** - constraint for LLM
- **Version captures actual** - immutable record of what was used
- **User compares versions** - each potentially different provider

---

## New Architecture

### API Calls Per Language Change

| Before | After |
|--------|-------|
| 12+ calls | 2-3 calls |
| Load voices from 3 providers | No voice loading |
| Multiple cascade triggers | Single-direction flow |

### Data Flow

```
Language Change:
  1. setLanguage('ar-OM')
  2. GET /api/voice-catalogue/language-options?language=ar-OM
     → { regions, accents, suggestedProvider, voiceCounts }
  3. Auto-select suggested provider (novice UX)
  4. Expert can override provider
  5. Debounced PATCH /api/ads/{adId}/brief

Done. No cascades.
```

---

## Implementation

### Step 1: New Consolidated API Endpoint

**Create: `src/app/api/voice-catalogue/language-options/route.ts`**

Single endpoint returns everything needed when language changes:

```typescript
// GET /api/voice-catalogue/language-options?language=ar-OM&campaignFormat=ad_read
{
  regions: [{ code: "all", displayName: "All Regions" }, ...],
  accents: [{ code: "neutral", displayName: "Neutral" }, ...],
  suggestedProvider: "elevenlabs",  // Best bet for this language
  voiceCounts: {
    elevenlabs: 12,
    openai: 0,
    qwen: 0,
    bytedance: 0,
    total: 12
  },
  dialogReady: true  // Has 2+ voices for dialogue format
}
```

### Step 2: New Lightweight Hook

**Create: `src/hooks/useBriefOptions.ts`**

```typescript
export function useBriefOptions() {
  const [languages, setLanguages] = useState<LanguageOption[]>([]);

  // Load languages ONCE on mount
  useEffect(() => {
    fetch('/api/voice-catalogue/languages')
      .then(r => r.json())
      .then(data => setLanguages(data.languages));
  }, []);

  return { languages };
}

export function useLanguageOptions(language: Language | null, campaignFormat: CampaignFormat) {
  const [options, setOptions] = useState<LanguageOptions | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!language) return;

    const controller = new AbortController();
    setIsLoading(true);

    fetch(`/api/voice-catalogue/language-options?language=${language}&campaignFormat=${campaignFormat}`, {
      signal: controller.signal
    })
      .then(r => r.json())
      .then(data => {
        setOptions(data);
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [language, campaignFormat]);

  return { options, isLoading };
}
```

### Step 3: Refactor BriefPanelV3

**Modify: `src/components/BriefPanelV3.tsx`**

Remove:
- `voiceManager` prop and all `voiceManager.*` usage
- `serverFilteredVoices` state and loading effect
- Provider reset effect (lines 587-611)
- `resolveProviderForGeneration` function

Replace with:
```typescript
export function BriefPanelV3({ adId, initialBrief, onDraftsCreated }: BriefPanelV3Props) {
  // Simple form state
  const [language, setLanguage] = useState<Language>(initialBrief?.selectedLanguage || 'en');
  const [region, setRegion] = useState<string | null>(initialBrief?.selectedRegion || null);
  const [accent, setAccent] = useState<string>(initialBrief?.selectedAccent || 'neutral');
  const [provider, setProvider] = useState<Provider>(initialBrief?.selectedProvider || 'any');
  const [campaignFormat, setCampaignFormat] = useState<CampaignFormat>(initialBrief?.campaignFormat || 'ad_read');
  // ... other form fields

  // Static data (loaded once)
  const { languages } = useBriefOptions();

  // Language-dependent options (single API call)
  const { options, isLoading } = useLanguageOptions(language, campaignFormat);

  // Auto-select suggested provider when language changes (novice UX)
  const prevLanguageRef = useRef(language);
  useEffect(() => {
    if (prevLanguageRef.current !== language && options?.suggestedProvider) {
      setProvider(options.suggestedProvider);
      setRegion(null);
      setAccent('neutral');
      prevLanguageRef.current = language;
    }
  }, [language, options?.suggestedProvider]);

  // Debounced save to Redis
  // ... (existing logic)

  // Derived state for UI
  const regions = options?.regions || [];
  const accents = options?.accents || [];
  const voiceCounts = options?.voiceCounts || null;
  const hasVoices = (voiceCounts?.total || 0) > 0;
  const dialogReady = options?.dialogReady ?? true;

  return (
    // ... form UI using local state + options
  );
}
```

### Step 4: Update Parent Component

**Modify: `src/app/ad/[id]/page.tsx`**

```typescript
// Before
const voiceManager = useVoiceManagerV2();
<BriefPanelV3 adId={adId} voiceManager={voiceManager} ... />

// After
<BriefPanelV3 adId={adId} ... />
```

### Step 5: Update Props Type

**Modify: `src/components/BriefPanelV3.tsx`**

```typescript
export type BriefPanelV3Props = {
  adId: string;
  initialBrief?: ProjectBrief | null;
  onDraftsCreated?: (result: { voices?: string; music?: string; sfx?: string; adName?: string }) => void;
};
// Remove voiceManager prop entirely
```

---

## Files to Change

| File | Action |
|------|--------|
| `src/app/api/voice-catalogue/language-options/route.ts` | **CREATE** |
| `src/hooks/useBriefOptions.ts` | **CREATE** |
| `src/components/BriefPanelV3.tsx` | **MODIFY** - Remove useVoiceManagerV2 |
| `src/app/ad/[id]/page.tsx` | **MODIFY** - Remove voiceManager prop |
| `src/hooks/useVoiceManagerV2.ts` | **DELETE** - No longer needed |
| `src/components/BriefPanel.tsx` | **DELETE** - Legacy component using useVoiceManagerV2 |

**Keep unchanged:**
- `src/components/ScripterPanel.tsx` - Already refactored to V3, doesn't use useVoiceManagerV2
- `src/app/api/voice-catalogue/route.ts` - Keep existing operations

---

## Provider Suggestion Logic

Server-side in `/language-options` endpoint:

```typescript
function suggestProvider(language: string, voiceCounts: VoiceCounts): Provider {
  // Chinese languages → prefer qwen
  if (language === 'zh' || language.startsWith('zh-')) {
    if (voiceCounts.qwen > 0) return 'qwen';
  }

  // Default priority: elevenlabs > openai > qwen > bytedance
  if (voiceCounts.elevenlabs > 0) return 'elevenlabs';
  if (voiceCounts.openai > 0) return 'openai';
  if (voiceCounts.qwen > 0) return 'qwen';
  if (voiceCounts.bytedance > 0) return 'bytedance';

  return 'any';
}
```

---

## Expected Outcome

**Before:** Language change → 12+ API calls, cascading effects, re-renders
**After:** Language change → 1 API call, auto-select provider, done

```
Console output after fix:
GET /api/voice-catalogue/language-options?language=zh&campaignFormat=ad_read 200 in 150ms
PATCH /api/ads/live-castle-967/brief 200 in 80ms
```

Two calls. That's it.
