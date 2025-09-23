// Provider registration
import { AudioProviderFactory } from './ProviderFactory';
import { MubertProvider } from './MubertProvider';
import { LoudlyProvider } from './LoudlyProvider';
import { OpenAIVoiceProvider } from './OpenAIVoiceProvider';
import { ElevenLabsVoiceProvider } from './ElevenLabsVoiceProvider';
import { LovoVoiceProvider } from './LovoVoiceProvider';
import { ElevenLabsSoundFxProvider } from './ElevenLabsSoundFxProvider';
import { ElevenLabsMusicProvider } from './ElevenLabsMusicProvider';
import { QwenVoiceProvider } from './QwenVoiceProvider';
import { ByteDanceVoiceProvider } from './ByteDanceVoiceProvider';

// Register all providers
AudioProviderFactory.register('music', 'mubert', MubertProvider);
AudioProviderFactory.register('music', 'loudly', LoudlyProvider);
AudioProviderFactory.register('voice', 'openai', OpenAIVoiceProvider);
AudioProviderFactory.register('voice', 'elevenlabs', ElevenLabsVoiceProvider);
AudioProviderFactory.register('voice', 'lovo', LovoVoiceProvider);
AudioProviderFactory.register('voice', 'qwen', QwenVoiceProvider);
AudioProviderFactory.register('voice', 'bytedance', ByteDanceVoiceProvider);
AudioProviderFactory.register('sfx', 'elevenlabs', ElevenLabsSoundFxProvider);
AudioProviderFactory.register('music', 'elevenlabs', ElevenLabsMusicProvider);

// Export factory and providers
export { AudioProviderFactory, createProvider } from './ProviderFactory';
export { BaseAudioProvider } from './BaseAudioProvider';
export { MubertProvider } from './MubertProvider';
export { LoudlyProvider } from './LoudlyProvider';
export { OpenAIVoiceProvider } from './OpenAIVoiceProvider';
export { ElevenLabsVoiceProvider } from './ElevenLabsVoiceProvider';
export { LovoVoiceProvider } from './LovoVoiceProvider';
export { QwenVoiceProvider } from './QwenVoiceProvider';
export { ByteDanceVoiceProvider } from './ByteDanceVoiceProvider';
export { ElevenLabsSoundFxProvider } from './ElevenLabsSoundFxProvider';
export { ElevenLabsMusicProvider } from './ElevenLabsMusicProvider';

// Export types
export type {
  ValidationResult,
  AuthCredentials,
  ProviderResponse,
  BlobResult,
  StandardizedResponse
} from './BaseAudioProvider';