# Creative Pipeline Redesign: ElevenLabs V3 & Strategy Pattern Architecture

_October 2025_

## Overview

A comprehensive redesign of the voice generation creative pipeline, triggered by the discovery of ElevenLabs V3 capabilities and culminating in a Strategy Pattern refactor that eliminated 230 lines of switch/case complexity while adding powerful new features.

### The Journey

```
Investigation: "Which ElevenLabs model are we using?"
    ↓
Discovery: V3 offers 70+ languages, emotional tags, 3000 char limit
    ↓
Testing: Polish dialogue with emotional tags - GOLD!
    ↓
Architecture Review: Found 230 lines of switch/case chaos + missing gender field
    ↓
Refactor: Strategy Pattern implementation with provider-specific strategies
    ↓
Bug Fixes: Speed parameter restored, gender field added
    ↓
Feature: User-facing pacing control (🐢 Slow | 🐰 Fast)
    ↓
Result: Clean architecture + better voice quality + new capabilities
```

## The Architecture Problem

### What We Found

**File**: `src/app/api/ai/generate/route.ts` (original 443 lines)

**Problems Identified**:

1. **Switch/Case Chaos** (lines 67-296): 230 lines of provider-specific prompt construction
2. **Missing Gender Field**: Critical metadata not sent to LLM for dialog casting
3. **Code Duplication**: Similar prompt logic repeated for each provider
4. **Hard to Extend**: Adding new providers required 200+ lines of code
5. **Error-Prone**: Easy to forget provider-specific requirements

**Example of the Old Code**:
```typescript
// 230 lines of switch/case statements
switch (provider) {
  case "elevenlabs":
    styleInstructions = `For ElevenLabs, use the following emotional dimensions...
    // 50+ lines of provider-specific instructions
    `;
    break;
  case "openai":
    styleInstructions = `For OpenAI TTS, provide detailed "voiceInstructions"...
    // 40+ lines of different instructions
    `;
    break;
  case "lovo":
    // Another 30+ lines
    break;
  // ... more providers
}
```

### Missing Gender Field Bug

**Critical Discovery**: The gender field existed in the Voice type but was **never sent to the LLM**.

**Impact**:
- LLM couldn't make gender-aware voice selections
- Dialog format couldn't ensure male/female voice diversity
- Result: "Raed talking to himself" scenarios

**Evidence**:
```typescript
// OLD: Voice metadata sent to LLM (lines 106-134)
const voiceOptions = filteredVoices.map((voice) =>
  `${voice.name} (${voice.id})\n` +
  `  Personality: ${voice.description}\n` +
  `  Best for: ${voice.use_case}\n` +
  `  Age: ${voice.age}\n` +
  `  Accent: ${voice.accent}`
  // ❌ Gender field MISSING!
).join("\n\n");
```

## ElevenLabs V3 Discovery

### Why V3?

**Model Comparison**:

| Feature | V2 (eleven_multilingual_v2) | V3 (eleven_v3) |
|---------|----------------------------|----------------|
| Languages | 28 | 70+ |
| Emotional Tags | ❌ No | ✅ Yes ([laughs], [whispers], etc.) |
| Character Limit | 500 | 3,000 |
| Speed Parameter | ✅ Yes | ✅ Yes (we were stripping it!) |
| Stability Values | Continuous 0-1 | Discrete: 0.0, 0.5, 1.0 |
| Expressiveness | Good | Excellent |

### V3 Dual Control System

**Innovation**: Combine baseline tone presets with inline emotional tags for rich, expressive delivery.

#### 1. Baseline Tone (description field)

Sets the overall voice character via presets:

```typescript
// Available baseline tones
cheerful | happy | excited | energetic | dynamic |
calm | gentle | soothing |
serious | professional | authoritative |
empathetic | warm |
fast_read | slow_read
```

**Example**:
```json
{
  "description": "cheerful",
  "text": "Check out our new product!"
}
```

#### 2. Emotional Tags (inline in text)

Layer emotional moments for fine-grained control:

**Available Tags**:
- **Laughter**: `[laughs]`, `[chuckles]`, `[giggles]`, `[laughs harder]`, `[starts laughing]`, `[wheezing]`
- **Vocal Effects**: `[whispers]`, `[sighs]`, `[exhales]`, `[gasps]`, `[pauses]`, `[snorts]`, `[coughs]`
- **Emotions**: `[sarcastic]`, `[excited]`, `[curious]`, `[crying]`, `[mischievously]`

