import { AIModel } from '@/types';

/**
 * 🎯 AI MODEL LANGUAGE PREFERENCES
 * Configurable preferences for AI model selection based on language
 * Easy to extend/modify without breaking existing functionality
 */
export const AI_MODEL_PREFERENCES = {
  chinese: ['moonshot', 'qwen'] as AIModel[], // Chinese-optimized models
  default: ['gpt5', 'gpt4'] as AIModel[]      // Default fallback models
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
  
  return `Selected ${model} for optimal creative generation`;
}