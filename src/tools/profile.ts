/**
 * myn_profile tool - User info, goals, and preferences
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const ProfileInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('get_info'),
    Type.Literal('get_goals'),
    Type.Literal('update_goals'),
    Type.Literal('preferences')
  ]),
  // update_goals parameters
  goals: Type.Optional(Type.Array(Type.Object({
    id: Type.Optional(Type.String()),
    title: Type.String(),
    description: Type.Optional(Type.String()),
    targetDate: Type.Optional(Type.String({ format: 'date' })),
    priority: Type.Optional(Type.Union([
      Type.Literal('low'),
      Type.Literal('medium'),
      Type.Literal('high')
    ])),
    status: Type.Optional(Type.Union([
      Type.Literal('active'),
      Type.Literal('completed'),
      Type.Literal('paused'),
      Type.Literal('abandoned')
    ]))
  }))),
  goalId: Type.Optional(Type.String()),
  // preferences parameters
  preferenceKey: Type.Optional(Type.String()),
  preferenceValue: Type.Optional(Type.Unknown()),
  preferenceCategory: Type.Optional(Type.Union([
    Type.Literal('notifications'),
    Type.Literal('display'),
    Type.Literal('ai'),
    Type.Literal('privacy'),
    Type.Literal('integrations')
  ]))
});

export type ProfileInput = typeof ProfileInputSchema.static;

export async function executeProfile(
  client: MynApiClient,
  input: ProfileInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'get_info':
        return await getInfo(client);
      case 'get_goals':
        return await getGoals(client);
      case 'update_goals':
        return await updateGoals(client, input);
      case 'preferences':
        return await managePreferences(client, input);
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

async function getInfo(client: MynApiClient) {
  const data = await client.get<{
    id: string;
    email: string;
    name: string;
    timezone: string;
    language: string;
    createdAt: string;
    households: Array<{
      id: string;
      name: string;
      role: 'owner' | 'member';
    }>;
    subscription: {
      tier: string;
      expiresAt?: string;
    };
    stats: {
      totalTasksCompleted: number;
      currentStreak: number;
      longestStreak: number;
    };
  }>('/api/v1/customers/me');

  return jsonResult(data);
}

async function getGoals(client: MynApiClient) {
  const data = await client.get<{
    goals: Array<{
      id: string;
      title: string;
      description?: string;
      targetDate?: string;
      priority: 'low' | 'medium' | 'high';
      status: 'active' | 'completed' | 'paused' | 'abandoned';
      progress: number;
      createdAt: string;
      updatedAt: string;
      relatedTasks?: string[];
    }>;
    activeCount: number;
    completedCount: number;
  }>('/api/v1/customers/goals');

  return jsonResult(data);
}

async function updateGoals(client: MynApiClient, input: ProfileInput) {
  if (input.goalId) {
    // Update specific goal
    if (!input.goals || input.goals.length === 0) {
      return errorResult('goals array is required when goalId is provided for update_goals action');
    }

    const goal = input.goals[0];
    const body: Record<string, unknown> = {};

    if (goal.title) body.title = goal.title;
    if (goal.description !== undefined) body.description = goal.description;
    if (goal.targetDate) body.targetDate = goal.targetDate;
    if (goal.priority) body.priority = goal.priority;
    if (goal.status) body.status = goal.status;

    const data = await client.put<{
      goalId: string;
      updated: boolean;
    }>(`/api/v1/customers/goals/${input.goalId}`, body);

    return jsonResult(data);
  }

  // Create new goals
  if (!input.goals || input.goals.length === 0) {
    return errorResult('goals array is required for update_goals action');
  }

  const data = await client.post<{
    created: Array<{
      goalId: string;
      title: string;
    }>;
  }>('/api/v1/customers/goals', { goals: input.goals });

  return jsonResult(data);
}

async function managePreferences(client: MynApiClient, input: ProfileInput) {
  if (input.preferenceKey !== undefined) {
    // Set or get specific preference
    if (input.preferenceValue !== undefined) {
      // Set preference
      const body: Record<string, unknown> = {
        key: input.preferenceKey,
        value: input.preferenceValue
      };

      if (input.preferenceCategory) body.category = input.preferenceCategory;

      const data = await client.put<{
        key: string;
        updated: boolean;
      }>('/api/v1/customers/preferences', body);

      return jsonResult(data);
    }

    // Get specific preference
    const data = await client.get<{
      key: string;
      value: unknown;
      category: string;
      updatedAt: string;
    }>(`/api/v1/customers/preferences/${input.preferenceKey}`);

    return jsonResult(data);
  }

  // Get all preferences
  const params = new URLSearchParams();
  if (input.preferenceCategory) params.append('category', input.preferenceCategory);

  const queryString = params.toString() ? `?${params.toString()}` : '';

  const data = await client.get<{
    preferences: Record<string, unknown>;
    categories: string[];
  }>(`/api/v1/customers/preferences${queryString}`);

  return jsonResult(data);
}

export function registerProfileTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_profile',
    name: 'MYN Profile',
    description: 'Manage user profile, goals, and preferences. Actions: get_info, get_goals, update_goals, preferences.',
    inputSchema: ProfileInputSchema,
    async execute(input: unknown) {
      return executeProfile(client, input as ProfileInput);
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
