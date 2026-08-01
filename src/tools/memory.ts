/**
 * myn_memory tool - Agent memory remember/recall/forget/search
 *
 * MIN-801: Now wired to real backend endpoints:
 * - remember → POST /api/v1/agent/memories
 * - search   → GET /api/v1/agent/memories/search
 * - recall   → GET /api/v1/customers/memories (unchanged)
 * - forget   → DELETE /api/v1/customers/memories/{id} (unchanged)
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const MemoryInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('remember'),
    Type.Literal('recall'),
    Type.Literal('forget'),
    Type.Literal('search')
  ]),
  // remember parameters
  content: Type.Optional(Type.String({ minLength: 1, description: 'Memory content to store (max 500 chars)' })),
  category: Type.Optional(Type.Union([
    Type.Literal('PREFERENCE'),
    Type.Literal('PATTERN'),
    Type.Literal('STYLE'),
    Type.Literal('MYN_BEHAVIOR'),
    Type.Literal('PERSONAL'),
    Type.Literal('RELATIONSHIP')
  ])),
  // recall/forget parameters
  memoryId: Type.Optional(Type.String({ format: 'uuid' })),
  // search parameters
  query: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ default: 10 }))
});

export type MemoryInput = typeof MemoryInputSchema.static;

export async function executeMemory(
  client: MynApiClient,
  input: MemoryInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'remember':
        return await remember(client, input);
      case 'recall':
        return await recall(client, input);
      case 'forget':
        return await forget(client, input);
      case 'search':
        return await searchMemories(client, input);
      default:
        return errorResult(`Unknown action: ${(input as { action: string }).action}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      return errorResult(error.message);
    }
    return errorResult('Unknown error occurred');
  }
}

async function remember(client: MynApiClient, input: MemoryInput) {
  if (!input.content) {
    return errorResult('content is required for remember action');
  }

  const body: Record<string, unknown> = { content: input.content };
  if (input.category) {
    body.type = input.category;
  }

  const data = await client.post<{
    id: string;
    type: string;
    content: string;
    confidence: number;
    duplicate: boolean;
    message: string;
  }>('/api/v1/agent/memories', body);

  return jsonResult(data);
}

/** Maximum number of memories to fetch from the backend */
const MEMORY_FETCH_LIMIT = 50;

async function recall(client: MynApiClient, input: MemoryInput) {
  const params = new URLSearchParams({ limit: String(input.limit ?? MEMORY_FETCH_LIMIT) });
  const data = await client.get<{
    memories: Array<{
      memoryId: string;
      content: string;
      category: string;
      tags: string[];
      importance: string;
      createdAt: string;
      accessedAt?: string;
    }>;
    totalCount: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>(`/api/v1/customers/memories?${params.toString()}`);
  const memories = data.memories;

  if (input.memoryId) {
    const match = memories.find(m => m.memoryId === input.memoryId);
    if (!match) {
      return errorResult(`Memory not found: ${input.memoryId}`);
    }
    return jsonResult(match);
  }

  return jsonResult(memories);
}

async function forget(client: MynApiClient, input: MemoryInput) {
  if (!input.memoryId) {
    return errorResult('memoryId is required for forget action');
  }

  await client.delete(`/api/v1/customers/memories/${input.memoryId}`);

  return jsonResult({
    deleted: true,
    memoryId: input.memoryId
  });
}

async function searchMemories(client: MynApiClient, input: MemoryInput) {
  if (!input.query) {
    return errorResult('query is required for search action');
  }

  const params = new URLSearchParams({
    query: input.query,
    limit: String(input.limit ?? 10),
  });

  const data = await client.get<{
    results: Array<{
      id: string;
      type: string;
      content: string;
      confidence: number;
      createdAt: string;
      topics?: string[];
    }>;
    total: number;
  }>(`/api/v1/agent/memories/search?${params.toString()}`);

  return jsonResult(data);
}

export function registerMemoryTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_memory',
    name: 'MYN Memory',
    description: 'Store and retrieve agent memories. Actions: remember (create a memory), recall (list all memories), forget (delete a memory), search (semantic search).',
    inputSchema: MemoryInputSchema,
    async execute(input: unknown) {
      return executeMemory(client, input as MemoryInput);
    }
  });
}

// Type for OpenClaw plugin API
interface OpenClawPluginApi {
  registerTool(tool: {
    id: string;
    name: string;
    description: string;
    inputSchema: unknown;
    execute: (input: unknown) => Promise<unknown>;
  }): void;
  logger: {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  pluginConfig?: Record<string, unknown>;
}
