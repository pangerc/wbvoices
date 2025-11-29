/**
 * 🎯 SINGLE SOURCE OF TRUTH FOR AI PROVIDERS
 * Simplified: 3 providers (OpenAI, Qwen, KIMI), reasoning effort is task-dependent
 */

export const AI_MODEL_REGISTRY = [
  {
    value: 'openai',
    label: 'OpenAI GPT-5.1',
    description: 'Best for most languages - high quality creative generation',
    technicalDetails: 'gpt-5.1 • Responses API',
    category: 'default' as const,
  },
  {
    value: 'qwen',
    label: 'Qwen-Max',
    description: 'Excellent for APAC languages and multilingual content',
    technicalDetails: 'qwen-max • Chat Completions',
    category: 'default' as const,
  },
  {
    value: 'moonshot',
    label: 'Moonshot KIMI',
    description: 'Optimized for Chinese content',
    technicalDetails: 'kimi-latest • Chat Completions',
    category: 'chinese' as const,
  },
] as const;

// Legacy model values that map to new providers (for backwards compatibility)
const LEGACY_MODEL_MAP: Record<string, string> = {
  'gpt5-premium': 'openai',
  'gpt5-fast': 'openai',
  'gpt5-balanced': 'openai',
};

/**
 * Normalize model value (handles legacy values)
 */
export function normalizeAIModel(model: string): AIModel {
  return (LEGACY_MODEL_MAP[model] || model) as AIModel;
}

// Export the AIModel type derived from the registry
export type AIModel = typeof AI_MODEL_REGISTRY[number]['value'];

// Default AI provider for new projects
export const DEFAULT_AI_MODEL: AIModel = 'openai';

// Helper functions to get model metadata
export function getAiModelLabel(model: AIModel): string {
  return AI_MODEL_REGISTRY.find(m => m.value === model)?.label || model;
}

export function getAiModelDescription(model: AIModel): string {
  return AI_MODEL_REGISTRY.find(m => m.value === model)?.description || '';
}

export function getAiModelTechnicalDetails(model: AIModel): string {
  return AI_MODEL_REGISTRY.find(m => m.value === model)?.technicalDetails || '';
}

/**
 * 🎯 AI PROVIDER LANGUAGE DEFAULTS
 * Suggested defaults based on language - user can always override
 */
export const AI_PROVIDER_DEFAULTS: Record<string, AIModel> = {
  // Chinese languages → KIMI
  'zh': 'moonshot',
  'zh-CN': 'moonshot',
  'zh-TW': 'moonshot',
  // Default for everything else → OpenAI
  'default': 'openai',
};

/**
 * Get suggested AI provider based on language
 * Returns a sensible default - user can always override in UI
 *
 * @param language - The selected language code (e.g., "zh", "zh-CN", "en")
 * @param availableModels - Array of currently available AI models
 * @returns Selected AI model or default
 */
export function selectAIModelForLanguage(
  language: string,
  availableModels: AIModel[]
): AIModel | null {
  // Check for exact match first, then prefix match
  let suggested = AI_PROVIDER_DEFAULTS[language];

  if (!suggested && language.includes('-')) {
    // Try base language (e.g., "zh" from "zh-CN")
    const baseLang = language.split('-')[0];
    suggested = AI_PROVIDER_DEFAULTS[baseLang];
  }

  // Fall back to default
  if (!suggested) {
    suggested = AI_PROVIDER_DEFAULTS['default'];
  }

  // Verify it's available
  if (!availableModels.includes(suggested)) {
    console.log(`⚠️ Suggested provider "${suggested}" not available for language: ${language}`);
    // Return first available model
    return availableModels[0] || null;
  }

  console.log(`🎯 Suggested AI provider "${suggested}" for language "${language}"`);
  return suggested;
}

/**
 * Check if a model value is a known provider
 */
export function isValidAIModel(model: string): model is AIModel {
  const validValues = AI_MODEL_REGISTRY.map(m => m.value) as readonly string[];
  return validValues.includes(model) || model in LEGACY_MODEL_MAP;
}

/**
 * Get display-friendly reason for AI provider selection
 */
export function getAIModelSelectionReason(model: AIModel, language: string): string {
  const isChineseLanguage = language === 'zh' || language.startsWith('zh-');
  const registryEntry = AI_MODEL_REGISTRY.find(m => m.value === model);

  if (isChineseLanguage && model === 'moonshot') {
    return 'Suggested Moonshot KIMI for Chinese content optimization';
  }

  if (registryEntry) {
    return `Using ${registryEntry.label} - ${registryEntry.description}`;
  }

  return `Using ${model} for creative generation`;
}