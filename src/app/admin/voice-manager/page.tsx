"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
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

export default function VoiceManagerPage() {
  // Sample text for testing voices
  const [sampleText, setSampleText] = useState(
    "Welcome to our service. We're here to help you achieve your goals."
  );

  // Voice selection state
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("es");
  const [selectedAccent, setSelectedAccent] = useState<string>("neutral");
  const [selectedProvider, setSelectedProvider] = useState<Provider>("elevenlabs");
  const [languageQuery, setLanguageQuery] = useState("");

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
  const [languageWideBlacklist, setLanguageWideBlacklist] = useState<Set<string>>(new Set());
  const [accentSpecificBlacklist, setAccentSpecificBlacklist] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isRebuilding, setIsRebuilding] = useState(false);

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

      // Fetch language-wide blacklist entries (accent = "*")
      const languageWideUrl = new URL(
        "/api/admin/voice-blacklist",
        window.location.origin
      );
      languageWideUrl.searchParams.set("language", selectedLanguage);
      languageWideUrl.searchParams.set("accent", "*");

      const languageWideRes = await fetch(languageWideUrl);
      const languageWideData = await languageWideRes.json();

      const languageWideSet = new Set<string>(
        languageWideData.blacklist?.map((b: BlacklistEntry) => b.voiceKey) || []
      );
      setLanguageWideBlacklist(languageWideSet);

      // Fetch ALL accent-specific blacklist entries for this language
      // We need all accents because each voice has its own accent
      const allAccentSpecificSet = new Set<string>();

      // Get unique accents from loaded voices (filter out undefined)
      const voiceAccents = new Set(
        uniqueVoices.map(v => v.accent).filter((accent): accent is string => Boolean(accent))
      );

      // Fetch blacklist for each accent
      for (const accent of voiceAccents) {
        const accentUrl = new URL(
          "/api/admin/voice-blacklist",
          window.location.origin
        );
        accentUrl.searchParams.set("language", selectedLanguage);
        accentUrl.searchParams.set("accent", accent);

        try {
          const accentRes = await fetch(accentUrl);
          const accentData = await accentRes.json();

          accentData.blacklist?.forEach((b: BlacklistEntry) => {
            allAccentSpecificSet.add(b.voiceKey);
          });
        } catch (error) {
          console.error(`Failed to fetch blacklist for ${accent}:`, error);
        }
      }

      setAccentSpecificBlacklist(allAccentSpecificSet);
    } catch (error) {
      console.error("Failed to load voices:", error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleBlacklist(voiceId: string, provider: Provider, scope: 'language' | 'accent', voiceAccent: string) {
    const voiceKey = `${provider}:${voiceId}`;
    const targetAccent = scope === 'language' ? '*' : voiceAccent;
    const currentBlacklist = scope === 'language' ? languageWideBlacklist : accentSpecificBlacklist;
    const isCurrentlyBlacklisted = currentBlacklist.has(voiceKey);

    try {
      if (isCurrentlyBlacklisted) {
        // Remove from blacklist (make visible)
        await fetch(
          `/api/admin/voice-blacklist?voiceKey=${encodeURIComponent(
            voiceKey
          )}&language=${selectedLanguage}&accent=${targetAccent}`,
          { method: "DELETE" }
        );

        if (scope === 'language') {
          setLanguageWideBlacklist((prev) => {
            const next = new Set(prev);
            next.delete(voiceKey);
            return next;
          });
        } else {
          setAccentSpecificBlacklist((prev) => {
            const next = new Set(prev);
            next.delete(voiceKey);
            return next;
          });
        }
      } else {
        // Add to blacklist (hide)
        await fetch(`/api/admin/voice-blacklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voiceKey,
            language: selectedLanguage,
            accent: targetAccent === '*' ? '' : targetAccent,
            scope,
          }),
        });

        if (scope === 'language') {
          setLanguageWideBlacklist((prev) => new Set(prev).add(voiceKey));
        } else {
          setAccentSpecificBlacklist((prev) => new Set(prev).add(voiceKey));
        }
      }
    } catch (error) {
      console.error("Failed to toggle blacklist:", error);
    }
  }

  function handleLanguageChange(language: Language) {
    setSelectedLanguage(language);
    // Accents and providers will be loaded by useEffect hooks
  }

  async function handleRebuild() {
    setIsRebuilding(true);
    try {
      const response = await fetch("/api/admin/voice-cache", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to rebuild voice cache");
      }

      // Reload data after successful rebuild
      await loadLanguageOptions();
      if (selectedLanguage) {
        await loadAccents(selectedLanguage);
        await loadProviders();
        await loadVoices();
      }
    } catch (error) {
      console.error("Failed to rebuild voice cache:", error);
      alert("Failed to rebuild voice cache. Check console for details.");
    } finally {
      setIsRebuilding(false);
    }
  }

  // Filter languages based on search (must be before early return)
  const filteredLanguages = useMemo(() => {
    if (!availableLanguages || availableLanguages.length === 0) return [];
    if (languageQuery === "") return availableLanguages;
    return availableLanguages.filter(
      (lang) =>
        lang &&
        lang.name &&
        lang.name.toLowerCase().includes(languageQuery.toLowerCase())
    );
  }, [languageQuery, availableLanguages]);

  if (loading && availableLanguages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full"></div>
      </div>
    );
  }

  // Calculate visible count (voices not in language-wide blacklist)
  const visibleCount = voices.length - languageWideBlacklist.size;

  return (
    <div className="h-screen bg-black text-white p-8 overflow-hidden">
      <div className="max-w-7xl mx-auto h-full flex flex-col">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Voice Manager</h1>
            <p className="text-gray-400">
              {visibleCount} visible • {languageWideBlacklist.size} hidden language-wide • {accentSpecificBlacklist.size} hidden for specific accents (of {voices.length} total)
            </p>
          </div>
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

        {/* Main Content */}
        <div className="grid grid-cols-3 gap-8 flex-1 overflow-hidden">
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
                options={filteredLanguages.map((lang) => ({
                  value: lang.code,
                  label: lang.name,
                  flag: getFlagCode(lang.code),
                }))}
                onQueryChange={setLanguageQuery}
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

            {/* Sample Text */}
            <div>
              <GlassyTextarea
                label="Sample Text (for voice preview)"
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                placeholder="Enter sample text to test voices..."
                rows={2}
              />
            </div>
          </div>

          {/* Right Column: Voice List (2/3) */}
          <div className="col-span-2 flex flex-col overflow-hidden">
            <h2 className="text-lg font-semibold mb-4">
              Voices ({voices.length})
            </h2>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full"></div>
              </div>
            ) : (
              <div
                className="space-y-2 flex-1 overflow-y-auto pr-4"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#374151 #111827'
                }}
              >
                {voices.map((voice) => (
                  <VoiceCard
                    key={`${voice.provider}:${voice.id}`}
                    voice={voice}
                    isLanguageWideBlacklisted={languageWideBlacklist.has(`${voice.provider}:${voice.id}`)}
                    isAccentSpecificBlacklisted={accentSpecificBlacklist.has(`${voice.provider}:${voice.id}`)}
                    onToggleLanguageWide={() =>
                      toggleBlacklist(voice.id, voice.provider, 'language', voice.accent || 'neutral')
                    }
                    onToggleAccentSpecific={() =>
                      toggleBlacklist(voice.id, voice.provider, 'accent', voice.accent || 'neutral')
                    }
                    sampleText={sampleText}
                    selectedLanguage={selectedLanguage}
                    availableLanguages={availableLanguages}
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
  isLanguageWideBlacklisted,
  isAccentSpecificBlacklisted,
  onToggleLanguageWide,
  onToggleAccentSpecific,
  sampleText,
  selectedLanguage,
  availableLanguages,
}: {
  voice: VoiceWithProvider;
  isLanguageWideBlacklisted: boolean;
  isAccentSpecificBlacklisted: boolean;
  onToggleLanguageWide: () => void;
  onToggleAccentSpecific: () => void;
  sampleText: string;
  selectedLanguage: Language;
  availableLanguages: Array<{ code: Language; name: string }>;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
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
        <div className="flex items-center gap-2">
          <div className="font-medium">{voice.name}</div>
          {voice.description && (
            <span className="px-1.5 py-0.5 text-[10px] bg-wb-green/20 text-wb-green rounded border border-wb-green/30">
              ✓
            </span>
          )}
        </div>
        <div className="text-sm text-gray-400">
          {voice.provider} • {voice.gender || "unknown"} • {voice.age || "any age"}
        </div>
        {voice.description && (
          <div className="mt-2">
            <div
              className={`text-xs text-gray-300 ${
                !isDescriptionExpanded ? "line-clamp-2" : ""
              }`}
            >
              {voice.description}
            </div>
            {voice.description.length > 120 && (
              <button
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                className="text-[10px] text-wb-blue hover:text-wb-blue/80 mt-1"
              >
                {isDescriptionExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
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

        {/* Language-wide Toggle with Label */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={onToggleLanguageWide}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isLanguageWideBlacklisted ? "bg-red-500/50" : "bg-wb-green"
            }`}
            title={`${isLanguageWideBlacklisted ? 'Enable' : 'Disable'} for all ${availableLanguages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isLanguageWideBlacklisted ? "translate-x-1" : "translate-x-6"
              }`}
            />
          </button>
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            All {availableLanguages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}
          </span>
        </div>

        {/* Accent-specific Toggle with Label */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={onToggleAccentSpecific}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isAccentSpecificBlacklisted ? "bg-red-500/50" : "bg-wb-green"
            }`}
            title={`${isAccentSpecificBlacklisted ? 'Enable' : 'Disable'} for ${voice.accent}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isAccentSpecificBlacklisted ? "translate-x-1" : "translate-x-6"
              }`}
            />
          </button>
          <span className="text-[10px] text-gray-400 whitespace-nowrap capitalize">
            {voice.accent}
          </span>
        </div>
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
