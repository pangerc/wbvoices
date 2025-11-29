/**
 * Redis operations for Conversation Storage
 *
 * Stores conversation history per ad for agentic tool-calling.
 * Each ad has one conversation that persists across multiple turns.
 *
 * Redis key pattern:
 * - ad:{adId}:conversation - Conversation messages (JSON array)
 */

import { getRedisV3 } from "../redis-v3";
import type { ConversationMessage } from "@/lib/tool-calling/types";

// ============ Key Builders ============

/**
 * Generate Redis key for conversation storage
 */
export const CONVERSATION_KEYS = {
  /** Conversation history: ad:{adId}:conversation */
  conversation: (adId: string) => `ad:${adId}:conversation`,
} as const;

// ============ Conversation Operations ============

/**
 * Get the conversation history for an ad
 *
 * @param adId - Advertisement ID
 * @returns Array of conversation messages (empty if none)
 */
export async function getConversation(
  adId: string
): Promise<ConversationMessage[]> {
  const redis = getRedisV3();
  const key = CONVERSATION_KEYS.conversation(adId);

  const data = await redis.get(key);

  if (!data) {
    return [];
  }

  return typeof data === "string" ? JSON.parse(data) : data;
}

/**
 * Save the full conversation history for an ad
 * Overwrites any existing conversation
 *
 * @param adId - Advertisement ID
 * @param messages - Full conversation history
 */
export async function saveConversation(
  adId: string,
  messages: ConversationMessage[]
): Promise<void> {
  const redis = getRedisV3();
  const key = CONVERSATION_KEYS.conversation(adId);

  await redis.set(key, JSON.stringify(messages));

  console.log(`✅ Saved conversation for ad ${adId} (${messages.length} messages)`);
}

/**
 * Append new messages to an existing conversation
 * Loads existing, appends, and saves back
 *
 * @param adId - Advertisement ID
 * @param newMessages - Messages to append
 * @returns Updated full conversation
 */
export async function appendToConversation(
  adId: string,
  newMessages: ConversationMessage[]
): Promise<ConversationMessage[]> {
  const existing = await getConversation(adId);
  const updated = [...existing, ...newMessages];
  await saveConversation(adId, updated);
  return updated;
}

/**
 * Clear the conversation history for an ad
 * Useful for "start fresh" scenarios
 *
 * @param adId - Advertisement ID
 */
export async function clearConversation(adId: string): Promise<void> {
  const redis = getRedisV3();
  const key = CONVERSATION_KEYS.conversation(adId);

  await redis.del(key);

  console.log(`✅ Cleared conversation for ad ${adId}`);
}

/**
 * Check if a conversation exists for an ad
 *
 * @param adId - Advertisement ID
 * @returns True if conversation exists
 */
export async function hasConversation(adId: string): Promise<boolean> {
  const redis = getRedisV3();
  const key = CONVERSATION_KEYS.conversation(adId);

  const exists = await redis.exists(key);
  return exists === 1;
}
