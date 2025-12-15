"use client";

import { useEffect, useState } from "react";

interface Stats {
  month: string;
  v3: { total: number; inMonth: number };
  v2: { total: number; inMonth: number };
  combined: { inMonth: number };
}

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();

  // Generate last 12 months
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    options.push({ value, label });
  }

  return options;
}

export default function AccountingPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthOptions = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);

  async function loadStats(month: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/stats?m=${month}`);
      if (!response.ok) {
        throw new Error("Failed to load stats");
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

  useEffect(() => {
    loadStats(selectedMonth);
  }, [selectedMonth]);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Accounting</h1>
          <p className="text-gray-400">Monthly ad and project counts for costing</p>
        </div>

        {/* Month Picker */}
        <div className="mb-8">
          <label className="block text-sm text-gray-400 mb-2">Select Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-white/50 w-64"
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

        {/* Stats Display */}
        {stats && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-6">
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

            {/* Info */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <h2 className="text-lg font-bold mb-3">Notes</h2>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>V3 = New agentic tool-calling architecture (ad:* keys)</li>
                <li>V2 = Legacy JSON-parsing architecture (project:* keys)</li>
                <li>Timestamps are compared in UTC</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
