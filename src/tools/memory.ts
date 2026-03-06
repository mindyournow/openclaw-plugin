/**
 * myn_memory tool - Agent memory remember/recall/forget
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
  content: Type.Optional(Type.String({ minLength: 1, description: 'Memory content to store' })),
  category: Type.Optional(Type.Union([
    Type.Literal('user_preference'),
    Type.Literal('work_context'),
    Type.Literal('personal_info'),
    Type.Literal('decision'),
    Type.Literal('insight'),
    Type.Literal('routine')
  ])),
  tags: Type.Optional(Type.Array(Type.String())),
  importance: Type.Optional(Type.Union([
    Type.Literal('low'),
    Type.Literal('medium'),
    Type.Literal('high'),
    Type.Literal('critical')
  ])),
  expiresAt: Type.Optional(Type.String({ format: 'date-time', description: 'Optional expiration date' })),
  // recall/forget parameters
  memoryId: Type.Optional(Type.String({ format: 'uuid' })),
  // search parameters
  query: Type.Optional(Type.String()),
  filterCategory: Type.Optional(Type.String()),
  filterTags: Type.Optional(Type.Array(Type.String())),
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

async function remember(_client: MynApiClient, input: MemoryInput) {
  if (!input.content) {
    return errorResult('content is required for remember action');
  }

  // The backend does not expose a POST /api/v1/customers/memories endpoint.
  // Memories are created automatically through the AI conversation system (Kaia).
  // To persist a memory, include it naturally in the conversation context so
  // the backend's AI service stores it on your behalf.
  return errorResult(
    'Direct memory creation is not supported. Memories are created ' +
    'automatically through conversations with the AI assistant. ' +
    'To store a memory, mention it in conversation context.'
  );
}

async function recall(client: MynApiClient, input: MemoryInput) {
  // The backend only supports GET /api/v1/customers/memories (list all).
  // There is no GET /api/v1/customers/memories/{memoryId} endpoint.
  const data = await client.get<
    Array<{
      memoryId: string;
      content: string;
      category: string;
      tags: string[];
      importance: string;
      createdAt: string;
      accessedAt?: string;
    }>
  >('/api/v1/customers/memories');

  if (input.memoryId) {
    // Filter client-side for a specific memory
    const memories = Array.isArray(data) ? data : [];
    const match = memories.find(m => m.memoryId === input.memoryId);
    if (!match) {
      return errorResult(`Memory not found: ${input.memoryId}`);
    }
    return jsonResult(match);
  }

  return jsonResult(data);
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
  // The backend has no /api/v1/customers/memories/search endpoint.
  // Fetch all memories and filter client-side.
  const data = await client.get<
    Array<{
      memoryId: string;
      content: string;
      category: string;
      tags: string[];
      importance: string;
      createdAt: string;
    }>
  >('/api/v1/customers/memories');

  let results = Array.isArray(data) ? data : [];

  // Client-side filtering
  if (input.query) {
    const q = input.query.toLowerCase();
    results = results.filter(m =>
      m.content?.toLowerCase().includes(q) ||
      m.tags?.some(t => t.toLowerCase().includes(q))
    );
  }
  if (input.filterCategory) {
    results = results.filter(m => m.category === input.filterCategory);
  }
  if (input.filterTags && input.filterTags.length > 0) {
    results = results.filter(m =>
      input.filterTags!.every(tag => m.tags?.includes(tag))
    );
  }
  if (input.limit) {
    results = results.slice(0, input.limit);
  }

  return jsonResult({ results, total: results.length });
}

export function registerMemoryTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_memory',
    name: 'MYN Memory',
    description: 'Store and retrieve agent memories. Actions: remember, recall, forget, search.',
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
