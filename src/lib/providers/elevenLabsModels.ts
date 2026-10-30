/**
 * ElevenLabs TTS model catalogue + the Edge-readable Redis mirror key.
 *
 * Deliberately dependency-free (no `@/lib/db`, no server-only imports) so both
 * the Edge voice route and Node code (settings service, admin API) and the
 * client admin UI can import it. The selected model is stored globally in
 * `server_settings.elevenlabs_model_id` and mirrored to Redis so the
 * `runtime="edge"` TTS route can read it without Postgres.
 */

/** The model passed as `model_id` on /v1/text-to-speech when none is set. */
export const DEFAULT_ELEVENLABS_VOICE_MODEL = "eleven_v3";

/** Edge-readable mirror of the selected model id (Upstash REST works on Edge). */
export const ELEVENLABS_VOICE_MODEL_REDIS_KEY = "server:voice:elevenlabs-model";

/** Selectable TTS models. `value` is the literal `model_id` sent to the API. */
export const ELEVENLABS_VOICE_MODELS = [
  { value: "eleven_v3", label: "Eleven v3" },
  { value: "eleven_v4", label: "Eleven v4" },
  { value: "eleven_v4_turbo", label: "Eleven v4 Turbo" },
] as const;

export type ElevenLabsVoiceModel =
  (typeof ELEVENLABS_VOICE_MODELS)[number]["value"];

const VALUES: readonly string[] = ELEVENLABS_VOICE_MODELS.map((m) => m.value);

/** True when `v` is one of the allowed `model_id` strings. */
export function isElevenLabsVoiceModel(v: unknown): v is ElevenLabsVoiceModel {
  return typeof v === "string" && VALUES.includes(v);
}
