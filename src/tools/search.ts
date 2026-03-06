/**
 * myn_search tool - Unified search across tasks, events, notes, and more
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const SearchInputSchema = Type.Object({
  action: Type.Literal('search'),
  query: Type.String({ minLength: 1, description: 'Search query string' }),
  types: Type.Optional(Type.Array(Type.Union([
    Type.Literal('task'),
    Type.Literal('habit'),
    Type.Literal('chore'),
    Type.Literal('event'),
    Type.Literal('project'),
    Type.Literal('note'),
    Type.Literal('memory')
  ]))),
  filters: Type.Optional(Type.Object({
    status: Type.Optional(Type.Union([
      Type.Literal('PENDING'),
      Type.Literal('IN_PROGRESS'),
      Type.Literal('COMPLETED'),
      Type.Literal('ARCHIVED')
    ])),
    priority: Type.Optional(Type.Union([
      Type.Literal('CRITICAL'),
      Type.Literal('OPPORTUNITY_NOW'),
      Type.Literal('OVER_THE_HORIZON'),
      Type.Literal('PARKING_LOT')
    ])),
    projectId: Type.Optional(Type.String()),
    dateFrom: Type.Optional(Type.String({ format: 'date' })),
    dateTo: Type.Optional(Type.String({ format: 'date' }))
  })),
  limit: Type.Optional(Type.Number({ default: 20, maximum: 100 })),
  offset: Type.Optional(Type.Number({ default: 0 }))
});

export type SearchInput = typeof SearchInputSchema.static;

export async function executeSearch(
  client: MynApiClient,
  input: SearchInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'search':
        return await performSearch(client, input);
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

async function performSearch(client: MynApiClient, input: SearchInput) {
  const params = new URLSearchParams();
  params.append('query', input.query);

  if (input.types && input.types.length > 0) {
    for (const t of input.types) {
      params.append('types', t);
    }
  }

  if (input.filters) {
    if (input.filters.status) params.append('status', input.filters.status);
    if (input.filters.priority) params.append('priority', input.filters.priority);
    if (input.filters.projectId) params.append('projectId', input.filters.projectId);
    if (input.filters.dateFrom) params.append('dateFrom', input.filters.dateFrom);
    if (input.filters.dateTo) params.append('dateTo', input.filters.dateTo);
  }

  if (input.limit) params.append('limit', String(input.limit));
  if (input.offset) params.append('offset', String(input.offset));

  const queryString = params.toString() ? `?${params.toString()}` : '';

  const data = await client.get<{
    results: Array<{
      id: string;
      type: string;
      title: string;
      description?: string;
      relevance: number;
      highlights: Array<{
        field: string;
        snippet: string;
      }>;
      metadata: Record<string, unknown>;
    }>;
    total: number;
    limit: number;
    offset: number;
    query: string;
    suggestions?: string[];
  }>(`/api/v2/search${queryString}`);

  return jsonResult(data);
}

export function registerSearchTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_search',
    name: 'MYN Search',
    description: 'Unified search across tasks, events, notes, and memories. Action: search.',
    inputSchema: SearchInputSchema,
    async execute(input: unknown) {
      return executeSearch(client, input as SearchInput);
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
