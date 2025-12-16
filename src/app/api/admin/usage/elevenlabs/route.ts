import { NextResponse } from "next/server";

interface ElevenLabsSubscription {
  tier: string;
  character_count: number;
  character_limit: number;
  can_extend_character_limit: boolean;
  allowed_to_extend_character_limit: boolean;
  next_character_count_reset_unix: number;
  voice_limit: number;
  max_voice_add_edits: number;
  voice_add_edit_counter: number;
  professional_voice_limit: number;
  can_extend_voice_limit: boolean;
  can_use_instant_voice_cloning: boolean;
  can_use_professional_voice_cloning: boolean;
  currency: string;
  status: string;
}

/**
 * Proxy to ElevenLabs subscription API
 * Returns real-time character usage and limits
 */
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ElevenLabs API key not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/user/subscription",
      {
        headers: {
          "xi-api-key": apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs subscription API error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch ElevenLabs subscription" },
        { status: response.status }
      );
    }

    const data: ElevenLabsSubscription = await response.json();

    return NextResponse.json({
      tier: data.tier,
      characterCount: data.character_count,
      characterLimit: data.character_limit,
      remaining: data.character_limit - data.character_count,
      usagePercent:
        Math.round((data.character_count / data.character_limit) * 1000) / 10,
      resetDate: new Date(
        data.next_character_count_reset_unix * 1000
      ).toISOString(),
      status: data.status,
    });
  } catch (error) {
    console.error("Failed to fetch ElevenLabs subscription:", error);
    return NextResponse.json(
      { error: "Failed to connect to ElevenLabs API" },
      { status: 500 }
    );
  }
}
