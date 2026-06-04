// Provider registration
import { ByteDanceVoiceProvider } from "./ByteDanceVoiceProvider";
import { ElevenLabsMusicProvider } from "./ElevenLabsMusicProvider";
import { ElevenLabsSoundFxProvider } from "./ElevenLabsSoundFxProvider";
import { ElevenLabsVoiceProvider } from "./ElevenLabsVoiceProvider";
import { LahajatiVoiceProvider } from "./LahajatiVoiceProvider";
import { LoudlyProvider } from "./LoudlyProvider";
import { LovoVoiceProvider } from "./LovoVoiceProvider";
import { MubertProvider } from "./MubertProvider";
import { OpenAIVoiceProvider } from "./OpenAIVoiceProvider";
import { AudioProviderFactory } from "./ProviderFactory";
import { QwenVoiceProvider } from "./QwenVoiceProvider";

// Register all providers
AudioProviderFactory.register("music", "mubert", MubertProvider);
AudioProviderFactory.register("music", "loudly", LoudlyProvider);
AudioProviderFactory.register("voice", "openai", OpenAIVoiceProvider);
AudioProviderFactory.register("voice", "elevenlabs", ElevenLabsVoiceProvider);
AudioProviderFactory.register("voice", "lovo", LovoVoiceProvider);
AudioProviderFactory.register("voice", "qwen", QwenVoiceProvider);
AudioProviderFactory.register("voice", "bytedance", ByteDanceVoiceProvider);
AudioProviderFactory.register("voice", "lahajati", LahajatiVoiceProvider);
AudioProviderFactory.register("sfx", "elevenlabs", ElevenLabsSoundFxProvider);
AudioProviderFactory.register("music", "elevenlabs", ElevenLabsMusicProvider);

// Export factory and providers
export { BaseAudioProvider } from "./BaseAudioProvider";
export { ByteDanceVoiceProvider } from "./ByteDanceVoiceProvider";
export { ElevenLabsMusicProvider } from "./ElevenLabsMusicProvider";
export { ElevenLabsSoundFxProvider } from "./ElevenLabsSoundFxProvider";
export { ElevenLabsVoiceProvider } from "./ElevenLabsVoiceProvider";
export { LahajatiVoiceProvider } from "./LahajatiVoiceProvider";
export { LoudlyProvider } from "./LoudlyProvider";
export { LovoVoiceProvider } from "./LovoVoiceProvider";
export { MubertProvider } from "./MubertProvider";
export { OpenAIVoiceProvider } from "./OpenAIVoiceProvider";
export { AudioProviderFactory, createProvider } from "./ProviderFactory";
export { QwenVoiceProvider } from "./QwenVoiceProvider";

// Export types
export type {
  AuthCredentials,
  BlobResult,
  ProviderResponse,
  StandardizedResponse,
  ValidationResult,
} from "./BaseAudioProvider";
