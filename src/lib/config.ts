/**
 * Regional configuration utilities for multi-region deployment
 */

export type AppRegion = 'apac' | 'americas' | 'europe';

/**
 * Get the current application region from environment variable
 */
export function getAppRegion(): AppRegion {
  const region = process.env.ALEPHREGION?.toLowerCase();
  
  switch (region) {
    case 'apac':
      return 'apac';
    case 'americas':
      return 'americas';
    case 'europe':
      return 'europe';
    default:
      return 'americas'; // Default fallback
  }
}

/**
 * Check if the current instance is running in APAC region
 */
export function isAPACRegion(): boolean {
  return getAppRegion() === 'apac';
}

/**
 * Check if the current instance is running in Americas region
 */
export function isAmericasRegion(): boolean {
  return getAppRegion() === 'americas';
}

/**
 * Get region-specific configuration
 */
export function getRegionConfig() {
  const region = getAppRegion();
  
  return {
    region,
    isAPAC: region === 'apac',
    isAmericas: region === 'americas',
    isEurope: region === 'europe',
    
    // Default language per region
    defaultLanguage: region === 'apac' ? 'zh' : 'en',
    
    // Available AI providers per region
    availableAIModels: region === 'apac'
      ? ['openai', 'qwen', 'moonshot'] as const
      : ['openai', 'qwen', 'moonshot'] as const,  // All providers available in all regions
      
    // OpenAI proxy configuration
    needsOpenAIProxy: region === 'apac',
    proxyApiUrl: process.env.AMERICAS_API_URL || 'https://wb-voices.vercel.app',
    proxyApiKey: process.env.PROXY_API_KEY
  };
}

/**
 * Client-side region detection (for use in React components)
 * This will be populated by server-side rendering or API call
 */
export function getClientRegionConfig() {
  // This can be populated via Next.js runtime config or API endpoint
  // For now, we'll detect on the server side and pass down via props
  return {
    region: 'americas' as AppRegion, // Default fallback for client-side
    isAPAC: false,
    isAmericas: true,
    isEurope: false,
    defaultLanguage: 'en' as const,
    availableAIModels: ['openai', 'qwen', 'moonshot'] as const,
    needsOpenAIProxy: false
  };
}