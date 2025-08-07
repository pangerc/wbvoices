import { useState, useEffect } from "react";
import { Provider, Voice, Language } from "@/types";
import {
  getLanguageName,
  getLanguageAccents,
  areSameLanguageFamily,
  unifiedDisplayLanguages,
} from "@/utils/language";

export interface VoiceManagerState {
  // Core state
  selectedProvider: Provider;
  selectedLanguage: Language;
  selectedAccent: string | null;
  availableLanguages: { code: Language; name: string }[];
  allVoices: Voice[];
  
  // Actions
  setSelectedProvider: (provider: Provider) => void;
  setSelectedLanguage: (language: Language) => void;
  setSelectedAccent: (accent: string | null) => void;
  
  // Computed
  getFilteredVoices: (ignoreAccentFilter?: boolean) => Voice[];
}

export function useVoiceManager(): VoiceManagerState {
  const [selectedProvider, setSelectedProvider] = useState<Provider>("elevenlabs");
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("en-US");
  const [selectedAccent, setSelectedAccent] = useState<string | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<
    { code: Language; name: string }[]
  >([]);
  const [allVoices, setAllVoices] = useState<Voice[]>([]);

  // Reset accent when language or provider changes
  useEffect(() => {
    setSelectedAccent(null);
  }, [selectedLanguage, selectedProvider]);

  // Fetch available languages based on provider
  useEffect(() => {
    const fetchLanguages = async () => {
      if (selectedProvider === "lovo") {
        const response = await fetch(`/api/voice/list?provider=lovo`);
        const data = await response.json();
        const voicesByLanguage = data.voicesByLanguage || {};

        const uniqueLanguages = Object.keys(voicesByLanguage).sort();
        const languageOptions = uniqueLanguages.map((lang) => ({
          code: lang as Language,
          name: getLanguageName(lang),
        }));

        const filteredOptions = filterDuplicateLanguages(languageOptions);
        setAvailableLanguages(filteredOptions);
        
        if (filteredOptions.length > 0) {
          setSelectedLanguage(filteredOptions[0].code);
        }
      } else if (selectedProvider === "elevenlabs") {
        // ElevenLabs
        const response = await fetch(`/api/voice/list?provider=elevenlabs`);
        const data = await response.json();
        const voices = data.voices || [];

        const uniqueLanguages = [
          ...new Set(voices.map((v: Voice) => v.language)),
        ]
          .sort()
          .filter((lang): lang is string => 
            typeof lang === "string" && 
            lang !== "UNKNOWN" && 
            lang !== "en-US-EN-US"
          );

        const languageOptions = uniqueLanguages.map((lang) => ({
          code: lang as Language,
          name: getLanguageName(lang),
        }));

        const filteredOptions = filterDuplicateLanguages(languageOptions);
        setAvailableLanguages(filteredOptions);
        
        if (filteredOptions.length > 0) {
          setSelectedLanguage(filteredOptions[0].code);
        }
      } else if (selectedProvider === "openai") {
        // OpenAI
        const response = await fetch(`/api/voice/list?provider=openai`);
        const data = await response.json();
        const voicesByLanguage = data.voicesByLanguage || {};

        const uniqueLanguages = Object.keys(voicesByLanguage).sort();
        const languageOptions = uniqueLanguages.map((lang) => ({
          code: lang as Language,
          name: getLanguageName(lang as Language),
        }));

        const filteredOptions = filterDuplicateLanguages(languageOptions);
        setAvailableLanguages(filteredOptions);
        
        if (filteredOptions.length > 0) {
          setSelectedLanguage(filteredOptions[0].code);
        }
      }
    };
    
    fetchLanguages();
  }, [selectedProvider]);

  // Fetch voices for current language
  useEffect(() => {
    const fetchVoices = async () => {
      console.log(
        `Fetching voices for ${selectedProvider} with language ${selectedLanguage}`
      );

      const response = await fetch(
        `/api/voice/list?provider=${selectedProvider}&language=${selectedLanguage}`
      );
      const data = await response.json();

      if (selectedProvider === "lovo") {
        const voices = data.voicesByLanguage?.[selectedLanguage] || [];

        // Handle unified languages by fetching all variants
        const [baseLang] = selectedLanguage.split("-");
        if (unifiedDisplayLanguages.includes(baseLang)) {
          const allVoicesResponse = await fetch(`/api/voice/list?provider=lovo`);
          const allVoicesData = await allVoicesResponse.json();
          const voicesByLanguage = allVoicesData.voicesByLanguage || {};

          const allFamilyVoices = Object.entries(voicesByLanguage)
            .filter(([lang]) => lang.startsWith(`${baseLang}-`))
            .flatMap(([, langVoices]) => langVoices as Voice[]);

          if (allFamilyVoices.length > 0) {
            setAllVoices(allFamilyVoices);
          } else {
            setAllVoices(voices);
          }
        } else {
          setAllVoices(voices);
        }
      } else if (selectedProvider === "elevenlabs") {
        // ElevenLabs
        const voices = data.voices || [];
        setAllVoices(voices);
      } else if (selectedProvider === "openai") {
        // OpenAI
        const voices = data.voices || [];
        setAllVoices(voices);
      }
    };
    
    fetchVoices();
  }, [selectedProvider, selectedLanguage]);

  const getFilteredVoices = (ignoreAccentFilter = false): Voice[] => {
    const [baseLang] = selectedLanguage.split("-");
    
    if (selectedProvider === "lovo") {
      let filteredVoices: Voice[] = [];

      if (unifiedDisplayLanguages.includes(baseLang)) {
        // Include all voices from the language family
        filteredVoices = allVoices.filter((voice) => {
          if (!voice.language) return false;
          return voice.language.startsWith(`${baseLang}-`);
        });
      } else {
        // Exact matches only
        filteredVoices = allVoices.filter(
          (voice) => voice.language === selectedLanguage
        );
      }

      // Fallback to all voices if no matches
      if (filteredVoices.length === 0) {
        return allVoices;
      }

      // Filter by accent if selected
      if (selectedAccent && !ignoreAccentFilter) {
        const normalizedAccent = selectedAccent.toLowerCase();
        const accentFiltered = filteredVoices.filter(
          (voice) =>
            voice.accent && voice.accent.toLowerCase() === normalizedAccent
        );

        if (accentFiltered.length > 0) {
          return accentFiltered;
        }
      }

      return filteredVoices;
    } else {
      // ElevenLabs filtering
      const exactMatches = allVoices.filter(
        (voice) => voice.language === selectedLanguage
      );

      const familyMatches = allVoices.filter(
        (voice) =>
          voice.language &&
          areSameLanguageFamily(selectedLanguage, voice.language) &&
          voice.language !== selectedLanguage
      );

      const multilingualMatches = allVoices.filter((voice) => {
        if (!voice.isMultilingual || !voice.accent) return false;

        const voiceAccent = voice.accent.toLowerCase();
        const languageAccents = getLanguageAccents(selectedLanguage).map(
          (accent) => accent.toLowerCase()
        );

        return languageAccents.some(
          (accent) =>
            voiceAccent.includes(accent) &&
            accent !== "none" &&
            accent !== "standard"
        );
      });

      // Combine and deduplicate voices by ID to prevent the same voice appearing multiple times
      const voiceMap = new Map<string, Voice>();
      
      [...exactMatches, ...familyMatches, ...multilingualMatches].forEach(voice => {
        voiceMap.set(voice.id, voice);
      });
      
      const allPossibleVoices = Array.from(voiceMap.values());

      // Filter by accent if selected
      if (selectedAccent && !ignoreAccentFilter) {
        const normalizedAccent = selectedAccent.toLowerCase();
        const accentFiltered = allPossibleVoices.filter(
          (voice) =>
            voice.accent && voice.accent.toLowerCase() === normalizedAccent
        );

        if (accentFiltered.length > 0) {
          return accentFiltered;
        }
      }

      return allPossibleVoices;
    }
  };

  return {
    selectedProvider,
    selectedLanguage,
    selectedAccent,
    availableLanguages,
    allVoices,
    setSelectedProvider,
    setSelectedLanguage,
    setSelectedAccent,
    getFilteredVoices,
  };
}

