import { useState, useEffect } from 'react';
import { Language } from '@/types';

export type RegionConfig = {
  region: 'apac' | 'americas' | 'europe';
  isAPAC: boolean;
  isAmericas: boolean;
  isEurope: boolean;
  defaultLanguage: Language;
  needsOpenAIProxy: boolean;
};

/**
 * Hook to get region configuration from the server
 */
export function useRegionConfig() {
  const [config, setConfig] = useState<RegionConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRegionConfig = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch('/api/config/region');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch region config: ${response.statusText}`);
        }
        
        const data = await response.json();
        setConfig(data);
      } catch (err) {
        console.error('Error fetching region config:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        
        // Fallback to Americas defaults on error
        setConfig({
          region: 'americas',
          isAPAC: false,
          isAmericas: true,
          isEurope: false,
          defaultLanguage: 'en' as Language,
          needsOpenAIProxy: false
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchRegionConfig();
  }, []);

  return {
    config,
    isLoading,
    error,

    // Convenience getters
    isAPAC: config?.isAPAC ?? false,
    isAmericas: config?.isAmericas ?? true,
    isEurope: config?.isEurope ?? false,
    defaultLanguage: config?.defaultLanguage ?? ('en' as Language),
    needsOpenAIProxy: config?.needsOpenAIProxy ?? false
  };
}