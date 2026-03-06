/**
 * myn_household tool - Members, invites, chores
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const HouseholdInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('members'),
    Type.Literal('invite'),
    Type.Literal('chores'),
    Type.Literal('chore_schedule'),
    Type.Literal('chore_complete')
  ]),
  // Common parameters
  householdId: Type.Optional(Type.String({ format: 'uuid' })),
  // invite parameters
  email: Type.Optional(Type.String({ format: 'email' })),
  role: Type.Optional(Type.Union([
    Type.Literal('member'),
    Type.Literal('admin')
  ])),
  message: Type.Optional(Type.String()),
  // chore_complete parameters
  choreId: Type.Optional(Type.String({ format: 'uuid' })),
  completedBy: Type.Optional(Type.String({ format: 'uuid' })),
  note: Type.Optional(Type.String()),
  // chore_schedule parameters
  date: Type.Optional(Type.String({ format: 'date' })),
  weekStart: Type.Optional(Type.String({ format: 'date' }))
});

export type HouseholdInput = typeof HouseholdInputSchema.static;

export async function executeHousehold(
  client: MynApiClient,
  input: HouseholdInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'members':
        return await getMembers(client, input);
      case 'invite':
        return await inviteMember(client, input);
      case 'chores':
        return await getChores(client, input);
      case 'chore_schedule':
        return await getChoreSchedule(client, input);
      case 'chore_complete':
        return await completeChore(client, input);
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

async function getHouseholdId(client: MynApiClient, providedId?: string): Promise<string | null> {
  if (providedId) return providedId;

  const household = await client.get<{ id: string }>('/api/v1/households/current');
  if (!household || !household.id) {
    return null;
  }
  return household.id;
}

async function getMembers(client: MynApiClient, input: HouseholdInput) {
  const householdId = await getHouseholdId(client, input.householdId);
  if (!householdId) {
    return errorResult('No household found. Please specify householdId.');
  }

  const data = await client.get<{
    householdId: string;
    members: Array<{
      id: string;
      name: string;
      email: string;
      role: 'owner' | 'admin' | 'member';
      joinedAt: string;
      avatarUrl?: string;
    }>;
    pendingInvites: Array<{
      inviteId: string;
      email: string;
      role: string;
      invitedAt: string;
      expiresAt: string;
    }>;
  }>(`/api/v1/households/${householdId}/members`);

  return jsonResult(data);
}

async function inviteMember(client: MynApiClient, input: HouseholdInput) {
  if (!input.email) {
    return errorResult('email is required for invite action');
  }

  const householdId = await getHouseholdId(client, input.householdId);
  if (!householdId) {
    return errorResult('No household found. Please specify householdId.');
  }

  const body: Record<string, unknown> = {
    email: input.email
  };

  if (input.role) body.role = input.role;
  if (input.message) body.message = input.message;

  const data = await client.post<{
    inviteId: string;
    invited: boolean;
    expiresAt: string;
  }>(`/api/v1/households/${householdId}/invites`, body);

  return jsonResult(data);
}

async function getChores(client: MynApiClient, input: HouseholdInput) {
  const householdId = await getHouseholdId(client, input.householdId);
  if (!householdId) {
    return errorResult('No household found. Please specify householdId.');
  }

  const data = await client.get<{
    householdId: string;
    chores: Array<{
      id: string;
      title: string;
      description?: string;
      recurrenceRule: string;
      assignedTo?: string;
      estimatedMinutes?: number;
      difficulty: 'easy' | 'medium' | 'hard';
      category?: string;
    }>;
  }>(`/api/v2/chores/today?householdId=${householdId}`);

  return jsonResult(data);
}

async function getChoreSchedule(client: MynApiClient, input: HouseholdInput) {
  const householdId = await getHouseholdId(client, input.householdId);
  if (!householdId) {
    return errorResult('No household found. Please specify householdId.');
  }

  const params = new URLSearchParams();
  params.append('householdId', householdId);

  // Default date range: today + 7 days if no specific dates provided
  const today = new Date().toISOString().split('T')[0];
  const startDate = input.date ?? input.weekStart ?? today;
  params.append('startDate', startDate);

  if (input.date) {
    // Single date: use same date as end
    params.append('endDate', input.date);
  } else {
    // Range: weekStart + 7 days, or default 7 days from today
    const end = new Date(startDate);
    end.setDate(end.getDate() + 7);
    params.append('endDate', end.toISOString().split('T')[0]);
  }

  const queryString = params.toString() ? `?${params.toString()}` : '';

  const data = await client.get<{
    schedule: Array<{
      date: string;
      dayOfWeek: number;
      chores: Array<{
        choreId: string;
        title: string;
        assignedTo?: string;
        estimatedMinutes?: number;
        completed: boolean;
        completedAt?: string;
        completedBy?: string;
      }>;
    }>;
    totalChores: number;
    completedChores: number;
  }>(`/api/v2/chores/schedule/range${queryString}`);

  return jsonResult(data);
}

async function completeChore(client: MynApiClient, input: HouseholdInput) {
  if (!input.choreId) {
    return errorResult('choreId is required for chore_complete action');
  }

  const body: Record<string, unknown> = {};

  if (input.completedBy) body.completedBy = input.completedBy;
  if (input.note) body.note = input.note;

  const data = await client.post<{
    choreId: string;
    completed: boolean;
    completedAt: string;
    nextDueDate?: string;
  }>(`/api/v2/chores/instances/${input.choreId}/complete`, body);

  return jsonResult(data);
}

export function registerHouseholdTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_household',
    name: 'MYN Household',
    description: 'Manage household members, invites, and chores. Actions: members, invite, chores, chore_schedule, chore_complete.',
    inputSchema: HouseholdInputSchema,
    async execute(input: unknown) {
      return executeHousehold(client, input as HouseholdInput);
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
