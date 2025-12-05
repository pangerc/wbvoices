/**
 * Music Generation Knowledge Module
 *
 * Extracted from BasePromptStrategy lines 222-312
 * Provider-specific prompt formats for music generation
 */

import { KnowledgeModule } from "../types";

export const musicGenerationModule: KnowledgeModule = {
  id: "music-generation",
  name: "Music Generation Guidance",
  keywords: [
    "music",
    "background",
    "track",
    "drums",
    "guitar",
    "beat",
    "tempo",
    "genre",
    "upbeat",
    "chill",
    "energy",
    "loudly",
    "mubert",
    "elevenlabs",
    "instrumental",
  ],

  getContent(): string {
    return `## Music Generation Guidance - Provider-Specific Prompts

You MUST generate music prompts optimized for different providers.

### Universal Principles

Music generators are LITERAL - they understand instruments, tempo, and playing techniques.
They DON'T understand brand associations, social contexts, or experiential feelings.

Describe the MUSIC (what musicians play), not the experience of listening to it.

#### BAD (produces generic muzak - uses abstract/experiential language):
"Bright, upbeat indie pop track with sparkling acoustic guitar strums... evoking the feeling of a lively Spanish terrace on a warm afternoon... matching the Coca-Cola vibe."

Problems: "evoking the feeling", "Spanish terrace", "Coca-Cola vibe" - music generators don't understand these!

#### GOOD (detailed instrumental approach):
"Uplifting indie pop song with bright, jangly electric guitars, fast rhythmic strumming, light bouncy drums. Catchy summery vibe, energetic but laid-back, with tambourine accents and walking bassline."

### Provider-Specific Formats

**1. elevenlabs** (100-200 words, NO artist names):
- Detailed instrumental descriptions with concrete musical terms
- Focus on: instruments, tempo, playing techniques, genres
- NEVER mention: duration, "commercial", "ad", "voiceover", "dialogue", or mixing context
- The music generator doesn't need to know how it will be used - just describe the music

Example: "Uplifting indie pop song with bright, jangly electric guitars, fast rhythmic strumming, light bouncy drums. Catchy summery vibe, energetic but laid-back, with tambourine accents and walking bassline. Clean modern mix with strong rhythmic drive."

**2. loudly** (1 sentence, ~15-25 words):
- Short, concise description with genre, mood, instruments, and optional artist reference
- Do NOT include duration in the prompt - use the duration parameter instead
- Keep it simple - Loudly works best with brief, clear prompts

Examples:
- "Energetic house track with tropical vibes and a melodic flute line"
- "Upbeat indie pop track in the style of Phoenix with jangly guitars"
- "Chill lo-fi beat with soft piano and warm vinyl texture"

**3. mubert** (8-12 WORDS TARGET):
- Structure: Genre, Energy/Moods, Key Instrument (optional), Time/Setting, Vibe/Activity
- Target: 8-12 words (comma-separated, multi-word phrases OK)

Excellent examples:
- "Indie rock, energetic, summer, full of life, fun day with friends"
- "Lo-fi, chill, night, soft keys, rainy window, city lights"
- "Smooth jazz, calm, warm, gentle saxophone, quiet night, reading"
- "Hip hop, slow beat, mellow, bassline, urban, night city street"
- "Synthwave, energetic, 80s, neon lights, nostalgic, night drive"

BAD example (too many redundant terms):
"Indie rock, energetic, upbeat, summer, guitar, fast, drums, happy, melodic, bright, rhythmic, lively, clean, pop, bassline"

### Validation Checklist
- elevenlabs: 100-200 words, NO artist names, NO duration/commercial context, detailed instrumental descriptions
- loudly: 1 sentence (~15-25 words), genre + mood + instruments, NO duration in text, optional artist reference
- mubert: 8-12 words, structured storytelling with multi-word phrases
- All: Concrete musical terms, avoid experiential language, NEVER mention intended use

### Key Principles
1. Music generators understand: instruments, tempo, playing techniques, genres
2. Music generators DON'T understand: brand associations, social contexts, experiential feelings
3. If it's not something a musician would say about the music itself, don't include it
4. Music descriptions must be in ENGLISH regardless of ad language`;
  },
};
