"use client";

import { useEffect, useState } from "react";

interface Stats {
  month: string;
  v3: { total: number; inMonth: number };
  v2: { total: number; inMonth: number };
  combined: { inMonth: number };
}

interface ProviderUsage {
  id: string;
  name: string;
  costPerMonth: number;
  allotment: number | null;
  unit: string;
  hasApi: boolean;
  used: number;
  requests: number;
  cacheHits: number;
  usagePercent: number | null;
  lastUpdated: number | null;
  estimatedCost: number | null;
}

interface UsageData {
  month: string;
  providers: ProviderUsage[];
  totalMonthlyCost: number;
  openaiEstimatedCost: number;
  totalEstimatedCost: number;
  trackingStarted: string;
}

interface ElevenLabsBalance {
  tier: string;
  characterCount: number;
  characterLimit: number;
  remaining: number;
  usagePercent: number;
  resetDate: string;
  status: string;
}

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();

  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    options.push({ value, label });
  }

  return options;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function UsageCard({ provider, elevenLabsBalance }: { provider: ProviderUsage; elevenLabsBalance?: ElevenLabsBalance | null }) {
  const isElevenLabs = provider.id === "elevenlabs";
  const isPayAsYouGo = provider.allotment === null;

  // Use ElevenLabs API data if available for more accurate info
  const used = isElevenLabs && elevenLabsBalance ? elevenLabsBalance.characterCount : provider.used;
  const limit = isElevenLabs && elevenLabsBalance ? elevenLabsBalance.characterLimit : provider.allotment;
  const percent = isElevenLabs && elevenLabsBalance ? elevenLabsBalance.usagePercent : provider.usagePercent;

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-300">{provider.name}</div>
        {provider.hasApi && isElevenLabs && elevenLabsBalance && (
          <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">Live</span>
        )}
      </div>

      <div className="text-2xl font-bold mb-1">
        {isPayAsYouGo ? (
          <span className="text-yellow-400">Pay-as-you-go</span>
        ) : (
          <span className={percent && percent > 80 ? "text-red-400" : "text-white"}>
            {formatNumber(used)}
          </span>
        )}
      </div>

      {!isPayAsYouGo && limit && (
        <>
          <div className="text-sm text-gray-400 mb-3">
            / {formatNumber(limit)} {provider.unit}
          </div>
          <div className="w-full bg-white/10 rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full ${percent && percent > 80 ? "bg-red-500" : "bg-wb-blue"}`}
              style={{ width: `${Math.min(percent || 0, 100)}%` }}
            />
          </div>
          <div className="text-sm text-gray-500">{percent?.toFixed(1)}% used</div>
        </>
      )}

      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Cost</span>
          <span className="text-white font-medium">
            {provider.costPerMonth > 0
              ? `$${provider.costPerMonth}/mo`
              : provider.estimatedCost !== null
                ? `~$${provider.estimatedCost.toFixed(2)}`
                : "Usage-based"}
          </span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-gray-400">Requests</span>
          <span className="text-white">{formatNumber(provider.requests)}</span>
        </div>
        {provider.cacheHits > 0 && (
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">Cache hits</span>
            <span className="text-green-400">{formatNumber(provider.cacheHits)} saved</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AccountingPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [elevenLabsBalance, setElevenLabsBalance] = useState<ElevenLabsBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthOptions = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);

  async function loadData(month: string) {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, usageRes, elevenLabsRes] = await Promise.all([
        fetch(`/api/admin/stats?m=${month}`),
        fetch(`/api/admin/usage?m=${month}`),
        fetch("/api/admin/usage/elevenlabs"),
      ]);

      if (!statsRes.ok) throw new Error("Failed to load stats");
      if (!usageRes.ok) throw new Error("Failed to load usage");

      const [statsData, usageData] = await Promise.all([
        statsRes.json(),
        usageRes.json(),
      ]);

      setStats(statsData);
      setUsage(usageData);

      if (elevenLabsRes.ok) {
        setElevenLabsBalance(await elevenLabsRes.json());
      }
    } catch (err) {
      console.error("Failed to load data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(selectedMonth);
  }, [selectedMonth]);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Accounting</h1>
            <p className="text-gray-400">API usage and subscription costs</p>
          </div>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-white/50"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-gray-900">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && !stats && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full"></div>
          </div>
        )}

        {stats && usage && (
          <div className="space-y-8">
            {/* Total Cost Banner */}
            <div className="bg-gradient-to-r from-wb-blue/20 to-purple-500/20 border border-wb-blue/30 rounded-lg p-6">
              <div className="grid grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-gray-300 mb-1">Subscriptions</div>
                  <div className="text-3xl font-bold">${usage.totalMonthlyCost}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-300 mb-1">+ OpenAI (est.)</div>
                  <div className="text-3xl font-bold">${usage.openaiEstimatedCost.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-300 mb-1">Ads/Projects</div>
                  <div className="text-3xl font-bold">{stats.combined.inMonth}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-300 mb-1">Cost per Ad</div>
                  <div className="text-3xl font-bold">
                    {stats.combined.inMonth > 0
                      ? `~$${(usage.totalEstimatedCost / stats.combined.inMonth).toFixed(2)}`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Provider Usage Cards */}
            <div>
              <h2 className="text-xl font-bold mb-4">API Usage</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {usage.providers.map((provider) => (
                  <UsageCard
                    key={provider.id}
                    provider={provider}
                    elevenLabsBalance={provider.id === "elevenlabs" ? elevenLabsBalance : undefined}
                  />
                ))}
              </div>
            </div>

            {/* Ad/Project Counts */}
            <div>
              <h2 className="text-xl font-bold mb-4">Generation Counts</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                  <div className="text-sm text-gray-400 mb-1">V3 Ads</div>
                  <div className="text-3xl font-bold text-wb-blue">{stats.v3.inMonth}</div>
                  <div className="text-sm text-gray-500 mt-1">{stats.v3.total} total</div>
                </div>
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                  <div className="text-sm text-gray-400 mb-1">V2 Projects</div>
                  <div className="text-3xl font-bold text-wb-green">{stats.v2.inMonth}</div>
                  <div className="text-sm text-gray-500 mt-1">{stats.v2.total} total</div>
                </div>
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                  <div className="text-sm text-gray-400 mb-1">Combined</div>
                  <div className="text-3xl font-bold">{stats.combined.inMonth}</div>
                  <div className="text-sm text-gray-500 mt-1">in {stats.month}</div>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-3">Notes</h2>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>
                  <span className="text-yellow-400">Usage tracking started {usage.trackingStarted}</span> — previous months will show 0
                </li>
                <li>ElevenLabs balance is fetched live from their API (shows current billing period)</li>
                <li>Lahajati and Loudly usage is tracked internally (no API available)</li>
                <li>OpenAI TTS estimated at ~$15 per 1M characters</li>
                <li>Cache hits for Loudly don't count towards your 3,000 track limit</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
