import { useState, useEffect, useCallback, useRef } from "react";
import { Provider, Voice, Language, CampaignFormat } from "@/types";
import { ProviderSelector, VoiceCounts } from "@/utils/providerSelection";
import { hasRegionalAccents, getLanguageRegions, getRegionalAccents } from "@/utils/language";

/**
 * 🗡️ NEW VOICE MANAGER - REDIS POWERED!
 * No more cascade! No more API calls! Just instant Redis lookups!
 */
export interface VoiceManagerV2State {
  // Core state
  selectedLanguage: Language;
  selectedRegion: string | null;
  selectedAccent: string;
  selectedProvider: Provider;
  
  // Available options
  availableLanguages: { code: Language; name: string }[];
  availableRegions: { code: string; displayName: string }[];
  availableAccents: { code: string; displayName: string }[];
  availableProviders: { provider: Provider; count: number; label: string }[];
  
  // Voice data
  currentVoices: Voice[];
  voiceCounts: VoiceCounts;
  
  // Loading states (much simpler now!)
  isLoading: boolean;
  
  // Helper flags
  hasRegions: boolean;
  hasAccents: boolean;
  
  // Actions
  setSelectedLanguage: (language: Language) => void;
  setSelectedRegion: (region: string | null) => void;
  setSelectedAccent: (accent: string) => void;
  setSelectedProvider: (provider: Provider) => void;
  
  // Helper methods
  getFilteredVoices: () => Voice[];
  getVoicesForProvider: (provider: Provider) => Voice[];
  autoSelectProvider: (format: CampaignFormat) => Provider;
  loadVoices: () => Promise<void>; // Force reload voices
}