**Punctuation Controls**:
- **Ellipses** (...) - Creates pauses and thoughtful delivery
- **CAPITALIZATION** - Adds emphasis to specific words

**Example**:
```json
{
  "description": "cheerful",
  "text": "[laughs] You won't believe this! Our new product... [excited] it's AMAZING! [whispers] And just between us, the price is unbeatable."
}
```

**Critical Rule**: Tags must be in **ENGLISH** regardless of target language!

### V3 Stability Constraints Discovery

**The Error**:
```json
{
  "error": {
    "status": "invalid_ttd_stability",
    "message": "Invalid TTD stability value. Must be one of: [0.0, 0.5, 1.0]"
  }
}
```

**Root Cause**: V3 changed stability from continuous (0.0-1.0) to discrete values only.

**The Fix**: Updated all 15 presets in `ElevenLabsVoiceProvider.ts`:

```typescript
// V3 preset table - stability must be 0.0, 0.5, or 1.0
const PRESETS: Record<string, Settings> = {
  // Creative (0.0): High expressiveness
  cheerful: {
    stability: 0.0,  // Changed from 0.25
    similarity_boost: 0.85,
    style: 0.5,
    speed: 1.08,
    use_speaker_boost: false,
  },

  // Natural (0.5): Balanced delivery
  neutral: {
    stability: 0.5,  // Already correct
    similarity_boost: 0.75,
    style: 0.3,
    speed: 1.0,
    use_speaker_boost: false,
  },

  // Robust (1.0): Highly stable
  calm: {
    stability: 1.0,  // Changed from 0.75
    similarity_boost: 0.65,
    style: 0.15,
    speed: 0.96,
    use_speaker_boost: false,
  },
  // ... 12 more presets
};
```

**Mapping Logic**:
- **0.0 (Creative)**: cheerful, excited, energetic, fast_read
- **0.5 (Natural)**: neutral, warm, empathetic (default)
- **1.0 (Robust)**: calm, serious, professional, slow_read

## Strategy Pattern Refactor

### The Solution

**File Structure**:
```
src/lib/prompt-strategies/
├── BasePromptStrategy.ts          # Abstract base with common logic
├── ElevenLabsV3PromptStrategy.ts  # V3 dual control system
├── OpenAIPromptStrategy.ts        # voiceInstructions approach
├── LovoPromptStrategy.ts          # Baked-in styles
├── QwenPromptStrategy.ts          # Direct voice control
├── PromptStrategyFactory.ts       # Factory pattern
└── index.ts                       # Barrel exports
```

### BasePromptStrategy (Abstract Base)

**File**: `src/lib/prompt-strategies/BasePromptStrategy.ts`

**Key Features**:

1. **Gender Field Fix** (lines 76-98):
```typescript
formatVoiceMetadata(voice: Voice, _context: PromptContext): string {
  let desc = `${voice.name} (id: ${voice.id})`;

  // 🔥 FIX: Add gender field (previously missing)
  if (voice.gender) {
    desc += `\n  Gender: ${
      voice.gender.charAt(0).toUpperCase() + voice.gender.slice(1)
    }`;
  }

  if (voice.description) {
    desc += `\n  Personality: ${voice.description}`;
  }
  if (voice.use_case) {
    desc += `\n  Best for: ${voice.use_case}`;
  }
  if (voice.age) {
    desc += `\n  Age: ${voice.age}`;
  }
  if (voice.accent && voice.accent !== "general") {
    desc += `\n  Accent: ${voice.accent}`;
  }

  return desc;
}
```

2. **Template Method Pattern**:
```typescript
abstract class BasePromptStrategy implements PromptStrategy {
  // Abstract methods - must be implemented
  abstract buildStyleInstructions(context: PromptContext): string;
  abstract buildOutputFormat(campaignFormat: CampaignFormat): string;

  // Shared implementations
  formatVoiceMetadata(voice: Voice, context: PromptContext): string { /* ... */ }
  buildFormatGuide(campaignFormat: CampaignFormat): string { /* ... */ }
  buildPrompt(context: PromptContext): PromptResult { /* ... */ }
}
```

