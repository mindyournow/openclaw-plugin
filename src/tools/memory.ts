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

async function remember(client: MynApiClient, input: MemoryInput) {
  if (!input.content) {
    return errorResult('content is required for remember action');
  }

  const body: Record<string, unknown> = {
    content: input.content
  };

  if (input.category) body.category = input.category;
  if (input.tags) body.tags = input.tags;
  if (input.importance) body.importance = input.importance;
  if (input.expiresAt) body.expiresAt = input.expiresAt;

  const data = await client.post<{
    memoryId: string;
    stored: boolean;
    createdAt: string;
  }>('/api/v1/customers/memories', body);

  return jsonResult(data);
}

async function recall(client: MynApiClient, input: MemoryInput) {
  if (input.memoryId) {
    // Get specific memory
    const data = await client.get<{
      memoryId: string;
      content: string;
      category: string;
      tags: string[];
      importance: string;
      createdAt: string;
      accessedAt: string;
      accessCount: number;
      expiresAt?: string;
    }>(`/api/v1/customers/memories/${input.memoryId}`);

    return jsonResult(data);
  }

  // Get recent memories
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
  }>('/api/v1/customers/memories?limit=10');

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
  const params = new URLSearchParams();

  if (input.query) params.append('q', input.query);
  if (input.filterCategory) params.append('category', input.filterCategory);
  if (input.filterTags) {
    input.filterTags.forEach(tag => params.append('tag', tag));
  }
  if (input.limit) params.append('limit', input.limit.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';

  const data = await client.get<{
    results: Array<{
      memoryId: string;
      content: string;
      category: string;
      tags: string[];
      importance: string;
      relevance: number;
      createdAt: string;
    }>;
    total: number;
  }>(`/api/v1/customers/memories/search${queryString}`);

  return jsonResult(data);
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
