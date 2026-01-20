"use client";

import { useEffect, useState } from "react";

interface VoiceStats {
  summary: {
    totalVoices: number;
    totalLanguages: number;
    byProvider: {
      elevenlabs: number;
      lovo: number;
      openai: number;
      qwen: number;
      bytedance: number;
      lahajati: number;
      any: number;
    };
    lastUpdated: number;
  };
  languages: Array<{
    language: string;
    total: number;
    providers: {
      elevenlabs: number;
      lovo: number;
      openai: number;
      qwen: number;
      bytedance: number;
      lahajati: number;
    };
    regionCount: number;
    accentCount: number;
    regions: string[];
    accents: string[];
  }>;
}

export default function VoicesCachePage() {
  const [stats, setStats] = useState<VoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/voice-stats");
      if (!response.ok) {
        throw new Error("Failed to load voice stats");
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }

  async function handleRebuild() {
    setIsRebuilding(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/voice-cache", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to rebuild voice cache");
      }

      // Reload stats after successful rebuild
      await loadStats();
    } catch (err) {
      console.error("Failed to rebuild voice cache:", err);
      setError(err instanceof Error ? err.message : "Failed to rebuild voice cache");
    } finally {
      setIsRebuilding(false);
    }
  }

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Voices Cache</h1>
            <p className="text-gray-400">
              Manage and monitor the voice database cache
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={loadStats}
              disabled={loading}
              className="bg-white/10 backdrop-blur-sm font-medium rounded-full px-5 py-3 text-white border border-white/20 hover:bg-white/20 hover:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/50 disabled:bg-gray-700/50 disabled:border-gray-600/30 disabled:text-gray-400 transition-all duration-200"
            >
              {loading ? "Refreshing..." : "Refresh Stats"}
            </button>
            <button
              onClick={handleRebuild}
              disabled={isRebuilding}
              className="bg-white/10 backdrop-blur-sm font-medium rounded-full px-5 py-3 text-white border border-white/20 hover:bg-wb-blue/30 hover:border-wb-blue/50 focus:outline-none focus:ring-1 focus:ring-wb-blue/50 disabled:bg-gray-700/50 disabled:border-gray-600/30 disabled:text-gray-400 flex items-center gap-2 transition-all duration-200"
            >
              {isRebuilding ? "Rebuilding..." : "Rebuild Voice Database"}
              <svg
                width="17"
                height="21"
                viewBox="0 0 17 21"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g clipPath="url(#clip0_1_8990)">
                  <path
                    d="M7.49558 4.14887C7.60619 4.14887 7.66581 4.08072 7.68281 3.97849C7.93815 2.59836 7.91259 2.53021 9.39347 2.26611C9.49558 2.24055 9.56363 2.18092 9.56363 2.07017C9.56363 1.96794 9.49558 1.89978 9.39347 1.88274C7.91259 1.61865 7.93815 1.55049 7.68281 0.17037C7.66581 0.0681389 7.60619 -1.52588e-05 7.49558 -1.52588e-05C7.3849 -1.52588e-05 7.32537 0.0681389 7.30834 0.17037C7.05303 1.55049 7.07856 1.61865 5.5977 1.88274C5.48706 1.89978 5.42749 1.96794 5.42749 2.07017C5.42749 2.18092 5.48706 2.24055 5.5977 2.26611C7.07856 2.53021 7.05303 2.59836 7.30834 3.97849C7.32537 4.08072 7.3849 4.14887 7.49558 4.14887Z"
                    fill="white"
                  />
                  <path
                    d="M3.37646 10.0101C3.53816 10.0101 3.6488 9.8994 3.66582 9.74601C3.9722 7.47136 4.0488 7.47136 6.39774 7.01988C6.54242 6.99431 6.65306 6.89209 6.65306 6.73022C6.65306 6.57688 6.54242 6.46612 6.39774 6.44908C4.0488 6.11683 3.96369 6.04016 3.66582 3.73143C3.6488 3.56957 3.53816 3.45882 3.37646 3.45882C3.22326 3.45882 3.11263 3.56957 3.08709 3.73995C2.81475 6.0146 2.68709 6.00608 0.355173 6.44908C0.210492 6.47464 0.0998535 6.57688 0.0998535 6.73022C0.0998535 6.90061 0.210492 6.99431 0.389216 7.01988C2.70412 7.39474 2.81475 7.45435 3.08709 9.729C3.11263 9.8994 3.22326 10.0101 3.37646 10.0101Z"
                    fill="white"
                  />
                  <path
                    d="M9.14659 19.4325C9.36788 19.4325 9.52961 19.2706 9.57217 19.0406C10.1764 14.3805 10.8317 13.6649 15.4445 13.1538C15.6828 13.1282 15.8445 12.9578 15.8445 12.7278C15.8445 12.5063 15.6828 12.3359 15.4445 12.3103C10.8317 11.7992 10.1764 11.0836 9.57217 6.415C9.52961 6.18497 9.36788 6.03163 9.14659 6.03163C8.92531 6.03163 8.76364 6.18497 8.72958 6.415C8.12535 11.0836 7.46149 11.7992 2.85724 12.3103C2.61043 12.3359 2.44873 12.5063 2.44873 12.7278C2.44873 12.9578 2.61043 13.1282 2.85724 13.1538C7.45299 13.7586 8.09129 14.3805 8.72958 19.0406C8.76364 19.2706 8.92531 19.4325 9.14659 19.4325Z"
                    fill="white"
                  />
                </g>
                <defs>
                  <clipPath id="clip0_1_8990">
                    <rect
                      width="16"
                      height="21"
                      fill="white"
                      transform="translate(0.0998535)"
                    />
                  </clipPath>
                </defs>
              </svg>
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Stats Display */}
        {stats && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                <div className="text-sm text-gray-400 mb-1">Total Voices</div>
                <div className="text-3xl font-bold">{stats.summary.totalVoices.toLocaleString()}</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                <div className="text-sm text-gray-400 mb-1">Languages</div>
                <div className="text-3xl font-bold">{stats.summary.totalLanguages}</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                <div className="text-sm text-gray-400 mb-1">Last Updated</div>
                <div className="text-lg font-medium">
                  {new Date(stats.summary.lastUpdated).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Provider Breakdown */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">Voices by Provider</h2>
              <div className="grid grid-cols-6 gap-4">
                <div>
                  <div className="text-sm text-gray-400 mb-1">ElevenLabs</div>
                  <div className="text-2xl font-bold">{stats.summary.byProvider.elevenlabs}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">Lovo</div>
                  <div className="text-2xl font-bold">{stats.summary.byProvider.lovo}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">OpenAI</div>
                  <div className="text-2xl font-bold">{stats.summary.byProvider.openai}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">Qwen</div>
                  <div className="text-2xl font-bold">{stats.summary.byProvider.qwen}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">ByteDance</div>
                  <div className="text-2xl font-bold">{stats.summary.byProvider.bytedance}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">Lahajati</div>
                  <div className="text-2xl font-bold">{stats.summary.byProvider.lahajati}</div>
                </div>
              </div>
            </div>

            {/* Languages by Provider */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">Languages by Provider</h2>
              <div className="grid grid-cols-6 gap-4">
                <div>
                  <div className="text-sm text-gray-400 mb-1">ElevenLabs</div>
                  <div className="text-2xl font-bold">
                    {stats.languages.filter(l => l.providers.elevenlabs > 0).length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">Lovo</div>
                  <div className="text-2xl font-bold">
                    {stats.languages.filter(l => l.providers.lovo > 0).length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">OpenAI</div>
                  <div className="text-2xl font-bold">
                    {stats.languages.filter(l => l.providers.openai > 0).length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">Qwen</div>
                  <div className="text-2xl font-bold">
                    {stats.languages.filter(l => l.providers.qwen > 0).length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">ByteDance</div>
                  <div className="text-2xl font-bold">
                    {stats.languages.filter(l => l.providers.bytedance > 0).length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">Lahajati</div>
                  <div className="text-2xl font-bold">
                    {stats.languages.filter(l => l.providers.lahajati > 0).length}
                  </div>
                </div>
              </div>
            </div>

            {/* Language Details Table */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
              <div className="p-6 border-b border-white/10">
                <h2 className="text-xl font-bold">Language Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="text-left px-6 py-3 text-sm font-medium text-gray-300">Language</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-300">Total</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-300">Accents</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-300">Regions</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-300">EL</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-300">Lovo</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-300">OpenAI</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-300">Qwen</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-300">BD</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-300">LH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {stats.languages.map((lang) => (
                      <tr key={lang.language} className="hover:bg-white/5">
                        <td className="px-6 py-3 font-medium">{lang.language.toUpperCase()}</td>
                        <td className="px-6 py-3 text-right font-medium">{lang.total}</td>
                        <td className="px-6 py-3 text-right text-gray-400">{lang.accentCount}</td>
                        <td className="px-6 py-3 text-right text-gray-400">{lang.regionCount}</td>
                        <td className="px-6 py-3 text-right text-gray-400">
                          {lang.providers.elevenlabs || "-"}
                        </td>
                        <td className="px-6 py-3 text-right text-gray-400">
                          {lang.providers.lovo || "-"}
                        </td>
                        <td className="px-6 py-3 text-right text-gray-400">
                          {lang.providers.openai || "-"}
                        </td>
                        <td className="px-6 py-3 text-right text-gray-400">
                          {lang.providers.qwen || "-"}
                        </td>
                        <td className="px-6 py-3 text-right text-gray-400">
                          {lang.providers.bytedance || "-"}
                        </td>
                        <td className="px-6 py-3 text-right text-gray-400">
                          {lang.providers.lahajati || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