### ElevenLabsV3PromptStrategy

**File**: `src/lib/prompt-strategies/ElevenLabsV3PromptStrategy.ts`

**Complete Style Instructions**:
```typescript
buildStyleInstructions(context: PromptContext): string {
  const { pacing } = context;

  // Build pacing guidance if specified
  let pacingGuidance = "";
  if (pacing === "fast") {
    pacingGuidance = `
🐰 PACING REQUIREMENT: FAST-PACED DELIVERY
Create a fast-paced, energetic delivery with urgency and excitement.
RECOMMENDED baseline tones: fast_read, energetic, dynamic, excited
AVOID slow presets: calm, soothing, gentle, slow_read
Use shorter sentences and action-oriented language.
`;
  } else if (pacing === "slow") {
    pacingGuidance = `
🐢 PACING REQUIREMENT: SLOW-PACED DELIVERY
Create a slow, deliberate delivery with thoughtful pauses.
RECOMMENDED baseline tones: slow_read, calm, gentle, soothing
AVOID fast presets: energetic, dynamic, excited, fast_read
Use longer sentences with ellipses (...) for natural pauses.
`;
  }

  return `ElevenLabs V3 Model - Dual Emotional Control System:
${pacingGuidance ? pacingGuidance : ""}

BASELINE TONE (description field):
Choose ONE baseline tone to set the overall voice character:
cheerful | happy | excited | energetic | dynamic | calm | gentle | soothing | serious | professional | authoritative | empathetic | warm | fast_read | slow_read

Include this as "description" field (REQUIRED).

EMOTIONAL TAGS (inline in text):
Available tags:
- Laughter: [laughs], [chuckles], [giggles], [laughs harder]
- Vocal effects: [whispers], [sighs], [exhales], [gasps], [pauses]
- Emotions: [sarcastic], [excited], [curious], [crying]

Punctuation controls:
- Ellipses (...) - Creates pauses
- CAPITALIZATION - Adds emphasis

Tag placement guidelines:
- Match tags to voice personality
- Tags must be in ENGLISH regardless of target language
- Don't overuse - tags should punctuate, not dominate

Example:
"description": "cheerful",
"text": "[laughs] You won't believe this! Our new product... [excited] it's AMAZING!"

Stability settings (handled automatically):
- Creative (0.0): cheerful, excited, energetic, fast_read
- Natural (0.5): neutral, warm, empathetic (default)
- Robust (1.0): calm, serious, professional, slow_read

Character limit: 3,000 characters per voice segment`;
}
```

### OpenAIPromptStrategy

**File**: `src/lib/prompt-strategies/OpenAIPromptStrategy.ts`

**Approach**: Uses `voiceInstructions` field for detailed control:

```typescript
buildStyleInstructions(context: PromptContext): string {
  const { accent, region, pacing } = context;

  let instructions = `For OpenAI TTS, provide detailed "voiceInstructions":

Voice Affect: <brief description>
Tone: <emotional tone>
Pacing: <speed - slow/moderate/fast/rapid>
Emotion: <delivery style>
Emphasis: <what to highlight>
Pronunciation: <articulation style>
Pauses: <where and how long>

Example: "Voice Affect: Energetic spokesperson; Tone: Enthusiastic; Pacing: Fast with quick delivery; Emotion: Excited; Emphasis: Strong on brand name"`;

  // Add pacing-specific guidance if specified
  if (pacing === "fast") {
    instructions += `\n\n🐰 PACING REQUIREMENT: FAST
IMPORTANT: Include "Pacing: Rapid, energetic delivery with quick tempo"
Use short, punchy sentences with dynamic rhythm.`;
  } else if (pacing === "slow") {
    instructions += `\n\n🐢 PACING REQUIREMENT: SLOW
IMPORTANT: Include "Pacing: Slow, deliberate delivery with thoughtful pauses"
Use longer sentences with natural pauses.`;
  }

  return instructions;
}
```

### PromptStrategyFactory

**File**: `src/lib/prompt-strategies/PromptStrategyFactory.ts`

