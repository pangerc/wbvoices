import { BaseAudioProvider } from './BaseAudioProvider';

// Provider registry type
type ProviderRegistry = {
  voice: Record<string, new () => BaseAudioProvider>;
  music: Record<string, new () => BaseAudioProvider>;
  sfx: Record<string, new () => BaseAudioProvider>;
};

/**
 * Factory for creating audio provider instances
 * Supports dynamic provider selection and registration
 */
export class AudioProviderFactory {
  private static providers: ProviderRegistry = {
    voice: {},
    music: {},
    sfx: {}
  };

  /**
   * Register a new provider
   */
  static register(
    type: 'voice' | 'music' | 'sfx',
    name: string,
    providerClass: new () => BaseAudioProvider
  ): void {
    this.providers[type][name] = providerClass;
  }

  /**
   * Create a provider instance
   */
  static create(type: 'voice' | 'music' | 'sfx', providerName: string): BaseAudioProvider {
    const ProviderClass = this.providers[type][providerName];
    
    if (!ProviderClass) {
      throw new Error(`Provider '${providerName}' of type '${type}' not found. Available providers: ${Object.keys(this.providers[type]).join(', ')}`);
    }

    return new ProviderClass();
  }

  /**
   * Get all available providers for a type
   */
  static getAvailableProviders(type: 'voice' | 'music' | 'sfx'): string[] {
    return Object.keys(this.providers[type]);
  }

  /**
   * Check if a provider is registered
   */
  static isProviderRegistered(type: 'voice' | 'music' | 'sfx', providerName: string): boolean {
    return providerName in this.providers[type];
  }

  /**
   * Get all registered providers
   */
  static getAllProviders(): ProviderRegistry {
    return { ...this.providers };
  }
}

/**
 * Convenience function for creating providers
 */
export function createProvider(type: 'voice' | 'music' | 'sfx', providerName: string): BaseAudioProvider {
  return AudioProviderFactory.create(type, providerName);
}