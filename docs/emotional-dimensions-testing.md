# Emotional Dimensions Testing Guide

## Overview

We've implemented comprehensive emotional dimension support and testing visibility for the voice generation pipeline. The LLM generates style instructions that are now properly used by each provider and visible to users for verification.

## What's Been Implemented

### 1. ScripterPanel Visibility ✅

**Location**: `/src/components/ScripterPanel.tsx`

Added a purple-bordered box under each voice track showing:
- **Style**: The emotional style chosen by the LLM (e.g., "cheerful", "professional")
- **Use Case**: The use case context (e.g., "advertisement", "narrator")
- **Voice Instructions**: OpenAI-specific voice control instructions

**Visual Example**:
```
🎭 LLM Creative Instructions:
Style: cheerful
Use Case: advertisement
Voice Instructions: Speak with an enthusiastic, upbeat tone suitable for commercial advertising
```

### 2. Enhanced Provider Implementation ✅

#### ElevenLabs (`/src/lib/providers/ElevenLabsVoiceProvider.ts`)
- **NEW**: Maps emotional styles to voice settings (stability, similarity_boost)
- **Examples**:
  - "cheerful" → stability: 0.3, similarity_boost: 0.8 (more dynamic)
  - "professional" → stability: 0.7, similarity_boost: 0.7 (more stable)
  - "calm" → stability: 0.8, similarity_boost: 0.6 (very stable)

#### Lovo (`/src/lib/providers/LovoVoiceProvider.ts`)
- **NEW**: Maps LLM styles to Lovo's style system
- **Style Mapping**: "cheerful" → "cheerful", "professional" → "serious", etc.
- **API Integration**: Passes style parameter to Lovo TTS API

#### OpenAI (`/src/lib/providers/OpenAIVoiceProvider.ts`)
- **ENHANCED**: Already used instructions parameter, now with better logging
- **Fallback Logic**: Builds instructions from style/useCase if LLM doesn't provide voiceInstructions

### 3. Comprehensive Server Logging ✅

All providers now log detailed information with emojis for easy identification:

```
🎭 ElevenLabs API Call:
  Text: "Welcome to our amazing product that will change..."
  Voice ID: cgSgspJ2msm6clMCkdW9
  Style: cheerful
  Use Case: advertisement
  🎛️ Applied voice settings for "cheerful": stability=0.3, similarity_boost=0.8
  📡 ElevenLabs request body: {...}
```

## How to Test the Pipeline

### 1. Generate a Creative Script
1. Go to the Brief Panel
2. Create a creative brief (e.g., "Cheerful advertisement for a new energy drink")
3. Select any provider (ElevenLabs, Lovo, or OpenAI)
4. Click "Generate Creative"

### 2. Verify LLM Instructions in ScripterPanel
1. Navigate to the Scripter Panel
2. Look for purple boxes under each voice track
3. Verify the LLM generated appropriate emotional dimensions:
   - **Style**: Should match the brief's tone (cheerful, professional, etc.)
   - **Use Case**: Should be "advertisement" for ad briefs
   - **Voice Instructions**: OpenAI-specific instructions (if available)

### 3. Check Server Console During Voice Generation
1. Click "Generate Voices" in ScripterPanel
2. Watch the server console for detailed logging:
   - **ElevenLabs**: Look for voice settings adjustments based on style
   - **Lovo**: Look for style mapping from LLM style to Lovo style
   - **OpenAI**: Look for voice instructions being built and sent

### 4. Verify Audio Output
1. Listen to the generated voices
2. Compare different styles (generate multiple versions with different emotional briefs)
3. Verify that the emotional dimensions are audibly different

## Provider-Specific Testing

### ElevenLabs Testing
- **Style**: "cheerful" vs "professional" should have different stability settings
- **Expected**: Cheerful voices should sound more dynamic and expressive
- **Console**: Look for "🎛️ Applied voice settings for [style]"

### Lovo Testing  
- **Style**: Test common styles like "cheerful", "serious", "calm"
- **Expected**: Different emotional deliveries based on Lovo's style system
- **Console**: Look for "🎛️ Mapped style [X] to Lovo style [Y]"

### OpenAI Testing
- **Voice Instructions**: Should receive detailed instructions
- **Expected**: Most sophisticated emotional control through instructions parameter
- **Console**: Look for "🎛️ Using LLM voice instructions" or "🎛️ Built instructions from style/useCase"

## Troubleshooting

### No Emotional Dimensions Showing
- **Issue**: Purple box not appearing in ScripterPanel
- **Solution**: Verify the LLM generated style/useCase/voiceInstructions in the creative JSON

### Provider Not Using Styles
- **Issue**: Console shows "Style: none"
- **Solution**: Check if the LLM prompt includes emotional dimension instructions

### Audio Sounds the Same
- **Issue**: No audible difference between emotional styles
- **Solution**: 
  1. Check server logs to verify parameters are being sent
  2. Try more contrasting styles (e.g., "excited" vs "calm")
  3. Verify the provider supports the style (Lovo has the most style options)

## Example Test Cases

### Test Case 1: Cheerful Advertisement
```
Brief: "Energetic advertisement for a new sports drink"
Expected Style: "cheerful", "excited", or "energetic"
Expected Use Case: "advertisement"
Providers to Test: All three
```

### Test Case 2: Professional Narration
```
Brief: "Professional corporate video narration"
Expected Style: "professional", "serious", or "authoritative"  
Expected Use Case: "narrator"
Providers to Test: ElevenLabs and OpenAI work best
```

### Test Case 3: Calm Meditation App
```
Brief: "Soothing voice for meditation app"
Expected Style: "calm", "gentle", or "soothing"
Expected Use Case: "meditation"
Providers to Test: All three (good comparison case)
```

## Technical Notes

- **Data Flow**: LLM → JSON Parser → VoiceTrack → AudioService → Provider
- **Backwards Compatibility**: Old projects without emotional dimensions will still work
- **Provider Limitations**: Each provider has different emotional capabilities
- **Logging Format**: Consistent emoji-based logging across all providers for easy debugging