**Factory Pattern Implementation**:
```typescript
export class PromptStrategyFactory {
  private static strategies: Record<Provider, () => PromptStrategy> = {
    elevenlabs: () => new ElevenLabsV3PromptStrategy(),
    openai: () => new OpenAIPromptStrategy(),
    lovo: () => new LovoPromptStrategy(),
    qwen: () => new QwenPromptStrategy(),
    bytedance: () => new QwenPromptStrategy(), // Reuse
    any: () => new ElevenLabsV3PromptStrategy(), // Default
  };

  static create(provider: Provider): PromptStrategy {
    const factory = this.strategies[provider];
    if (!factory) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return factory();
  }
}
```

**Usage in Generate Route**:
```typescript
// BEFORE: 230 lines of switch/case
// ...

// AFTER: 2 lines
const strategy = PromptStrategyFactory.create(provider);
const { systemPrompt, userPrompt } = strategy.buildPrompt(promptContext);
```

### Refactored Generate Route

**File**: `src/app/api/ai/generate/route.ts`

**Before**: 443 lines with 230 lines of switch/case logic
**After**: 213 lines (52% reduction)

**Key Changes**:

```typescript
// Build prompt context (lines 89-104)
const promptContext: PromptContext = {
  language,
  languageName,
  provider,
  voices: filteredVoices as Voice[],
  campaignFormat,
  duration,
  clientDescription,
  creativeBrief,
  region,
  accent,
  cta,
  dialectInstructions,
  pacing: pacing || undefined, // New: pacing control
};

// Generate prompts using strategy (lines 105-107)
const strategy = PromptStrategyFactory.create(provider);
const { systemPrompt, userPrompt } = strategy.buildPrompt(promptContext);

// Rest of LLM call logic unchanged
const response = await client.chat.completions.create({
  model,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
  temperature,
  // ...
});
```

## Critical Bug Fixes

### Bug 1: Speed Parameter Stripped

**Location**: `src/lib/providers/ElevenLabsVoiceProvider.ts:258-264`

**Discovery**: We tested V3 speed parameter and it **WORKS**, but we were removing it!

**Test Results** (from `/api/admin/test-v3-dialogue`):
```json
{
  "v3_fast_speed": {
    "audio_url": "https://...",
    "speed_tested": 1.15,
    "description": "SUCCESS - V3 accepts speed parameter!"
  },
  "v3_slow_speed": {
    "audio_url": "https://...",
    "speed_tested": 0.9,
    "description": "SUCCESS - V3 accepts speed parameter!"
  }
}
```

**The Fix**:
```typescript
// BEFORE (lines 258-264):
// Remove speed parameter as it's not supported in current ElevenLabs API
const apiVoiceSettings = {
  stability: voiceSettings.stability,
  similarity_boost: voiceSettings.similarity_boost,
  style: voiceSettings.style,
  use_speaker_boost: voiceSettings.use_speaker_boost,
  // speed is OMITTED! ❌
};

// AFTER:
// V3 supports speed parameter (empirically validated)
const apiVoiceSettings = {
  stability: voiceSettings.stability,
  similarity_boost: voiceSettings.similarity_boost,
  style: voiceSettings.style,
  use_speaker_boost: voiceSettings.use_speaker_boost,
  speed: voiceSettings.speed, // ✅ Restored!
};
```

**Impact**:
- ✅ fast_read preset now works (speed: 1.15)
- ✅ slow_read preset now works (speed: 0.9)
- ✅ All 15 presets function as designed

### Bug 2: Missing Gender Field

**Location**: `src/lib/prompt-strategies/BasePromptStrategy.ts:76-98`

**The Fix**: Added gender to voice metadata sent to LLM.

**Impact**:
- ✅ LLM can now ensure gender diversity in dialogs
- ✅ "Raed talking to himself" scenarios eliminated
- ✅ Better voice casting for conversation-style ads

## Pacing Control Feature

### User Experience

**UI Location**: `src/components/BriefPanel.tsx` - Row 3, next to Duration slider

**Design**:
```
┌─────────────────────────────────────┐
│ Duration Slider (2/3 width)         │
│ ├─ 10s─15s─20s─25s─30s─35s─40s...  │
├─────────────────────────────────────┤
│ Pacing Buttons (1/3 width)          │
│ ┌────┐  ┌────┐                      │
│ │ 🐢 │  │ 🐰 │                      │
│ └────┘  └────┘                      │
│ Slow    Fast                        │
└─────────────────────────────────────┘
```

