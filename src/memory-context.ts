/**
 * MIN-801: Memory context injection for OpenClaw's before_prompt_build hook.
 *
 * Fetches relevant Kaia memories from the MYN backend and formats them
 * for injection into the agent's conversation context via prependContext.
 */

import type { MynApiClient } from './client.js';

export interface MemoryContextItem {
  id: string;
  type: string;
  content: string;
  confidence: number;
  topics?: string[];
}

interface MemoryContextResponse {
  items: MemoryContextItem[];
  total: number;
}

/**
 * Fetch memories relevant to the user's current prompt.
 * Returns null if no memories are available or the request fails.
 */
export async function fetchMemoryContext(
  client: MynApiClient,
  prompt: string,
  limit: number = 10,
): Promise<MemoryContextItem[] | null> {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (prompt) {
      params.set('query', prompt);
    }
    const response = await client.get<MemoryContextResponse>(
      `/api/v1/agent/memories/context?${params.toString()}`
    );
    if (!response?.items?.length) return null;
    return response.items;
  } catch {
    // Graceful degradation — never block the conversation
    return null;
  }
}

/**
 * Format memories into a text block for injection into the conversation context.
 *
 * The format is designed to be concise and LLM-readable:
 * - Type tag for categorization
 * - Content is the memory itself
 * - Confidence as percentage so the LLM can weigh memories appropriately
 */
export function formatMemoriesForPrompt(memories: MemoryContextItem[]): string {
  if (!memories.length) return '';

  const lines = memories.map(m => {
    const pct = Math.round(m.confidence * 100);
    return `- [${m.type}] ${m.content} (confidence: ${pct}%)`;
  });

  return [
    '## What you know about this user (from Kaia Memory)',
    '',
    ...lines,
    '',
    'Use these memories naturally in conversation. Do not explicitly cite confidence scores to the user.',
  ].join('\n');
}
