import OpenAI from "openai";
import { config } from "../config";
import { storage } from "../storage";
import { AI_MODELS, type AIModelId } from "@shared/schema";
import { logger } from "../logger";

export const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

export const openrouter = new OpenAI({
  apiKey: config.openRouter.apiKey,
  baseURL: config.openRouter.baseUrl,
});

export type AIModelPurpose = 'sync' | 'sentiment' | 'general';

export async function getConfiguredAIModel(promptModelId?: string | null, purpose: AIModelPurpose = 'general'): Promise<{ modelId: AIModelId; modelInfo: typeof AI_MODELS[AIModelId] }> {
  // First check if a prompt-level model is specified
  if (promptModelId && promptModelId in AI_MODELS) {
    const modelId = promptModelId as AIModelId;
    return { modelId, modelInfo: AI_MODELS[modelId] };
  }
  
  // Map purpose to the corresponding system setting key
  const settingKeyMap: Record<AIModelPurpose, string> = {
    sync: 'sync_ai_model',
    sentiment: 'sentiment_ai_model',
    general: 'ai_model',
  };
  
  // Try purpose-specific setting first, then fall back to general ai_model
  const purposeSetting = await storage.getSystemSetting(settingKeyMap[purpose]);
  let rawModelId = purposeSetting?.value;
  
  // If no purpose-specific setting, fall back to general ai_model setting
  if (!rawModelId && purpose !== 'general') {
    const generalSetting = await storage.getSystemSetting("ai_model");
    rawModelId = generalSetting?.value;
  }
  
  // Default to gpt-4.1-mini if no setting found
  rawModelId = rawModelId || "gpt-4.1-mini";
  
  // Validate that the model exists in AI_MODELS
  const isValidModel = rawModelId in AI_MODELS;
  const modelId = isValidModel ? (rawModelId as AIModelId) : "gpt-4.1-mini";
  const modelInfo = AI_MODELS[modelId];
  
  return { modelId, modelInfo };
}

export function calculateAICost(inputTokens: number, outputTokens: number, modelInfo: typeof AI_MODELS[AIModelId]): number {
  // Costs are per 1K tokens
  return (inputTokens * modelInfo.inputCost / 1000) + (outputTokens * modelInfo.outputCost / 1000);
}