**Interaction**:
- Click 🐢 Slow → toggles slow pacing (click again to deselect)
- Click 🐰 Fast → toggles fast pacing (click again to deselect)
- No selection → normal/default pacing (LLM chooses freely)
- Only one can be active at a time

### Technical Implementation

**Type System** (`src/types/index.ts`):
```typescript
export type Pacing = "slow" | "normal" | "fast";
```

**PromptContext Extension** (`src/lib/prompt-strategies/BasePromptStrategy.ts:19`):
```typescript
export interface PromptContext {
  // ... existing fields
  pacing?: Pacing; // Optional - undefined means "normal"
}
```

**Data Flow**:
```
BriefPanel State (selectedPacing)
    ↓
ai-api-client.generateCreativeCopy(pacing)
    ↓
/api/ai/generate (pacing in request body)
    ↓
PromptContext (pacing: pacing || undefined)
    ↓
Strategy.buildStyleInstructions(context)
    ↓
LLM receives pacing guidance
    ↓
LLM chooses appropriate preset (e.g., "fast_read")
    ↓
Audio API applies speed parameter from preset
```

### Architecture: Why It's Elegant

**The Key Insight**: LLM chooses the preset, speed flows through automatically.

**Decoupled Design**:
1. **User selects pacing** → UI state
2. **Pacing sent to LLM** → Prompt guidance
3. **LLM chooses preset** → "description": "energetic"
4. **Audio API applies speed** → PRESETS["energetic"].speed = 1.12

**No Session Variables Needed**: Everything flows through the existing `description`/`style` field!

**Example Flow**:

```typescript
// User clicks 🐰 Fast
selectedPacing = "fast"

// LLM receives guidance
`
🐰 PACING REQUIREMENT: FAST-PACED DELIVERY
RECOMMENDED baseline tones: fast_read, energetic, dynamic, excited
`

// LLM chooses preset
{
  "description": "energetic"
}

// Audio API applies preset
PRESETS["energetic"] = {
  stability: 0.0,
  speed: 1.12  // ← Fast pacing applied!
}
```

### Provider-Specific Adaptations

**ElevenLabs V3**: Uses preset recommendations + speed parameter
```typescript
if (pacing === "fast") {
  "RECOMMENDED: fast_read, energetic, dynamic"
  // → LLM chooses → speed=1.12 applied
}
```

**OpenAI**: Emphasizes pacing in voiceInstructions
```typescript
if (pacing === "fast") {
  "Pacing: Rapid, energetic delivery with quick tempo"
  // → LLM includes in voiceInstructions field
}
```

**Lovo/Qwen**: General pacing guidance (limited API control)
```typescript
if (pacing === "fast") {
  "Create fast-paced delivery with shorter sentences"
  // → LLM adjusts text content and word choice
}
```

## Testing & Validation

### V3 Test Endpoint

**File**: `src/app/api/admin/test-v3-dialogue/route.ts`

**Purpose**:
- Compare V2 vs V3 models
- Test speed parameter support
- Validate emotional tags

**Features**:
- Translates English dialogue to target language (default: Polish)
- Generates 4 audio samples:
  1. V2 baseline (no tags)
  2. V3 with emotional tags
  3. V3 with fast speed (1.15)
  4. V3 with slow speed (0.9)

**Usage**:
```bash
curl -X POST http://localhost:3000/api/admin/test-v3-dialogue \
  -H "Content-Type: application/json" \
  -d '{
    "text": "[laughs] Testing speed control!",
    "skipTranslation": true
  }'
```

**Response**:
```json
{
  "success": true,
  "results": {
    "v2_model": {
      "audio_url": "https://...",
      "model": "eleven_multilingual_v2"
    },
    "v3_model": {
      "audio_url": "https://...",
      "model": "eleven_v3"
    },
    "v3_fast_speed": {
      "audio_url": "https://...",
      "speed_tested": 1.15,
      "description": "SUCCESS!"
    },
    "v3_slow_speed": {
      "audio_url": "https://...",
      "speed_tested": 0.9,
      "description": "SUCCESS!"
    }
  }
}
```

