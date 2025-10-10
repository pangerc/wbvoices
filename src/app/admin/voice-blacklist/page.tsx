"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { GlassyCombobox, GlassyListbox, GlassyTextarea } from "@/components/ui";
import { getFlagCode } from "@/utils/language";
import type { Language, Provider, Voice } from "@/types";

interface VoiceWithProvider extends Voice {
  provider: Provider;
}

// API response types
interface AccentOption {
  code: string;
  displayName: string;
}

interface ProviderOption {
  provider: Provider;
  count: number;
  label?: string;
}

interface BlacklistEntry {
  voiceKey: string;
  language: Language;
  accent: string;
}

export default function VoiceBlacklistPage() {
  // Sample text for testing voices
  const [sampleText, setSampleText] = useState(
    "Welcome to our service. We're here to help you achieve your goals."
  );

  // Voice selection state
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("es");
  const [selectedAccent, setSelectedAccent] = useState<string>("neutral");
  const [selectedProvider, setSelectedProvider] = useState<Provider>("elevenlabs");

  // Available options
  const [availableLanguages, setAvailableLanguages] = useState<
    Array<{ code: Language; name: string }>
  >([]);
  const [availableAccents, setAvailableAccents] = useState<
    Array<{ code: string; displayName: string }>
  >([]);
  const [availableProviders, setAvailableProviders] = useState<
    Array<{ provider: Provider; count: number }>
  >([]);

  // Voice data - BLACKLIST LOGIC
  const [voices, setVoices] = useState<VoiceWithProvider[]>([]);
  const [blacklist, setBlacklist] = useState<Set<string>>(new Set()); // Changed from approvals
  const [loading, setLoading] = useState(true);

  // Flags
  const [hasAccents, setHasAccents] = useState(false);

  // Load initial language options
  useEffect(() => {
    loadLanguageOptions();
  }, []);

  // Load accents when language changes
  useEffect(() => {
    if (selectedLanguage) {
      loadAccents(selectedLanguage);
    }
  }, [selectedLanguage]);

  // Load providers when language/accent changes
  useEffect(() => {
    if (selectedLanguage && selectedAccent) {
      loadProviders();
    }
  }, [selectedLanguage, selectedAccent]);

  // Load voices when filters change
  useEffect(() => {
    if (availableLanguages.length > 0 && availableProviders.length > 0) {
      loadVoices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage, selectedAccent, selectedProvider, availableLanguages.length, availableProviders.length]);

  async function loadLanguageOptions() {
    try {
      const response = await fetch("/api/voice-catalogue/languages");
      const data = await response.json();
      setAvailableLanguages(data.languages || []);
    } catch (error) {
      console.error("Failed to load languages:", error);
    }
  }

  const loadAccents = useCallback(async (language: Language) => {
    try {
      const response = await fetch(
        `/api/voice-catalogue/accents?language=${language}`
      );
      const data = await response.json();

      const accents = data.accents || [];
      setAvailableAccents(accents);
      setHasAccents(accents.length > 1);

      // Only set default if current accent is not in the new list
      const currentAccentValid = accents.some((a: AccentOption) => a.code === selectedAccent);
      if (!currentAccentValid && accents.length > 0) {
        setSelectedAccent(accents[0].code);
      }
    } catch (error) {
      console.error("Failed to load accents:", error);
    }
  }, [selectedAccent]);

  const loadProviders = useCallback(async () => {
    try {
      const url = new URL("/api/voice-catalogue", window.location.origin);
      url.searchParams.set("operation", "provider-options");
      url.searchParams.set("language", selectedLanguage);
      if (selectedAccent && selectedAccent !== "neutral") {
        url.searchParams.set("accent", selectedAccent);
      }

      const response = await fetch(url);
      const data = await response.json();

      const providers = data.map((p: ProviderOption) => ({
        provider: p.provider,
        count: p.count,
      }));

      setAvailableProviders(providers);

      // Only set default if current provider is not in the new list
      const currentProviderValid = providers.some((p: ProviderOption) => p.provider === selectedProvider);
      if (!currentProviderValid && providers.length > 0) {
        setSelectedProvider(providers[0].provider);
      }
    } catch (error) {
      console.error("Failed to load providers:", error);
    }
  }, [selectedLanguage, selectedAccent, selectedProvider]);

  async function loadVoices() {
    try {
      setLoading(true);

      // Build URL for voices
      const voicesUrl = new URL(
        "/api/voice-catalogue",
        window.location.origin
      );
      voicesUrl.searchParams.set("operation", "voices");
      voicesUrl.searchParams.set("provider", selectedProvider);
      voicesUrl.searchParams.set("language", selectedLanguage);
      if (selectedAccent && selectedAccent !== "neutral") {
        voicesUrl.searchParams.set("accent", selectedAccent);
      }

      const voicesRes = await fetch(voicesUrl);
      const voicesData: Voice[] = await voicesRes.json();

      // Add provider to each voice
      const voicesWithProvider: VoiceWithProvider[] = voicesData.map((v: Voice) => ({
        ...v,
        provider: selectedProvider,
      }));

      // Deduplicate by voiceKey (provider:id)
      const uniqueVoices: VoiceWithProvider[] = Array.from(
        new Map(
          voicesWithProvider.map((voice: VoiceWithProvider) => [
            `${voice.provider}:${voice.id}`,
            voice
          ])
        ).values()
      );

      setVoices(uniqueVoices);

      // Fetch current blacklist entries
      const blacklistUrl = new URL(
        "/api/admin/voice-blacklist",
        window.location.origin
      );
      blacklistUrl.searchParams.set("language", selectedLanguage);
      blacklistUrl.searchParams.set("accent", selectedAccent);

      const blacklistRes = await fetch(blacklistUrl);
      const blacklistData = await blacklistRes.json();

      const blacklistedSet = new Set<string>(
        blacklistData.blacklist?.map((b: BlacklistEntry) => b.voiceKey) || []
      );
      setBlacklist(blacklistedSet);
    } catch (error) {
      console.error("Failed to load voices:", error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleBlacklist(voiceId: string, provider: Provider) {
    const voiceKey = `${provider}:${voiceId}`;
    const isCurrentlyBlacklisted = blacklist.has(voiceKey);

    try {
      if (isCurrentlyBlacklisted) {
        // Remove from blacklist (make visible)
        await fetch(
          `/api/admin/voice-blacklist?voiceKey=${encodeURIComponent(
            voiceKey
          )}&language=${selectedLanguage}&accent=${selectedAccent}`,
          { method: "DELETE" }
        );
        setBlacklist((prev) => {
          const next = new Set(prev);
          next.delete(voiceKey);
          return next;
        });
      } else {
        // Add to blacklist (hide)
        await fetch(`/api/admin/voice-blacklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voiceKey,
            language: selectedLanguage,
            accent: selectedAccent,
          }),
        });
        setBlacklist((prev) => new Set(prev).add(voiceKey));
      }
    } catch (error) {
      console.error("Failed to toggle blacklist:", error);
    }
  }

  function handleLanguageChange(language: Language) {
    setSelectedLanguage(language);
    // Accents and providers will be loaded by useEffect hooks
  }

  if (loading && availableLanguages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full"></div>
      </div>
    );
  }

  const visibleCount = voices.length - blacklist.size;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Voice Blacklist</h1>
          <p className="text-gray-400">
            {visibleCount} visible, {blacklist.size} hidden (of {voices.length} total)
          </p>
        </div>

        {/* Sample Text */}
        <div className="mb-8">
          <GlassyTextarea
            label="Sample Text (for voice preview)"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder="Enter sample text to test voices..."
            rows={2}
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-3 gap-8">
          {/* Left Column: Filters (1/3) */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-4">Filters</h2>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Language
              </label>
              <GlassyCombobox
                value={
                  availableLanguages.find((l) => l.code === selectedLanguage)
                    ? {
                        value: selectedLanguage,
                        label:
                          availableLanguages.find(
                            (l) => l.code === selectedLanguage
                          )?.name || "",
                        flag: getFlagCode(selectedLanguage),
                      }
                    : null
                }
                onChange={(item) =>
                  item && handleLanguageChange(item.value as Language)
                }
                options={availableLanguages.map((lang) => ({
                  value: lang.code,
                  label: lang.name,
                  flag: getFlagCode(lang.code),
                }))}
              />
            </div>

            {/* Accent */}
            {hasAccents && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Accent
                </label>
                <GlassyListbox
                  value={selectedAccent}
                  onChange={setSelectedAccent}
                  options={availableAccents.map((a) => ({
                    value: a.code,
                    label: a.displayName,
                  }))}
                />
              </div>
            )}

            {/* Provider */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Provider
              </label>
              <GlassyListbox
                value={selectedProvider}
                onChange={(v) => setSelectedProvider(v as Provider)}
                options={availableProviders.map((p) => ({
                  value: p.provider,
                  label: `${p.provider} (${p.count})`,
                }))}
              />
            </div>
          </div>

          {/* Right Column: Voice List (2/3) */}
          <div className="col-span-2">
            <h2 className="text-lg font-semibold mb-4">
              Voices ({voices.length})
            </h2>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full"></div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                {voices.map((voice) => (
                  <VoiceCard
                    key={`${voice.provider}:${voice.id}`}
                    voice={voice}
                    isBlacklisted={blacklist.has(`${voice.provider}:${voice.id}`)}
                    onToggle={() =>
                      toggleBlacklist(voice.id, voice.provider)
                    }
                    sampleText={sampleText}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Voice Card Component
function VoiceCard({
  voice,
  isBlacklisted,
  onToggle,
  sampleText,
}: {
  voice: VoiceWithProvider;
  isBlacklisted: boolean;
  onToggle: () => void;
  sampleText: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  const handlePlay = async () => {
    if (isPlaying) {
      stopAudio();
      return;
    }

    if (!sampleText.trim()) {
      alert("Please enter sample text first");
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = getVoiceApiEndpoint(voice.provider);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sampleText.substring(0, 90),
          voiceId: voice.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate voice");
      }

      const data = await response.json();
      if (!data.audio_url) {
        throw new Error("No audio URL in response");
      }

      const audio = new Audio(data.audio_url);
      audioRef.current = audio;

      audio.addEventListener("loadeddata", () => {
        setIsLoading(false);
        setIsPlaying(true);
      });

      audio.addEventListener("ended", () => {
        setIsPlaying(false);
      });

      audio.addEventListener("error", () => {
        setIsPlaying(false);
        setIsLoading(false);
      });

      await audio.play();
    } catch (error) {
      console.error("Voice preview error:", error);
      setIsLoading(false);
      setIsPlaying(false);
    }
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
      {/* Voice Info */}
      <div className="flex-1">
        <div className="font-medium">{voice.name}</div>
        <div className="text-sm text-gray-400">
          {voice.provider} • {voice.gender || "unknown"} • {voice.age || "any age"}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Play Button */}
        <button
          onClick={handlePlay}
          disabled={isLoading || !sampleText.trim()}
          className={`p-2 rounded-lg transition-all ${
            isPlaying
              ? "bg-red-500/20 border border-red-500/30 text-red-300"
              : "bg-wb-blue/20 border border-wb-blue/30 text-wb-blue hover:bg-wb-blue/30"
          } disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          {isLoading ? (
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          ) : isPlaying ? (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          )}
        </button>

        {/* Toggle Switch - FLIPPED LOGIC */}
        <button
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isBlacklisted ? "bg-red-500/50" : "bg-wb-green"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isBlacklisted ? "translate-x-1" : "translate-x-6"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function getVoiceApiEndpoint(provider: Provider): string {
  const endpoints: Record<string, string> = {
    elevenlabs: "/api/voice/elevenlabs-v2",
    openai: "/api/voice/openai-v2",
    lovo: "/api/voice/lovo-v2",
    qwen: "/api/voice/qwen-v2",
    bytedance: "/api/voice/bytedance-v2",
  };
  return endpoints[provider] || endpoints.elevenlabs;
}
