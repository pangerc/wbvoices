import { getRedis } from "@/lib/redis";
import { Provider, UsageData } from "./tracker";

/**
 * Subscription configuration for each provider
 */
export const SUBSCRIPTIONS: Record<
  Provider,
  {
    name: string;
    costPerMonth: number;
    allotment: number | null; // null = pay-as-you-go
    unit: string;
    hasApi: boolean;
  }
> = {
  elevenlabs: {
    name: "ElevenLabs",
    costPerMonth: 99,
    allotment: 565455,
    unit: "characters",
    hasApi: true,
  },
  lahajati: {
    name: "Lahajati",
    costPerMonth: 11,
    allotment: 1000000,
    unit: "characters",
    hasApi: false,
  },
  openai: {
    name: "OpenAI TTS",
    costPerMonth: 0, // Pay-as-you-go
    allotment: null,
    unit: "characters",
    hasApi: true,
  },
  loudly: {
    name: "Loudly",
    costPerMonth: 180,
    allotment: 3000,
    unit: "tracks",
    hasApi: false,
  },
};

const PROVIDERS: Provider[] = ["elevenlabs", "lahajati", "openai", "loudly"];

/**
 * Get usage data for a specific provider and month
 */
export async function getProviderUsage(
  provider: Provider,
  month?: string
): Promise<UsageData | null> {
  const redis = getRedis();
  const m = month || getCurrentMonth();
  const key = `usage:${provider}:${m}`;
  return redis.get<UsageData>(key);
}

/**
 * Get usage data for all providers for a given month
 */
export async function getAllUsage(month?: string): Promise<
  Record<
    Provider,
    {
      usage: UsageData | null;
      subscription: (typeof SUBSCRIPTIONS)[Provider];
    }
  >
> {
  const result = {} as Record<
    Provider,
    {
      usage: UsageData | null;
      subscription: (typeof SUBSCRIPTIONS)[Provider];
    }
  >;

  for (const provider of PROVIDERS) {
    const usage = await getProviderUsage(provider, month);
    result[provider] = {
      usage,
      subscription: SUBSCRIPTIONS[provider],
    };
  }

  return result;
}

/**
 * Get current month in YYYYMM format
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Calculate percentage used of allotment
 */
export function calculateUsagePercent(
  used: number,
  allotment: number | null
): number | null {
  if (allotment === null || allotment === 0) return null;
  return Math.round((used / allotment) * 1000) / 10; // 1 decimal place
}

/**
 * Get total monthly subscription cost (excluding pay-as-you-go)
 */
export function getTotalMonthlyCost(): number {
  return Object.values(SUBSCRIPTIONS).reduce(
    (sum, sub) => sum + sub.costPerMonth,
    0
  );
}
