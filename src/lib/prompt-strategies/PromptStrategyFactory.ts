import { Provider } from "@/types";
import { PromptStrategy } from "./BasePromptStrategy";
import { ElevenLabsV3PromptStrategy } from "./ElevenLabsV3PromptStrategy";
import { OpenAIPromptStrategy } from "./OpenAIPromptStrategy";
import { LovoPromptStrategy } from "./LovoPromptStrategy";
import { QwenPromptStrategy } from "./QwenPromptStrategy";

/**
 * Factory for creating prompt strategy instances based on provider
 */
export class PromptStrategyFactory {
  private static strategies: Record<
    Provider,
    () => PromptStrategy
  > = {
    elevenlabs: () => new ElevenLabsV3PromptStrategy(),
    openai: () => new OpenAIPromptStrategy(),
    lovo: () => new LovoPromptStrategy(),
    qwen: () => new QwenPromptStrategy(),
    bytedance: () => new QwenPromptStrategy(), // Reuse Qwen strategy
    any: () => new ElevenLabsV3PromptStrategy(), // Default to ElevenLabs V3
  };

  /**
   * Create a prompt strategy for the given provider
   */
  static create(provider: Provider): PromptStrategy {
    const factory = this.strategies[provider];
    if (!factory) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return factory();
  }
}
