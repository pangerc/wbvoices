### Creative direction pipeline (emotion/styling) end-to-end

- What we cache from provider APIs

  - ElevenLabs (Voices API → cache)
    - Stored per voice: id, name, gender, language, accent, description/personality, age, use_case, sampleUrl, isMultilingual.
    - No numeric “emotion” controls are stored. These aren’t in their voices API; they’re parameters for the TTS call.
    - Where: built in `src/app/api/voice/list/route.ts` and stored via `src/services/voiceCatalogueService.ts`.
  - Lovo (Speakers API → cache)
    - One entry per speaker style. We encode the exact style using a composite ID: voice.id = speakerId|styleId.
    - Stored per voice: id (speakerId|styleId), name (often includes style), gender, language/derived accent, age, description, use_case, style (displayName), sampleUrl.
    - Where: `src/app/api/voice/list/route.ts` (creates entries per style) and stored via `voiceCatalogueService.ts`.

- What we give to the LLM (monoprovider subset)

  - We send voices from ONE provider filtered by language and accent.
  - Metadata provided per voice: name, id, gender, accent, age, personality/description, use_case, and style (for Lovo entries).
  - Provider-specific guidance:
    - ElevenLabs: ask for a single tone label (cheerful, calm, serious, energetic, etc.) and optional use_case.
    - Lovo: ask for the “style” field.
    - OpenAI: ask for “voiceInstructions” freeform direction.
  - Where: `src/app/api/ai/generate/route.ts`.

- What the LLM returns (per voice segment)

  - ElevenLabs: description (tone label) and optional use_case.
  - Lovo: style (style name/label).
  - OpenAI: voiceInstructions (freeform text).
  - We parse into `VoiceTrack`:
    - `track.style` (mapped from description for ElevenLabs, style for Lovo)
    - `track.useCase` (mapped from use_case)
    - `track.voiceInstructions` (OpenAI only)
  - Where parsed: `src/utils/json-parser.ts`.

- How we bridge to actual provider APIs (the mapping)

  - ElevenLabs
    - LLM returns a qualitative label (e.g., cheerful, calm, serious, energetic, fast_read, slow_read).
    - At call time, we convert the label into numeric `voice_settings`:
      - stability, similarity_boost, style (0–1), speed (e.g., 0.9–1.15), use_speaker_boost (boolean).
    - Then we call:
      - POST `/v1/text-to-speech/:voice_id` with body { text, model_id: "eleven_multilingual_v2", voice_settings } and query `output_format=mp3_44100_128`.
    - Implementation: `src/lib/providers/ElevenLabsVoiceProvider.ts`.
    - Reference: ElevenLabs Create speech docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
  - Lovo
    - The selected voice already includes the exact style in its id: speakerId|styleId.
    - At call time, we split it into:
      - speaker: speakerId
      - speakerStyle: styleId
    - We call Sync TTS:
      - POST `/api/v1/tts/sync` with body { text, speaker, speakerStyle }.
      - If sync returns “pending” (90s ceiling), we short‑poll GET `/api/v1/tts/{jobId}` briefly to fetch the final audio URL.
    - Implementation: `src/lib/providers/LovoVoiceProvider.ts`.
    - Reference: Lovo Sync TTS docs: https://docs.genny.lovo.ai/reference/sync-tts

- What the UI shows (to confirm creative direction)
  - In `ScripterPanel.tsx`, we render two neutral gray lines under the picker:
    - Speaker: name · accent · gender · speaker style (if present)
    - Creative: Tone=… · Use=… · Instructions=… (from the LLM fields above)
  - This surfaces both the provider’s own metadata and the LLM’s creative direction.

File map for quick reference

- Cache ingestion and normalization: `src/app/api/voice/list/route.ts`
- Cache storage/lookup: `src/services/voiceCatalogueService.ts`
- Prompt assembly: `src/app/api/ai/generate/route.ts`
- Response parsing: `src/utils/json-parser.ts`
- ElevenLabs TTS bridge: `src/lib/providers/ElevenLabsVoiceProvider.ts`
- Lovo TTS bridge: `src/lib/providers/LovoVoiceProvider.ts`
- UI display of styling: `src/components/ScripterPanel.tsx`