## Impact & Benefits

### Code Quality Improvements

**Metrics**:
- ✅ **52% code reduction** in generate route (443 → 213 lines)
- ✅ **Eliminated 230 lines** of switch/case chaos
- ✅ **7 new strategy files** with clean separation of concerns
- ✅ **Full TypeScript type safety** with proper interfaces
- ✅ **Zero architectural compromises**

**Maintainability**:
- ✅ Adding new providers: ~20-30 lines vs 200+ lines
- ✅ Provider logic isolated and testable
- ✅ Easy to understand and modify
- ✅ No complex parameter threading

### Feature Capabilities

**V3 Emotional Control**:
- ✅ Emotional tags ([laughs], [whispers], etc.)
- ✅ Punctuation controls (ellipses, CAPS)
- ✅ Baseline + tags dual control system
- ✅ 3,000 character limit (6x increase from 500)

**Pacing Control**:
- ✅ User-facing 🐢 Slow | 🐰 Fast toggle
- ✅ LLM-driven preset selection
- ✅ Automatic speed parameter application
- ✅ Provider-aware implementation

**Fixed Bugs**:
- ✅ Gender field now sent to LLM
- ✅ Speed parameter restored for V3
- ✅ All 15 presets work correctly
- ✅ Stability values V3-compliant

### Business Value

**Content Quality**:
- ✅ Better emotional expressiveness in ads
- ✅ More authentic dialog with gender diversity
- ✅ Pacing control for different campaign styles
- ✅ Longer-form content support (60s ads)

**Development Velocity**:
- ✅ Faster to add new providers
- ✅ Easier to test provider-specific logic
- ✅ Cleaner codebase for onboarding
- ✅ Reduced bug surface area

**Market Expansion**:
- ✅ 70+ languages with V3
- ✅ Better quality for non-English markets
- ✅ Emotional expressiveness across all languages
- ✅ Competitive advantage in voice quality

## Files Modified

### Core Strategy Pattern (7 new files)

1. **src/lib/prompt-strategies/BasePromptStrategy.ts**
   - Abstract base class with common logic
   - Gender field fix (lines 80-84)
   - Template method pattern implementation

2. **src/lib/prompt-strategies/ElevenLabsV3PromptStrategy.ts**
   - V3 dual control system
   - Pacing guidance integration
   - Emotional tags documentation

3. **src/lib/prompt-strategies/OpenAIPromptStrategy.ts**
   - voiceInstructions approach
   - Pacing emphasis in instructions

4. **src/lib/prompt-strategies/LovoPromptStrategy.ts**
   - Baked-in styles approach
   - Style field handling

5. **src/lib/prompt-strategies/QwenPromptStrategy.ts**
   - Direct voice control
   - Minimal style instructions

6. **src/lib/prompt-strategies/PromptStrategyFactory.ts**
   - Factory pattern implementation
   - Provider strategy mapping

7. **src/lib/prompt-strategies/index.ts**
   - Barrel exports for clean imports

### Critical Fixes (2 files)

8. **src/lib/providers/ElevenLabsVoiceProvider.ts**
   - Speed parameter restored (line 264)
   - Updated comment explaining V3 support

9. **src/app/api/ai/generate/route.ts**
   - Refactored from 443 → 213 lines
   - Strategy pattern integration
   - Pacing parameter handling

### Pacing Feature (3 files)

10. **src/types/index.ts**
    - Added Pacing type
    - Extended type system

11. **src/utils/ai-api-client.ts**
    - Added pacing parameter
    - Updated function signature

12. **src/components/BriefPanel.tsx**
    - Pacing UI controls
    - Icon buttons with tooltips

### Testing (1 file)

13. **src/app/api/admin/test-v3-dialogue/route.ts**
    - V2 vs V3 comparison
    - Speed parameter validation
    - Enhanced with speed tests

## Provider Capabilities Matrix

| Provider | Model | Emotional Control | Pacing | Speed Param | Char Limit |
|----------|-------|-------------------|--------|-------------|------------|
| **ElevenLabs V3** | eleven_v3 | Baseline + Tags | Presets + Speed | ✅ Yes | 3,000 |
| **ElevenLabs V2** | eleven_multilingual_v2 | Presets only | Speed | ✅ Yes | 500 |
| **OpenAI** | tts-1 | voiceInstructions | voiceInstructions | ❌ No | 4,096 |
| **Lovo** | Various | Baked into voice | Limited | ❌ No | ~500 |
| **Qwen** | qwen-tts-latest | Direct control | Limited | ❌ No | 512 tokens |

