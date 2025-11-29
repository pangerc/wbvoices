/**
 * Provider Factory
 *
 * Creates tool-calling adapters based on provider selection.
 * User chooses provider explicitly - no automatic routing by language.
 */

import type { ToolCallingAdapter } from "./ToolCallingAdapter";
import { OpenAIAdapter } from "./adapters/OpenAIAdapter";
import { QwenAdapter } from "./adapters/QwenAdapter";
import { KimiAdapter } from "./adapters/KimiAdapter";
import type { AIModel } from "@/utils/aiModelSelection";

/**
 * Provider type for explicit selection
 */
export type Provider = "openai" | "qwen" | "moonshot";

/**
 * Singleton instances for each provider
 */
const adapterInstances = new Map<Provider, ToolCallingAdapter>();

/**
 * Get or create a tool-calling adapter for the specified provider
 *
 * @param provider - The provider to use (openai, qwen, moonshot)
 * @returns The adapter instance
 */
export function getAdapter(provider: Provider): ToolCallingAdapter {
  // Check for existing instance
  if (!adapterInstances.has(provider)) {
    // Create new instance
    switch (provider) {
      case "openai":
        adapterInstances.set(provider, new OpenAIAdapter());
        break;
      case "qwen":
        adapterInstances.set(provider, new QwenAdapter());
        break;
      case "moonshot":
        adapterInstances.set(provider, new KimiAdapter());
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  return adapterInstances.get(provider)!;
}

/**
 * Get adapter from AIModel value (handles legacy values)
 *
 * @param aiModel - The AI model value from user selection
 * @returns The adapter instance
 */
export function getAdapterForModel(aiModel: AIModel): ToolCallingAdapter {
  // AIModel is already normalized to provider names: 'openai', 'qwen', 'moonshot'
  return getAdapter(aiModel as Provider);
}

/**
 * Get all available providers
 */
export function getAvailableProviders(): Provider[] {
  return ["openai", "qwen", "moonshot"];
}

/**
 * Check if a provider is available (has API key configured)
 */
export function isProviderAvailable(provider: Provider): boolean {
  switch (provider) {
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "qwen":
      return !!process.env.QWEN_API_KEY;
    case "moonshot":
      return !!process.env.MOONSHOT_API_KEY;
    default:
      return false;
  }
}
