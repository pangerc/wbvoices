export const runtime = "edge";

import { createProvider } from "@/lib/providers";
import {
  DEFAULT_ELEVENLABS_VOICE_MODEL,
  ELEVENLABS_VOICE_MODEL_REDIS_KEY,
} from "@/lib/providers/elevenLabsModels";
import { getRedisV3 } from "@/lib/redis-v3";
import { listDictionaries } from "@/utils/elevenlabs-pronunciation";
import { NextRequest } from "next/server";

const GLOBAL_DICTIONARY_NAME = "Global Brand Pronunciations";

export async function POST(req: NextRequest) {
  // Parse request body
  const body = await req.json();

  // Auto-lookup global pronunciation dictionary
  try {
    console.log(`🔍 Looking up global pronunciation dictionary`);
    const dictionaries = await listDictionaries();

    // Find dictionary by exact name match
    const dict = dictionaries.find((d) => d.name === GLOBAL_DICTIONARY_NAME);

    if (dict) {
      console.log(`✅ Found global pronunciation dictionary (${dict.id})`);
      body.pronunciationDictionaryId = dict.id;
      body.pronunciationVersionId = dict.version_id;
    } else {
      console.log(`ℹ️ No global pronunciation dictionary found`);
    }
  } catch (err) {
    console.error("❌ Failed to lookup pronunciation dictionary:", err);
    // Continue without dictionary - don't block voice generation
  }

  // Resolve the global ElevenLabs model from the Edge-readable Redis mirror
  // (set by the admin Voice Manager). A caller may still override per-request;
  // fall back to the default if the mirror is unset/unreadable.
  if (!body.modelId) {
    try {
      const model = await getRedisV3().get<string>(
        ELEVENLABS_VOICE_MODEL_REDIS_KEY,
      );
      body.modelId =
        model != null && String(model).length > 0
          ? String(model)
          : DEFAULT_ELEVENLABS_VOICE_MODEL;
    } catch (err) {
      console.error("❌ Failed to read voice model mirror:", err);
      body.modelId = DEFAULT_ELEVENLABS_VOICE_MODEL;
    }
  }

  // Create new request with modified body
  const modifiedRequest = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(body),
  });

  const provider = createProvider("voice", "elevenlabs");
  return provider.handleRequest(modifiedRequest as NextRequest);
}