## Future Considerations

### Potential Enhancements

**Per-Segment Pacing**:
- Allow different pacing for different voice segments
- UI: Pacing control in ScripterPanel per segment
- Implementation: Extend VoiceTrack type with pacing field

**Emotional Tag Suggestions**:
- LLM suggests appropriate emotional tags
- UI: Preview suggested tags before generation
- Implementation: Add tag analysis to LLM prompt

**Advanced Preset Customization**:
- Allow users to create custom stability/style combinations
- UI: Advanced settings panel
- Implementation: Custom preset storage in project data

**Pacing Preview Mode**:
- Test pacing before final generation
- UI: Quick preview button with sample text
- Implementation: Lightweight TTS call with preset

### Next Architecture Step: Provider Standardization

**Current State**: Voice/music providers still use pattern-per-file approach.

**Vision**: Apply Strategy Pattern to all audio providers.

**Benefits**:
- 90% code reduction for new provider integrations
- Unified error handling and response formatting
- Easier testing with base class mocking
- Consistent API across all providers

**Estimated Impact**:
- Current: ~200 lines per new provider
- Future: ~20-30 lines per new provider
- Maintenance: Fix once, applies to all

## Lessons Learned

### What Worked Well

1. **Empirical Testing**: Creating test endpoint proved V3 capabilities
2. **Conservative Approach**: Kept presets + layered tags on top
3. **User Input**: "If you're certain they don't make sense..." → kept presets
4. **Strategy Pattern**: Clean separation eliminated complexity
5. **Type Safety**: TypeScript caught issues early

### What We'd Do Differently

1. **Earlier Investigation**: Should have checked V3 sooner
2. **Documentation**: API docs claimed speed wasn't supported (wrong!)
3. **Testing**: Test endpoints are invaluable - create them first
4. **Architecture Reviews**: Should do regular code audits

### Key Principles Applied

1. **Single Responsibility**: Each strategy handles one provider
2. **Open/Closed**: Open for extension (new providers), closed for modification
3. **Liskov Substitution**: All strategies interchangeable via interface
4. **Dependency Inversion**: Depend on abstractions (PromptStrategy), not concrete classes
5. **Don't Repeat Yourself**: Common logic in base class

## Conclusion

The ElevenLabs V3 upgrade and Strategy Pattern refactor represents a major architectural evolution of the creative pipeline. What started as a simple question ("Which model are we using?") led to:

- **230 lines of code eliminated** through clean architecture
- **Critical bugs fixed** (gender field, speed parameter)
- **New features added** (pacing control, emotional tags)
- **System improved** (6x character limit, 70+ languages)
- **Foundation laid** for future provider integrations

The result is a maintainable, extensible system that produces higher-quality voice content while being easier to work with than before.

**Key Achievement**: Delivered both architectural cleanup AND feature improvements simultaneously, proving that refactoring doesn't have to slow down feature development - it can accelerate it.

## Voice Filtering: Region + Accent Deep Dive

_Added October 2025_

### The Problem

Region + Accent filtering wasn't working:
- Spanish + Argentinian → Shows voices ✅
- Spanish + Latin America + Argentinian → 0 voices ❌

### Root Causes Discovered

**1. Generic vs Specific Accents**
```json
{
  "labels": {
    "accent": "latin american",  // ❌ Generic
    "locale": "es-AR"             // ✅ Specific!
  }
}
```

**2. Type Mismatch**
```typescript
// Expected: verified_languages?: string[]
// Actual: Array of objects with locale/language/accent
```

**3. Missing Accent Filter**
When region was specified, code filtered by provider but **ignored accent parameter**.

**4. Count Mismatch**
Provider dropdown showed 26 voices (all LATAM) instead of 3 (just Argentinian).

**5. Spelling Variants**
ElevenLabs uses `"argentine"` not `"argentinian"`.

### The Fixes

