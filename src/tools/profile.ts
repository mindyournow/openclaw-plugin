/**
 * myn_profile tool - User info, goals, and preferences
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult, guardedPut } from '../client.js';

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
  }>('/api/v1/customers');

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
  if (!input.goals || input.goals.length === 0) {
    return errorResult('goals array is required for update_goals action');
  }

  // Format goals as markdown — the backend stores goals as a single text field
  const markdown = input.goals.map(g => {
    let line = `- **${g.title}**`;
    if (g.status) line += ` [${g.status}]`;
    if (g.priority) line += ` (${g.priority} priority)`;
    if (g.description) line += `\n  ${g.description}`;
    if (g.targetDate) line += `\n  Target: ${g.targetDate}`;
    return line;
  }).join('\n');

  // MIN-740: read-before-write — reads goals first to get stateHash, retries on 409
  const data = await guardedPut<{
    status: string;
    message: string;
  }>(client, '/api/v1/customers/goals', { goalsAndAmbitions: markdown }, '/api/v1/customers/goals');

  return jsonResult(data);
}

// Maps preferenceKey to the actual API endpoint path
const PREFERENCE_ENDPOINTS: Record<string, string> = {
  'notification-preferences': '/api/v1/customers/notification-preferences',
  'coaching-intensity': '/api/v1/customers/coaching-intensity',
  'theme-preference': '/api/v1/customers/theme-preference',
};

async function managePreferences(client: MynApiClient, input: ProfileInput) {
  if (input.preferenceKey !== undefined) {
    const endpoint = PREFERENCE_ENDPOINTS[input.preferenceKey];
    if (!endpoint) {
      return errorResult(
        `Unknown preferenceKey: ${input.preferenceKey}. Valid keys: ${Object.keys(PREFERENCE_ENDPOINTS).join(', ')}`
      );
    }

    if (input.preferenceValue !== undefined) {
      // Update preference
      const data = await client.put<unknown>(endpoint, input.preferenceValue);
      return jsonResult(data);
    }

    // Get preference
    const data = await client.get<unknown>(endpoint);
    return jsonResult(data);
  }

  // No preferenceKey — return all preferences by fetching each endpoint
  const results: Record<string, unknown> = {};
  for (const [key, endpoint] of Object.entries(PREFERENCE_ENDPOINTS)) {
    try {
      results[key] = await client.get<unknown>(endpoint);
    } catch {
      results[key] = null;
    }
  }

  return jsonResult({ preferences: results });
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
