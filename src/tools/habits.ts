/**
 * myn_habits tool - Habit tracking, streaks, and reminders
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult, guardedPatch } from '../client.js';

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
  enableReminders: Type.Optional(Type.Boolean({
    description: "Set reminderEnabled on the habit's unified task entity."
  })),
  reminderTime: Type.Optional(Type.String({
    pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
    description: "Set reminderTime on the habit's unified task entity."
  }))
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
    }>(`/api/v2/unified-tasks/${input.habitId}/streak${input.includeHistory ? '?includeHistory=true' : ''}`);
    return jsonResult(data);
  }

  // No bulk streaks endpoint — use schedule to see all habits
  return errorResult('habitId is required for streaks action. Use the schedule action to see all habits.');
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
  }>(`/api/v2/unified-tasks/${input.habitId}/skip`, body);
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
    }>(`/api/habits/chains/${input.chainId}/status`);
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
  }>('/api/habits/chains');
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
  }>(`/api/v2/unified-tasks/schedule${queryString}`);
  return jsonResult(data);
}

async function manageReminders(client: MynApiClient, input: HabitsInput) {
  if (input.habitId) {
    const path = `/api/v2/unified-tasks/${input.habitId}`;
    if (input.enableReminders !== undefined || input.reminderTime !== undefined) {
      const updates: Record<string, unknown> = {};
      if (input.enableReminders !== undefined) updates.reminderEnabled = input.enableReminders;
      if (input.reminderTime !== undefined) updates.reminderTime = input.reminderTime;

      const data = await guardedPatch<unknown>(client, path, updates, path);
      return jsonResult(data);
    }

    const task = await client.get<{
      reminderEnabled?: boolean;
      reminderTime?: string;
    }>(path);
    return jsonResult({
      habitId: input.habitId,
      reminderEnabled: Boolean(task.reminderEnabled),
      reminderTime: task.reminderTime
    });
  }

  const data = await client.get<Array<{
    id: string;
    title?: string;
    taskType?: string;
    reminderEnabled?: boolean;
    reminderTime?: string;
  }> | {
    tasks: Array<{
      id: string;
      title?: string;
      taskType?: string;
      reminderEnabled?: boolean;
      reminderTime?: string;
    }>;
  }>('/api/v2/unified-tasks?type=HABIT');
  const tasks = Array.isArray(data) ? data : data.tasks;
  const reminders = tasks
    .filter(task => task.taskType === 'HABIT' && task.reminderEnabled)
    .map(task => ({
      habitId: task.id,
      title: task.title,
      reminderTime: task.reminderTime
    }));
  return jsonResult({ reminders });
}

export function registerHabitsTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_habits',
    name: 'MYN Habits',
    description: 'Track habits, streaks, and reminders. Actions: streaks, skip, chains, schedule, reminders. ' +
      "Reminder settings live on the habit's unified task entity.",
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
