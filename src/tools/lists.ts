/**
 * myn_lists tool - Grocery/shopping list management
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const ListsInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('get'),
    Type.Literal('add'),
    Type.Literal('toggle'),
    Type.Literal('bulk_add'),
    Type.Literal('convert_to_tasks')
  ]),
  // Common parameters
  householdId: Type.Optional(Type.String({ format: 'uuid' })),
  // add/bulk_add parameters
  item: Type.Optional(Type.String({ minLength: 1 })),
  items: Type.Optional(Type.Array(Type.String())),
  category: Type.Optional(Type.String()), // e.g., "produce", "dairy", "pantry"
  quantity: Type.Optional(Type.String()), // e.g., "2", "1 lb", "3 bunches"
  notes: Type.Optional(Type.String()),
  // toggle parameters
  itemId: Type.Optional(Type.String({ format: 'uuid' })),
  checked: Type.Optional(Type.Boolean()),
  // convert_to_tasks parameters
  uncheckedOnly: Type.Optional(Type.Boolean({ default: true })),
  priority: Type.Optional(Type.Union([
    Type.Literal('CRITICAL'),
    Type.Literal('OPPORTUNITY_NOW'),
    Type.Literal('OVER_THE_HORIZON'),
    Type.Literal('PARKING_LOT')
  ]))
});

export type ListsInput = typeof ListsInputSchema.static;

export async function executeLists(
  client: MynApiClient,
  input: ListsInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'get':
        return await getList(client, input);
      case 'add':
        return await addItem(client, input);
      case 'toggle':
        return await toggleItem(client, input);
      case 'bulk_add':
        return await bulkAddItems(client, input);
      case 'convert_to_tasks':
        return await convertToTasks(client, input);
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

async function getList(client: MynApiClient, input: ListsInput) {
  // Get current user's household if not specified
  let householdId = input.householdId;
  if (!householdId) {
    const household = await client.get<{ id: string }>('/api/v1/households/current');
    if (!household?.id) {
      return errorResult('No household found. Please specify householdId.');
    }
    householdId = household.id;
  }

  const data = await client.get<{
    success: boolean;
    items: Array<{
      id: string;
      name: string;
      category?: string;
      quantity?: string;
      notes?: string;
      checked: boolean;
      addedAt: string;
      addedBy: number;
      addedByName?: string;
      position: number;
      householdId: string;
      createdAt: string;
      updatedAt: string;
    }>;
  }>(`/api/v1/households/${householdId}/grocery-list`);

  return jsonResult(data);
}

async function addItem(client: MynApiClient, input: ListsInput) {
  if (!input.item) {
    return errorResult('item is required for add action');
  }

  // Get household ID if not provided
  let householdId = input.householdId;
  if (!householdId) {
    const household = await client.get<{ id: string }>('/api/v1/households/current');
    if (!household?.id) {
      return errorResult('No household found. Please specify householdId.');
    }
    householdId = household.id;
  }

  const body: Record<string, unknown> = {
    name: input.item
  };

  if (input.category) body.category = input.category;
  if (input.quantity) body.quantity = input.quantity;
  if (input.notes) body.notes = input.notes;

  const data = await client.post<{
    success: boolean;
    item: {
      id: string;
      name: string;
      category?: string;
      quantity?: string;
      notes?: string;
      checked: boolean;
      addedAt: string;
      addedByName?: string;
    };
  }>(`/api/v1/households/${householdId}/grocery-list`, body);

  return jsonResult(data);
}

async function toggleItem(client: MynApiClient, input: ListsInput) {
  if (!input.itemId) {
    return errorResult('itemId is required for toggle action');
  }

  // Get household ID if not provided
  let householdId = input.householdId;
  if (!householdId) {
    const household = await client.get<{ id: string }>('/api/v1/households/current');
    if (!household?.id) {
      return errorResult('No household found. Please specify householdId.');
    }
    householdId = household.id;
  }

  const data = await client.patch<{
    success: boolean;
    item: {
      id: string;
      name: string;
      checked: boolean;
    };
    checked: boolean;
  }>(`/api/v1/households/${householdId}/grocery-list/${input.itemId}/toggle`, {});

  return jsonResult(data);
}

async function bulkAddItems(client: MynApiClient, input: ListsInput) {
  if (!input.items || input.items.length === 0) {
    return errorResult('items array is required for bulk_add action');
  }

  // Get household ID if not provided
  let householdId = input.householdId;
  if (!householdId) {
    const household = await client.get<{ id: string }>('/api/v1/households/current');
    if (!household?.id) {
      return errorResult('No household found. Please specify householdId.');
    }
    householdId = household.id;
  }

  // Build structured item entries with per-item category/quantity if provided
  const body: Record<string, unknown> = {
    items: input.items.map(item => ({
      name: item,
      ...(input.category && { category: input.category }),
      ...(input.quantity && { quantity: input.quantity })
    }))
  };

  const data = await client.post<{
    success: boolean;
    items: Array<{
      id: string;
      name: string;
      category?: string;
      quantity?: string;
      checked: boolean;
    }>;
    count: number;
  }>(`/api/v1/households/${householdId}/grocery-list/bulk`, body);

  return jsonResult(data);
}

async function convertToTasks(client: MynApiClient, input: ListsInput) {
  // Get household ID if not provided
  let householdId = input.householdId;
  if (!householdId) {
    const household = await client.get<{ id: string }>('/api/v1/households/current');
    if (!household?.id) {
      return errorResult('No household found. Please specify householdId.');
    }
    householdId = household.id;
  }

  const body: Record<string, unknown> = {
    uncheckedOnly: input.uncheckedOnly ?? true
  };

  if (input.priority) body.priority = input.priority;

  const data = await client.post<{
    success: boolean;
    tasks: Array<{
      id: string;
      title: string;
    }>;
    count: number;
  }>(`/api/v1/households/${householdId}/grocery-list/convert-to-tasks`, body);

  return jsonResult(data);
}

export function registerListsTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_lists',
    name: 'MYN Lists',
    description: 'Manage grocery and shopping lists. Actions: get, add, toggle, bulk_add, convert_to_tasks.',
    inputSchema: ListsInputSchema,
    async execute(input: unknown) {
      return executeLists(client, input as ListsInput);
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
