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

interface HabitReminderTask {
  id: string;
  title?: string;
  taskType?: string;
  reminderEnabled?: boolean;
  reminderTime?: string;
}

function validateHabitTask(task: unknown): void {
  if (
    typeof task !== 'object' ||
    task === null ||
    (task as { taskType?: unknown }).taskType !== 'HABIT'
  ) {
    throw new Error('habitId must reference a HABIT');
  }
}

async function getReminderPage(client: MynApiClient, page: number, pageSize: number) {
  const data = await client.get<HabitReminderTask[] | { tasks: HabitReminderTask[] }>(
    `/api/v2/unified-tasks?type=HABIT&page=${page}&size=${pageSize}`
  );
  const tasks = Array.isArray(data) ? data : data.tasks;
  if (!Array.isArray(tasks)) {
    throw new Error('Unified-task pagination returned an unexpected response shape');
  }
  if (tasks.some(task => typeof task.id !== 'string' || task.id.length === 0)) {
    throw new Error('Unified-task pagination returned a task without an ID');
  }
  return tasks;
}

async function listHabitReminders(client: MynApiClient) {
  const pageSize = 200;
  const maxPages = 100;
  const maxRecords = pageSize * maxPages;
  const tasksById = new Map<string, HabitReminderTask>();
  const seenPageSignatures = new Set<string>();
  let firstPageSignature: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const pageTasks = await getReminderPage(client, page, pageSize);
    const signature = JSON.stringify(pageTasks.map(task => task.id));
    if (page === 0) firstPageSignature = signature;
    if (seenPageSignatures.has(signature)) {
      throw new Error('Unified-task pagination did not advance');
    }
    seenPageSignatures.add(signature);

    const newIds = pageTasks.filter(task => !tasksById.has(task.id));
    if (pageTasks.length === pageSize && newIds.length === 0) {
      throw new Error('Unified-task pagination did not advance');
    }
    if (tasksById.size + newIds.length > maxRecords) {
      throw new Error(`Unified-task pagination exceeded the ${maxRecords}-record safety limit`);
    }
    for (const task of pageTasks) tasksById.set(task.id, task);

    if (pageTasks.length < pageSize) {
      if (page > 0) {
        const checkPage = await getReminderPage(client, 0, pageSize);
        const checkSignature = JSON.stringify(checkPage.map(task => task.id));
        if (checkSignature !== firstPageSignature) {
          throw new Error('Unified-task collection changed during pagination');
        }
      }
      return Array.from(tasksById.values())
        .filter(task => task.taskType === 'HABIT' && task.reminderEnabled)
        .map(task => ({
          habitId: task.id,
          title: task.title,
          reminderTime: task.reminderTime
        }));
    }
  }

  throw new Error(`Unified-task pagination exceeded the ${maxPages}-page safety limit`);
}

async function manageReminders(client: MynApiClient, input: HabitsInput) {
  if (input.habitId) {
    const path = `/api/v2/unified-tasks/${input.habitId}`;
    if (input.enableReminders !== undefined || input.reminderTime !== undefined) {
      const updates: Record<string, unknown> = {};
      if (input.enableReminders !== undefined) updates.reminderEnabled = input.enableReminders;
      if (input.reminderTime !== undefined) updates.reminderTime = input.reminderTime;

      const data = await guardedPatch<unknown>(client, path, updates, path, validateHabitTask);
      return jsonResult(data);
    }

    const task = await client.get<HabitReminderTask>(path);
    validateHabitTask(task);
    return jsonResult({
      habitId: input.habitId,
      reminderEnabled: Boolean(task.reminderEnabled),
      reminderTime: task.reminderTime
    });
  }

  return jsonResult({ reminders: await listHabitReminders(client) });
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
