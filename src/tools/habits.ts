/**
 * myn_habits tool - Habit tracking, streaks, and reminders
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const HabitsInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('streaks'),
    Type.Literal('skip'),
    Type.Literal('chains'),
    Type.Literal('schedule'),
    Type.Literal('reminders')
  ]),
  // streaks parameters
  habitId: Type.Optional(Type.String({ format: 'uuid' })),
  includeHistory: Type.Optional(Type.Boolean({ default: false })),
  // skip parameters
  skipDate: Type.Optional(Type.String({ format: 'date' })),
  skipReason: Type.Optional(Type.String()),
  // chains parameters
  chainId: Type.Optional(Type.String({ format: 'uuid' })),
  // schedule parameters
  dateRange: Type.Optional(Type.Number({ default: 7, description: 'Number of days to look ahead' })),
  // reminders parameters
  enableReminders: Type.Optional(Type.Boolean()),
  reminderTime: Type.Optional(Type.String({ pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' }))
});

export type HabitsInput = typeof HabitsInputSchema.static;

export async function executeHabits(
  client: MynApiClient,
  input: HabitsInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'streaks':
        return await getStreaks(client, input);
      case 'skip':
        return await skipHabit(client, input);
      case 'chains':
        return await getChains(client, input);
      case 'schedule':
        return await getSchedule(client, input);
      case 'reminders':
        return await manageReminders(client, input);
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

async function getStreaks(client: MynApiClient, input: HabitsInput) {
  if (input.habitId) {
    // Get specific habit streak
    const data = await client.get<{
      habitId: string;
      currentStreak: number;
      longestStreak: number;
      totalCompletions: number;
      lastCompletedAt?: string;
      streakHistory?: Array<{
        date: string;
        completed: boolean;
      }>;
    }>(`/api/v1/habit-chains/${input.habitId}/streaks${input.includeHistory ? '?includeHistory=true' : ''}`);
    return jsonResult(data);
  }

  // Get all habit streaks
  const data = await client.get<{
    habits: Array<{
      habitId: string;
      title: string;
      currentStreak: number;
      longestStreak: number;
      totalCompletions: number;
      lastCompletedAt?: string;
    }>;
  }>('/api/v1/habit-chains/streaks');
  return jsonResult(data);
}

async function skipHabit(client: MynApiClient, input: HabitsInput) {
  if (!input.habitId) {
    return errorResult('habitId is required for skip action');
  }

  const body: Record<string, unknown> = {};
  if (input.skipDate) body.skipDate = input.skipDate;
  if (input.skipReason) body.reason = input.skipReason;

  const data = await client.post<{
    habitId: string;
    skippedDate: string;
    streakPreserved: boolean;
    newStreakCount: number;
  }>(`/api/v1/habit-chains/${input.habitId}/skip`, body);
  return jsonResult(data);
}

async function getChains(client: MynApiClient, input: HabitsInput) {
  if (input.chainId) {
    // Get specific chain details
    const data = await client.get<{
      chainId: string;
      name: string;
      habits: Array<{
        habitId: string;
        title: string;
        order: number;
      }>;
      trigger?: string;
      location?: string;
      totalCompletions: number;
    }>(`/api/v1/habit-chains/${input.chainId}`);
    return jsonResult(data);
  }

  // List all chains
  const data = await client.get<{
    chains: Array<{
      chainId: string;
      name: string;
      habitCount: number;
      totalCompletions: number;
      lastCompletedAt?: string;
    }>;
  }>('/api/v1/habit-chains');
  return jsonResult(data);
}

async function getSchedule(client: MynApiClient, input: HabitsInput) {
  const params = new URLSearchParams();
  if (input.dateRange) params.append('days', input.dateRange.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const data = await client.get<{
    schedule: Array<{
      date: string;
      dayOfWeek: number;
      habits: Array<{
        habitId: string;
        title: string;
        duration?: string;
        completed: boolean;
        chainName?: string;
      }>;
    }>;
    habitsDue: number;
  }>(`/api/v1/habit-chains/schedule${queryString}`);
  return jsonResult(data);
}

async function manageReminders(client: MynApiClient, input: HabitsInput) {
  if (input.habitId) {
    // Manage reminders for specific habit
    if (input.enableReminders === undefined && !input.reminderTime) {
      // Get current reminder settings
      const data = await client.get<{
        habitId: string;
        remindersEnabled: boolean;
        reminderTime?: string;
        reminderDays: number[];
      }>(`/api/habits/reminders/${input.habitId}`);
      return jsonResult(data);
    }

    // Update reminder settings
    const body: Record<string, unknown> = {};
    if (input.enableReminders !== undefined) body.enabled = input.enableReminders;
    if (input.reminderTime) body.time = input.reminderTime;

    const data = await client.put<{
      habitId: string;
      remindersEnabled: boolean;
      reminderTime?: string;
    }>(`/api/habits/reminders/${input.habitId}`, body);
    return jsonResult(data);
  }

  // List all habit reminders
  const data = await client.get<{
    reminders: Array<{
      habitId: string;
      title: string;
      enabled: boolean;
      reminderTime?: string;
      reminderDays: number[];
    }>;
  }>('/api/habits/reminders');
  return jsonResult(data);
}

export function registerHabitsTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_habits',
    name: 'MYN Habits',
    description: 'Track habits, streaks, and reminders. Actions: streaks, skip, chains, schedule, reminders.',
    inputSchema: HabitsInputSchema,
    async execute(input: unknown) {
      return executeHabits(client, input as HabitsInput);
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