export function useVoiceManagerV2(): VoiceManagerV2State {
  // Core state - Language → Region → Accent → Provider flow
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("en");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedAccent, setSelectedAccent] = useState<string>("neutral");
  const [selectedProvider, setSelectedProvider] = useState<Provider>("any");
  
  // AbortController to cancel previous voice loading requests
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Available options with safe initial states
  const [availableLanguages, setAvailableLanguages] = useState<{ code: Language; name: string }[]>([]);
  const [availableRegions, setAvailableRegions] = useState<{ code: string; displayName: string }[]>([]);
  const [availableAccents, setAvailableAccents] = useState<{ code: string; displayName: string }[]>([
    { code: 'neutral', displayName: 'Any Accent' }
  ]);
  const [availableProviders, setAvailableProviders] = useState<{ provider: Provider; count: number; label: string }[]>([
    { provider: 'any', count: 0, label: 'Any Provider (0 voices)' }
  ]);
  
  // Voice data
  const [currentVoices, setCurrentVoices] = useState<Voice[]>([]);
  const [voiceCounts, setVoiceCounts] = useState<VoiceCounts>({ elevenlabs: 0, lovo: 0, openai: 0, any: 0 });
  
  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  
  // Helper flags
  const hasRegions = hasRegionalAccents(selectedLanguage);
  const hasAccents = availableAccents.length > 1;
  
  // Initialize available languages on mount
  useEffect(() => {
    const initLanguages = async () => {
      setIsLoading(true);
      try {
        // Get all available languages from the API
        const response = await fetch('/api/voice-catalogue/languages');
        const data = await response.json();
        
        if (data.error) {
          console.error('❌ Failed to load languages:', data.error);
          return;
        }
        
        const languages = data.languages || [];
        
        if (languages.length === 0) {
          console.error('⚠️ No languages available! Run POST /api/admin/voice-cache');
          return;
        }
        
        setAvailableLanguages(languages);
        
        // Set default language to English if available, otherwise Spanish
        const english = languages.find((l: { code: string; name: string }) => l.code === 'en');
        const spanish = languages.find((l: { code: string; name: string }) => l.code === 'es');
        
        if (english) {
          setSelectedLanguage('en' as Language);
        } else if (spanish) {
          setSelectedLanguage('es' as Language);
        } else if (languages.length > 0) {
          setSelectedLanguage(languages[0].code);
        }
      } catch (error) {
        console.error('Failed to initialize languages:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    initLanguages();
  }, []);
  
  // When language changes, update available regions
  useEffect(() => {
    // Clear current voices immediately when language changes to prevent stale data
    console.log('🔄 Language changed, clearing stale voices');
    setCurrentVoices([]);
    
    const regions = getLanguageRegions(selectedLanguage);
    setAvailableRegions(regions);
    
    setSelectedRegion(prevRegion => {
      // Reset region selection if current region is not available
      if (prevRegion && !regions.find(r => r.code === prevRegion)) {
        return regions.length > 0 ? regions[0].code : null;
      } else if (!prevRegion && regions.length > 0) {
        // Auto-select first region for languages with regions
        return regions[0].code;
      } else if (regions.length === 0) {
        // Clear region for languages without regional variations
        return null;
      }
      return prevRegion;
    });
  }, [selectedLanguage]);
  
  // When language or region changes, update available accents
  useEffect(() => {
    const updateAccents = async () => {
      setIsLoading(true);
      try {
        let accents: { code: string; displayName: string }[] = [];
        
        // If we have a selected region, get regional accents
        if (selectedRegion && hasRegions) {
          const regionalAccents = getRegionalAccents(selectedLanguage, selectedRegion);
          accents = regionalAccents.map(accent => ({
            code: accent === 'none' ? 'neutral' : accent,
            displayName: accent === 'none' ? 'Any Accent' : accent.charAt(0).toUpperCase() + accent.slice(1)
          }));
        } else {
          // Fall back to API for languages without regional mapping
          const url = new URL('/api/voice-catalogue/accents', window.location.origin);
          url.searchParams.set('language', selectedLanguage);
          
          const response = await fetch(url);
          const data = await response.json();
          
          if (data.error) {
            console.error('❌ Failed to load accents:', data.error);
            accents = [{ code: 'neutral', displayName: 'Any Accent' }];
          } else {
            accents = data.accents || [{ code: 'neutral', displayName: 'Any Accent' }];
          }
        }
        
        setAvailableAccents(accents);
        
        // Force accent reset when region changes to ensure voice counts update properly
        if (selectedRegion && hasRegions) {
          // For regional languages, always reset to first available accent when region changes
          setSelectedAccent(accents.length > 0 ? accents[0].code : 'neutral');
        } else {
          // Keep current accent if it exists, otherwise default to neutral
          const currentAccentExists = accents.some((a) => a.code === selectedAccent);
          if (!currentAccentExists) {
            setSelectedAccent('neutral');
          }
        }
      } catch (error) {
        console.error('Failed to update accents:', error);
        setAvailableAccents([{ code: 'neutral', displayName: 'Any Accent' }]);
        setSelectedAccent('neutral');
      } finally {
        setIsLoading(false);
      }
    };
    
    updateAccents();
  }, [selectedLanguage, selectedRegion, hasRegions]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // When language OR ACCENT changes, update voice counts and providers
  useEffect(() => {
    const updateProviders = async () => {
      setIsLoading(true);
      try {
        // Get voice counts via API - FILTER BY ACCENT when one is selected!
        const url = new URL('/api/voice-catalogue', window.location.origin);
        url.searchParams.set('operation', 'counts');
        url.searchParams.set('language', selectedLanguage);
        // 🔥 FIX: Pass accent to get accurate counts!
        if (selectedAccent && selectedAccent !== 'neutral') {
          url.searchParams.set('accent', selectedAccent);
        }
        
        const response = await fetch(url);
        const counts = await response.json();
        setVoiceCounts(counts);
        
        // Build provider options with "Any" as first option
        const totalVoices = counts.elevenlabs + counts.lovo + counts.openai;
        const providers = [
          {
            provider: 'any' as Provider,
            count: totalVoices,
            label: `Any Provider (${totalVoices} voices)`
          },
          {
            provider: 'elevenlabs' as Provider,
            count: counts.elevenlabs,
            label: `ElevenLabs (${counts.elevenlabs} voices)`
          },
          {
            provider: 'lovo' as Provider,
            count: counts.lovo,
            label: `Lovo (${counts.lovo} voices)`
          },
          {
            provider: 'openai' as Provider,
            count: counts.openai,
            label: `OpenAI (${counts.openai} voices)`
          }
        ].filter(p => p.count > 0); // Only show providers with voices
        
        setAvailableProviders(providers);
        
      } catch (error) {
        console.error('Failed to update providers:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    updateProviders();
  }, [selectedLanguage, selectedRegion, selectedAccent]); // Update when language, region, or accent changes
  
  // Voice loading logic extracted into reusable function
  const loadVoices = useCallback(async () => {
    // Cancel previous request if it's still running
    if (abortControllerRef.current) {
      console.log('🚫 Cancelling previous voice loading request');
      abortControllerRef.current.abort();
    }
    
    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    console.log(`🔄 Loading voices for provider=${selectedProvider}, language=${selectedLanguage}, accent=${selectedAccent}`);
    setIsLoading(true);
    setCurrentVoices([]); // Clear immediately
    
    try {
      let allVoices: Voice[] = [];
      
      if (selectedProvider === 'any') {
        // 🗡️ LOAD VOICES FROM ALL PROVIDERS!
        const providers = ['elevenlabs', 'lovo', 'openai'] as const;
        const voicePromises = providers.map(async (provider) => {
          try {
            const url = new URL('/api/voice-catalogue', window.location.origin);
            url.searchParams.set('operation', 'voices');
            url.searchParams.set('provider', provider);
            url.searchParams.set('language', selectedLanguage);
            if (selectedAccent && selectedAccent !== 'neutral') {
              url.searchParams.set('accent', selectedAccent);
            }
            
            const response = await fetch(url, { signal: abortController.signal });
            const voices = await response.json();
            // Tag each voice with its provider
            return Array.isArray(voices) ? voices.map((v: Voice) => ({...v, provider})) : [];
          } catch (error) {
            // Don't log abort errors as they're intentional
            if (error instanceof Error && error.name === 'AbortError') {
              console.log(`🚫 ${provider} voice request cancelled`);
              return [];
            }
            console.error(`Failed to load ${provider} voices:`, error);
            return [];
          }
        });
        
        const providerVoicesArrays = await Promise.all(voicePromises);
        allVoices = providerVoicesArrays.flat();
      } else {
        // Load from specific provider
        const url = new URL('/api/voice-catalogue', window.location.origin);
        url.searchParams.set('operation', 'voices');
        url.searchParams.set('provider', selectedProvider);
        url.searchParams.set('language', selectedLanguage);
        if (selectedAccent && selectedAccent !== 'neutral') {
          url.searchParams.set('accent', selectedAccent);
        }
        
        const response = await fetch(url, { signal: abortController.signal });
        const voices = await response.json();
        allVoices = Array.isArray(voices) ? voices : [];
      }
      
      // Convert to Voice type (may need mapping)
      const mappedVoices: Voice[] = allVoices.map((v: unknown) => {
        const voice = v as Record<string, unknown>;
        return {
          id: voice.id as string,
          name: voice.name as string,
          gender: (voice.gender === 'male' || voice.gender === 'female') ? voice.gender as 'male' | 'female' : null,
          language: voice.language as string,
          accent: voice.accent as string,
          description: (voice.personality || voice.description) as string,
          age: voice.age as string,
          style: (voice.styles as string[])?.[0] || voice.style as string,
          use_case: (voice.useCase || voice.use_case) as string,
          sampleUrl: voice.sampleUrl as string,
          // Add provider info
          provider: voice.provider as string
        } as Voice & { provider?: string };
      });
      
      // Only update state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        console.log(`✅ Loaded ${mappedVoices.length} voices for ${selectedProvider}/${selectedLanguage}`);
        console.log(`🔍 First few voices:`, mappedVoices.slice(0, 3).map(v => ({ name: v.name, language: v.language, accent: v.accent })));
        setCurrentVoices(mappedVoices);
      } else {
        console.log('🚫 Voice loading request was aborted, skipping state update');
      }
    } catch (error) {
      // Don't log abort errors as they're intentional
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('🚫 Voice loading request cancelled');
        return; // Exit early for aborted requests
      }
      console.error('Failed to load voices:', error);
    } finally {
      // Only clear loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [selectedProvider, selectedLanguage, selectedAccent]);

  // When provider changes, load voices for that provider (or all if "any")
  useEffect(() => {
    loadVoices();
  }, [loadVoices]);
  
  // Helper: Get filtered voices based on region and accent
  const getFilteredVoices = useCallback(() => {
    console.log('🎯 getFilteredVoices called:', {
      selectedLanguage,
      selectedProvider,
      selectedRegion,
      hasRegions,
      currentVoicesCount: currentVoices.length,
      firstVoice: currentVoices[0]?.name,
      firstVoiceLanguage: currentVoices[0]?.language
    });
    
    // If no region selected or no regions available, return all voices
    if (!selectedRegion || !hasRegions) {
      return currentVoices;
    }
    
    // Get accents for the selected region
    const regionalAccents = getRegionalAccents(selectedLanguage, selectedRegion);
    
    // Filter voices to only those with accents in the selected region
    return currentVoices.filter(voice => {
      // OpenAI voices are always available regardless of region
      if ((voice as Voice & { provider?: string }).provider === 'openai') {
        return true;
      }
      
      if (!voice.accent) return false;
      // Check if voice accent is in the regional accents list (excluding "none")
      return regionalAccents.includes(voice.accent) && voice.accent !== 'none';
    });
  }, [currentVoices, selectedRegion, selectedLanguage, hasRegions, selectedProvider]);
  
  // Helper: Get voices for a specific provider (filters from current voices if needed)
  const getVoicesForProvider = useCallback((provider: Provider) => {
    // If we're already showing this provider's voices, return them
    if (selectedProvider === provider) {
      return currentVoices;
    }
    
    // If we have "any" selected, filter the voices by provider
    if (selectedProvider === 'any' && currentVoices.length > 0) {
      // The voices should have provider info attached during loading
      return currentVoices.filter(voice => {
        // Check if voice has provider metadata
        if ('provider' in voice) {
          return (voice as Voice & { provider: string }).provider === provider;
        }
        // Fallback: try to guess by ID format
        // ElevenLabs IDs are alphanumeric, Lovo uses MongoDB ObjectIds
        if (provider === 'elevenlabs') {
          return !voice.id.match(/^[0-9a-f]{24}$/i); // Not a MongoDB ObjectId
        }
        if (provider === 'lovo') {
          return voice.id.match(/^[0-9a-f]{24}$/i); // Is a MongoDB ObjectId
        }
        return false;
      });
    }
    
    // Otherwise return empty - shouldn't happen in normal flow
    console.warn(`getVoicesForProvider: Unexpected state - provider=${provider}, selectedProvider=${selectedProvider}`);
    return [];
  }, [currentVoices, selectedProvider]);
  
  // Helper: Auto-select best provider for format
  const autoSelectProvider = useCallback((format: CampaignFormat) => {
    const bestProvider = ProviderSelector.selectDefault(format, voiceCounts);
    setSelectedProvider(bestProvider);
    console.log(`🎯 Auto-selected ${bestProvider} for ${format}`);
    return bestProvider;
  }, [voiceCounts]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  return {
    // Core state
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    selectedProvider,
    
    // Available options
    availableLanguages,
    availableRegions,
    availableAccents,
    availableProviders,
    
    // Voice data
    currentVoices,
    voiceCounts,
    
    // Loading state
    isLoading,
    
    // Helper flags
    hasRegions,
    hasAccents,
    
    // Actions
    setSelectedLanguage,
    setSelectedRegion,
    setSelectedAccent,
    setSelectedProvider,
    
    // Helper methods
    getFilteredVoices,
    getVoicesForProvider,
    autoSelectProvider,
    loadVoices, // Force reload voices
  };
}