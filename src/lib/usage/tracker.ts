import { getRedis } from "@/lib/redis";

export type Provider = "elevenlabs" | "lahajati" | "openai" | "loudly";

export interface UsageData {
  characters: number;
  tracks: number;
  requests: number;
  cacheHits: number;
  lastUpdated: number;
}

interface TrackUsageParams {
  provider: Provider;
  characters?: number;
  tracks?: number;
  cached?: boolean;
}

/**
 * Get the Redis key for a provider's monthly usage
 */
function getUsageKey(provider: Provider, month?: string): string {
  const m = month || getCurrentMonth();
  return `usage:${provider}:${m}`;
}

/**
 * Get current month in YYYYMM format
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Track API usage for a provider
 * Call this after successful API calls in each provider
 */
export async function trackUsage(params: TrackUsageParams): Promise<void> {
  const { provider, characters = 0, tracks = 0, cached = false } = params;

  try {
    const redis = getRedis();
    const key = getUsageKey(provider);

    // Get existing data or initialize
    const existing = await redis.get<UsageData>(key);
    const data: UsageData = existing || {
      characters: 0,
      tracks: 0,
      requests: 0,
      cacheHits: 0,
      lastUpdated: 0,
    };

    // Update counts
    data.characters += characters;
    data.tracks += tracks;
    data.requests += 1;
    if (cached) {
      data.cacheHits += 1;
    }
    data.lastUpdated = Date.now();

    // Save back to Redis
    await redis.set(key, data);

    console.log(
      `📊 Usage tracked [${provider}]: +${characters} chars, +${tracks} tracks, cached=${cached}`
    );
  } catch (error) {
    // Don't let tracking errors break the main flow
    console.error(`Failed to track usage for ${provider}:`, error);
  }
}

/**
 * Track voice generation (ElevenLabs, Lahajati, OpenAI)
 */
export async function trackVoiceUsage(
  provider: "elevenlabs" | "lahajati" | "openai",
  textLength: number
): Promise<void> {
  return trackUsage({ provider, characters: textLength });
}

/**
 * Track music generation (Loudly)
 */
export async function trackMusicUsage(cached: boolean): Promise<void> {
  return trackUsage({
    provider: "loudly",
    tracks: cached ? 0 : 1,
    cached,
  });
}