// Helper function extracted from page.tsx
function filterDuplicateLanguages(
  options: { code: Language; name: string }[]
): { code: Language; name: string }[] {
  const processedOptions: { code: Language; name: string }[] = [];
  const seenLanguages = new Set<string>();

  const languageGroups: Record<string, { code: Language; name: string }[]> = {};

  for (const option of options) {
    const baseLang = option.code.toString().split("-")[0];
    if (!languageGroups[baseLang]) {
      languageGroups[baseLang] = [];
    }
    languageGroups[baseLang].push(option);
  }

  for (const [baseLang, group] of Object.entries(languageGroups)) {
    if (unifiedDisplayLanguages.includes(baseLang)) {
      const preferredVariants: Record<string, string[]> = {
        ar: ["SA", "EG", "DZ", "AR"],
        en: ["US", "GB", "AU", "CA", "IE", "IN"],
        es: ["ES", "MX", "AR", "CO"],
        fr: ["FR", "CA", "BE", "CH"],
        de: ["DE", "AT", "CH"],
        pt: ["PT", "BR"],
        zh: ["CN", "TW", "HK"],
      };

      let selectedOption = null;
      const preferences = preferredVariants[baseLang] || [];

      for (const regionCode of preferences) {
        const preferredCode = `${baseLang}-${regionCode}`;
        const found = group.find(
          (opt) =>
            opt.code.toString().toUpperCase() === preferredCode.toUpperCase()
        );
        if (found) {
          selectedOption = found;
          break;
        }
      }

      if (!selectedOption && group.length > 0) {
        selectedOption = group[0];
      }

      if (selectedOption) {
        processedOptions.push(selectedOption);
      }
      continue;
    }

    group.forEach((option) => {
      if (!seenLanguages.has(option.name)) {
        seenLanguages.add(option.name);
        processedOptions.push(option);
      }
    });
  }

  return processedOptions.sort((a, b) => a.name.localeCompare(b.name));
}