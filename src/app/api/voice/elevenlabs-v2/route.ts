export const runtime = "edge";

import { NextRequest } from "next/server";
import { createProvider } from "@/lib/providers";
import { listDictionaries } from "@/utils/elevenlabs-pronunciation";

const GLOBAL_DICTIONARY_NAME = 'Global Brand Pronunciations';

export async function POST(req: NextRequest) {
  // Parse request body
  const body = await req.json();

  // Auto-lookup global pronunciation dictionary
  try {
    console.log(`🔍 Looking up global pronunciation dictionary`);
    const dictionaries = await listDictionaries();

    // Find dictionary by exact name match
    const dict = dictionaries.find(d => d.name === GLOBAL_DICTIONARY_NAME);

    if (dict) {
      console.log(`✅ Found global pronunciation dictionary (${dict.id})`);
      body.pronunciationDictionaryId = dict.id;
      body.pronunciationVersionId = dict.version_id;
    } else {
      console.log(`ℹ️ No global pronunciation dictionary found`);
    }
  } catch (err) {
    console.error('❌ Failed to lookup pronunciation dictionary:', err);
    // Continue without dictionary - don't block voice generation
  }

  // Create new request with modified body
  const modifiedRequest = new Request(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(body),
  });

  const provider = createProvider('voice', 'elevenlabs');
  return provider.handleRequest(modifiedRequest as NextRequest);
}