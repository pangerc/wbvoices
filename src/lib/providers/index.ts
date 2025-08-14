// Provider registration
import { AudioProviderFactory } from './ProviderFactory';
import { MubertProvider } from './MubertProvider';
import { LoudlyProvider } from './LoudlyProvider';
import { OpenAIVoiceProvider } from './OpenAIVoiceProvider';
import { ElevenLabsVoiceProvider } from './ElevenLabsVoiceProvider';
import { LovoVoiceProvider } from './LovoVoiceProvider';
import { ElevenLabsSoundFxProvider } from './ElevenLabsSoundFxProvider';

// Register all providers
AudioProviderFactory.register('music', 'mubert', MubertProvider);
AudioProviderFactory.register('music', 'loudly', LoudlyProvider);
AudioProviderFactory.register('voice', 'openai', OpenAIVoiceProvider);
AudioProviderFactory.register('voice', 'elevenlabs', ElevenLabsVoiceProvider);
AudioProviderFactory.register('voice', 'lovo', LovoVoiceProvider);
AudioProviderFactory.register('sfx', 'elevenlabs', ElevenLabsSoundFxProvider);

// Export factory and providers
export { AudioProviderFactory, createProvider } from './ProviderFactory';
export { BaseAudioProvider } from './BaseAudioProvider';
export { MubertProvider } from './MubertProvider';
export { LoudlyProvider } from './LoudlyProvider';
export { OpenAIVoiceProvider } from './OpenAIVoiceProvider';
export { ElevenLabsVoiceProvider } from './ElevenLabsVoiceProvider';
export { LovoVoiceProvider } from './LovoVoiceProvider';
export { ElevenLabsSoundFxProvider } from './ElevenLabsSoundFxProvider';

// Export types
export type {
  ValidationResult,
  AuthCredentials,
  ProviderResponse,
  BlobResult,
  StandardizedResponse
} from './BaseAudioProvider';