**1. Extract Locale from verified_languages** (voiceProviderService.ts)
```typescript
for (const verifiedLang of voice.verified_languages) {
  let accent = verifiedLang.accent;
  if (verifiedLang.locale) {
    const [, region] = verifiedLang.locale.split('-');
    accent = region; // "AR" → normalizeAccent → "argentinian"
  }
}
```

**2. Apply Accent Filter in Region Query** (voice-catalogue/route.ts)
```typescript
providerVoices = regionVoices.filter(voice => {
  const matchesProvider = voice.provider === providerName;
  const matchesAccent = !accent || voice.accent === accent;
  return matchesProvider && matchesAccent;
});
```

**3. Fix Provider Counts** (voiceCatalogueService.ts)
```typescript
if (filters.region && filters.accent) {
  // Filter by BOTH region AND accent
  const regionVoices = await this.getVoicesByRegion(language, region);
  const accentVoices = regionVoices.filter(v => v.accent === accent);
  // Count per provider from filtered set
}
```

**4. Add Spelling Variant** (accents.ts)
```typescript
argentine: "argentinian", // ElevenLabs uses "argentine"
```

**5. Fix Accent Display Names** (useVoiceManagerV2.ts)
Always use API for proper formatting instead of raw capitalization.

### Impact

- ✅ Region + Accent filtering works correctly
- ✅ Voice counts accurate (3 not 26)
- ✅ Accent display names properly formatted ("Argentinian" not "Latin_american")
- ✅ All locale variants supported ("argentine", "argentinian", "AR")
- ✅ Consistent behavior across all providers

### Technical Debt Paid

**Before**: Voice filtering had 3 separate bugs causing cascading failures.
**After**: Clean data flow from API → normalization → storage → filtering.

## Voice Cache Rebuild: Eliminating Self-Referential HTTP

_Added October 2025_

### The Problem

Cache rebuild was **emptying the database** in production. Root cause: internal HTTP calls to own API.

```typescript
// ❌ BAD: Self-referential HTTP call
const response = await fetch(`${getBaseUrl()}/api/voice/list?provider=elevenlabs`);
// Network round-trip → timeout on Vercel → cache cleared but not repopulated
```

### The Fix

**Created** `src/services/voiceProviderService.ts` - Direct provider API calls:
- `fetchElevenLabsVoices()` - Direct ElevenLabs API
- `fetchLovoVoices()` - Direct Lovo API
- `getOpenAIVoices()` - Hardcoded (no API needed)

**Updated** `src/app/api/admin/voice-cache/route.ts`:
```typescript
// ✅ GOOD: Direct external API call
const elevenlabsVoices = await fetchElevenLabsVoices();
// One network hop, reliable, no self-dependency
```

### Impact

- ✅ Rebuild works reliably in production
- ✅ No more empty database on deploy
- ✅ Faster rebuild (eliminated double network hop)
- ✅ Cleaner architecture (shared service)

## Pronunciation Dictionary Updates: Remove-and-Add Pattern

_Added October 2025_

### The Problem

Saving pronunciation rules created new dictionaries every time, accumulating orphans in ElevenLabs.

### The Fix

**Architecture**: ElevenLabs API doesn't support DELETE or return rules via GET, only metadata. Solution uses `remove-rules` + `add-rules` pattern:

- **POST** `/api/pronunciation` → Create first dictionary, store ID in Redis
- **PATCH** `/api/pronunciation/{id}` → Remove all old rules + add new rules (update-in-place)
- **DELETE** `/api/pronunciation/{id}` → Remove all rules + clear Redis

**Redis role**: Authoritative source for rules (ElevenLabs only stores for TTS, doesn't return them).

**Files**: `elevenlabs-pronunciation.ts` (added `removeRules`/`addRules`), `pronunciation/[id]/route.ts` (added PATCH), `PronunciationEditor.tsx` (uses PATCH for updates).

### Impact

- ✅ Single global dictionary maintained across saves
- ✅ No orphaned dictionaries
- ✅ Proper separation: Redis = source of truth, ElevenLabs = TTS-time only

---

**Related Documentation**:
- [Architecture Overview](./architecture.md) - Main system architecture
- [Pronunciation System](./pronounciation.md) - ElevenLabs pronunciation dictionaries
- [Voice System Guide](./voice-system-guide.md) - Redis voice management
