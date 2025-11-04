/**
 * 🎯 SINGLE SOURCE OF TRUTH FOR AI MODELS
 * All AI model configuration lives here - types, labels, descriptions, preferences
 */

export const AI_MODEL_REGISTRY = [
  {
    value: 'gpt5-thinking',
    label: 'GPT 5 Thinking',
    description: 'Full reasoning mode - highest quality, slower, best for complex creative direction',
    category: 'default' as const,
  },
  {
    value: 'gpt5-basic',
    label: 'GPT 5 Basic',
    description: 'Minimal reasoning - faster iteration, good for simple briefs',
    category: 'default' as const,
  },
  {
    value: 'gpt5-mini',
    label: 'GPT 5 Mini',
    description: 'Balanced speed and quality - recommended for most projects',
    category: 'default' as const,
  },
  {
    value: 'moonshot',
    label: 'Moonshot KIMI',
    description: 'Chinese LLM optimized for multilingual content',
    category: 'chinese' as const,
  },
  {
    value: 'qwen',
    label: 'Qwen-Max',
    description: "Alibaba's multilingual AI model",
    category: 'chinese' as const,
  },
] as const;

// Export the AIModel type derived from the registry
export type AIModel = typeof AI_MODEL_REGISTRY[number]['value'];

// Default AI model for new projects
export const DEFAULT_AI_MODEL: AIModel = 'gpt5-mini';

// Helper functions to get model metadata
export function getAiModelLabel(model: AIModel): string {
  return AI_MODEL_REGISTRY.find(m => m.value === model)?.label || model;
}

export function getAiModelDescription(model: AIModel): string {
  return AI_MODEL_REGISTRY.find(m => m.value === model)?.description || '';
}

/**
 * 🎯 AI MODEL LANGUAGE PREFERENCES
 * Configurable preferences for AI model selection based on language
 */
export const AI_MODEL_PREFERENCES = {
  chinese: AI_MODEL_REGISTRY.filter(m => m.category === 'chinese').map(m => m.value),
  default: AI_MODEL_REGISTRY.filter(m => m.category === 'default').map(m => m.value),
} as const;

/**
 * Intelligently select an AI model based on language preference
 * 
 * @param language - The selected language code (e.g., "zh", "zh-CN", "en")  
 * @param availableModels - Array of currently available AI models
 * @returns Selected AI model or null if none available
 */
export function selectAIModelForLanguage(
  language: string,
  availableModels: AIModel[]
): AIModel | null {
  const isChineseLanguage = language === 'zh' || language.startsWith('zh-');
  
  // Choose candidate models based on language
  const preferredModels = isChineseLanguage 
    ? AI_MODEL_PREFERENCES.chinese 
    : AI_MODEL_PREFERENCES.default;
  
  // Filter to only models that are actually available
  const availableCandidates = preferredModels.filter(model => 
    availableModels.includes(model)
  );
  
  // Random selection from available candidates
  if (availableCandidates.length === 0) {
    console.log(`⚠️ No preferred AI models available for language: ${language}`);
    return null;
  }
  
  const selectedModel = availableCandidates[
    Math.floor(Math.random() * availableCandidates.length)
  ];
  
  console.log(`🎯 Auto-selected AI model "${selectedModel}" for language "${language}" from ${availableCandidates.length} candidates`);
  return selectedModel;
}

/**
 * Check if a model should trigger auto-selection
 * Only auto-select if user is using a "default" model (not manually chosen)
 */
export function shouldAutoSelectAIModel(currentModel: AIModel): boolean {
  const allDefaultModels = [
    ...AI_MODEL_PREFERENCES.chinese,
    ...AI_MODEL_PREFERENCES.default
  ];
  
  // If current model is in our preference system, respect user choice
  // Only auto-select if they're using something completely different
  return !allDefaultModels.includes(currentModel);
}

/**
 * Get display-friendly reason for AI model selection
 */
export function getAIModelSelectionReason(model: AIModel, language: string): string {
  const isChineseLanguage = language === 'zh' || language.startsWith('zh-');

  if (isChineseLanguage) {
    switch (model) {
      case 'moonshot':
        return 'Auto-selected Moonshot KIMI for Chinese content optimization';
      case 'qwen':
        return 'Auto-selected Qwen-Max for Chinese language expertise';
      default:
        return `Selected ${model} for Chinese content`;
    }
  }

  switch (model) {
    case 'gpt5-thinking':
      return 'Selected GPT 5 Thinking for highest quality creative generation';
    case 'gpt5-basic':
      return 'Selected GPT 5 Basic for faster creative generation';
    case 'gpt5-mini':
      return 'Selected GPT 5 Mini for balanced creative generation';
    default:
      return `Selected ${model} for optimal creative generation`;
  }
}