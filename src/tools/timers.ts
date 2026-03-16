/**
 * myn_timers tool - Countdown, alarm, and pomodoro timers
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult, guardedPost } from '../client.js';

export const TimersInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('create_countdown'),
    Type.Literal('create_alarm'),
    Type.Literal('list'),
    Type.Literal('cancel'),
    Type.Literal('snooze'),
    Type.Literal('pomodoro')
  ]),
  // create_countdown parameters
  duration: Type.Optional(Type.Number({ description: 'Duration in seconds' })),
  durationMinutes: Type.Optional(Type.Number({ description: 'Duration in minutes' })),
  label: Type.Optional(Type.String({ description: 'Timer label/description' })),
  // create_alarm parameters
  alarmTime: Type.Optional(Type.String({ format: 'date-time', description: 'ISO 8601 datetime for alarm' })),
  recurrence: Type.Optional(Type.String({ description: 'Recurrence pattern (e.g., "daily", "weekdays")' })),
  sound: Type.Optional(Type.String()),
  // cancel/snooze parameters
  timerId: Type.Optional(Type.String({ format: 'uuid' })),
  // snooze parameters
  snoozeMinutes: Type.Optional(Type.Number({ default: 5 })),
  // pomodoro parameters
  workDuration: Type.Optional(Type.Number({ default: 25, description: 'Work duration in minutes' })),
  breakDuration: Type.Optional(Type.Number({ default: 5, description: 'Break duration in minutes' })),
  longBreakDuration: Type.Optional(Type.Number({ default: 15, description: 'Long break duration in minutes' })),
  sessions: Type.Optional(Type.Number({ default: 4, description: 'Number of pomodoro sessions' })),
  autoStart: Type.Optional(Type.Boolean({ default: false }))
});

export type TimersInput = typeof TimersInputSchema.static;

export async function executeTimers(
  client: MynApiClient,
  input: TimersInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'create_countdown':
        return await createCountdown(client, input);
      case 'create_alarm':
        return await createAlarm(client, input);
      case 'list':
        return await listTimers(client);
      case 'cancel':
        return await cancelTimer(client, input);
      case 'snooze':
        return await snoozeTimer(client, input);
      case 'pomodoro':
        return await createPomodoro(client, input);
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

async function createCountdown(client: MynApiClient, input: TimersInput) {
  let durationSeconds = input.duration;

  if (!durationSeconds && input.durationMinutes) {
    durationSeconds = input.durationMinutes * 60;
  }

  if (!durationSeconds) {
    return errorResult('duration (seconds) or durationMinutes is required for create_countdown action');
  }

  const body: Record<string, unknown> = {
    type: 'COUNTDOWN',
    duration: durationSeconds
  };

  if (input.label) body.label = input.label;

  const data = await client.post<{
    timerId: string;
    type: 'COUNTDOWN';
    duration: number;
    endTime: string;
    label?: string;
    status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  }>('/api/v2/timers/countdown', body);

  return jsonResult(data);
}

async function createAlarm(client: MynApiClient, input: TimersInput) {
  if (!input.alarmTime) {
    return errorResult('alarmTime is required for create_alarm action');
  }

  const body: Record<string, unknown> = {
    name: input.label ?? 'Alarm',
    alarmTime: input.alarmTime
  };

  if (input.recurrence) body.recurrence = input.recurrence;
  if (input.sound) body.completionSound = input.sound;

  const data = await client.post<{
    timerId: string;
    type: 'ALARM';
    alarmTime: string;
    label?: string;
    recurrence?: string;
    status: 'ACTIVE' | 'TRIGGERED' | 'SNOOZED';
  }>('/api/v2/timers/alarm', body);

  return jsonResult(data);
}

async function listTimers(client: MynApiClient) {
  const data = await client.get<{
    timers: Array<{
      timerId: string;
      type: 'COUNTDOWN' | 'ALARM' | 'POMODORO';
      label?: string;
      status: string;
      // For countdowns
      duration?: number;
      remaining?: number;
      endTime?: string;
      // For alarms
      alarmTime?: string;
      recurrence?: string;
      // For pomodoros
      currentSession?: number;
      totalSessions?: number;
      isWorkPhase?: boolean;
    }>;
    activeCount: number;
  }>('/api/v2/timers');

  return jsonResult(data);
}

async function cancelTimer(client: MynApiClient, input: TimersInput) {
  if (!input.timerId) {
    return errorResult('timerId is required for cancel action');
  }

  // MIN-740: guardedPost reads state hash from timer before cancelling
  const data = await guardedPost<{
    timerId: string;
    status: string;
  }>(client, `/api/v2/timers/${input.timerId}/cancel`, undefined, `/api/v2/timers/${input.timerId}`);

  return jsonResult(data);
}

async function snoozeTimer(client: MynApiClient, input: TimersInput) {
  if (!input.timerId) {
    return errorResult('timerId is required for snooze action');
  }

  const body: Record<string, unknown> = {
    snoozeMinutes: input.snoozeMinutes ?? 5
  };

  // MIN-740: guardedPost reads state hash from timer before snoozing
  const data = await guardedPost<{
    timerId: string;
    snoozedUntil: string;
    status: 'SNOOZED';
  }>(client, `/api/v2/timers/${input.timerId}/snooze`, body, `/api/v2/timers/${input.timerId}`);

  return jsonResult(data);
}

async function createPomodoro(client: MynApiClient, input: TimersInput) {
  const body: Record<string, unknown> = {
    type: 'POMODORO',
    workDuration: (input.workDuration ?? 25) * 60, // Convert to seconds
    breakDuration: (input.breakDuration ?? 5) * 60,
    longBreakDuration: (input.longBreakDuration ?? 15) * 60,
    sessions: input.sessions ?? 4,
    autoStart: input.autoStart ?? false
  };

  if (input.label) body.label = input.label;

  const data = await client.post<{
    timerId: string;
    type: 'POMODORO';
    label?: string;
    sessions: number;
    currentSession: number;
    isWorkPhase: boolean;
    workDuration: number;
    breakDuration: number;
    longBreakDuration: number;
    status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
    nextTransitionAt?: string;
  }>('/api/v2/timers/countdown', body);

  return jsonResult(data);
}

export function registerTimersTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_timers',
    name: 'MYN Timers',
    description: 'Manage countdowns, alarms, and pomodoro timers. Actions: create_countdown, create_alarm, list, cancel, snooze, pomodoro.',
    inputSchema: TimersInputSchema,
    async execute(input: unknown) {
      return executeTimers(client, input as TimersInput);
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
