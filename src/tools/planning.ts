/**
 * myn_planning tool - AI planning and scheduling
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const PlanningInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('plan'),
    Type.Literal('schedule_all'),
    Type.Literal('reschedule')
  ]),
  // plan parameters
  goal: Type.Optional(Type.String({ description: 'What you want to accomplish' })),
  constraints: Type.Optional(Type.Object({
    availableHours: Type.Optional(Type.Number()),
    preferredTimes: Type.Optional(Type.Array(Type.String())),
    avoidTimes: Type.Optional(Type.Array(Type.String())),
    deadline: Type.Optional(Type.String({ format: 'date-time' })),
    priority: Type.Optional(Type.Union([
      Type.Literal('CRITICAL'),
      Type.Literal('OPPORTUNITY_NOW'),
      Type.Literal('OVER_THE_HORIZON')
    ]))
  })),
  tasks: Type.Optional(Type.Array(Type.Object({
    title: Type.String(),
    estimatedDuration: Type.Optional(Type.Number()), // in minutes
    dependsOn: Type.Optional(Type.Array(Type.String())),
    fixedTime: Type.Optional(Type.String({ format: 'date-time' }))
  }))),
  // schedule_all parameters
  date: Type.Optional(Type.String({ format: 'date' })),
  respectExisting: Type.Optional(Type.Boolean({ default: true })),
  bufferMinutes: Type.Optional(Type.Number({ default: 15 })),
  // reschedule parameters
  taskIds: Type.Optional(Type.Array(Type.String({ format: 'uuid' }))),
  reason: Type.Optional(Type.String()),
  targetDate: Type.Optional(Type.String({ format: 'date' })),
  spreadOverDays: Type.Optional(Type.Number({ default: 1 }))
});

export type PlanningInput = typeof PlanningInputSchema.static;

export async function executePlanning(
  client: MynApiClient,
  input: PlanningInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'plan':
        return await createPlan(client, input);
      case 'schedule_all':
        return await scheduleAll(client, input);
      case 'reschedule':
        return await reschedule(client, input);
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

async function createPlan(client: MynApiClient, input: PlanningInput) {
  if (!input.goal && (!input.tasks || input.tasks.length === 0)) {
    return errorResult('goal or tasks is required for plan action');
  }

  const body: Record<string, unknown> = {};

  if (input.goal) body.goal = input.goal;
  if (input.tasks) body.tasks = input.tasks;
  if (input.constraints) body.constraints = input.constraints;

  const data = await client.post<{
    planId: string;
    goal: string;
    estimatedDuration: number; // in minutes
    schedule: Array<{
      step: number;
      title: string;
      description?: string;
      estimatedMinutes: number;
      suggestedTimeSlot?: {
        start: string;
        end: string;
      };
      dependencies: string[];
    }>;
    conflicts: Array<{
      taskTitle: string;
      reason: string;
      suggestion: string;
    }>;
    suggestions: string[];
    createdAt: string;
  }>('/api/schedules/plan', body);

  return jsonResult(data);
}

async function scheduleAll(client: MynApiClient, input: PlanningInput) {
  const body: Record<string, unknown> = {};

  if (input.date) body.date = input.date;
  if (input.respectExisting !== undefined) body.respectExisting = input.respectExisting;
  if (input.bufferMinutes !== undefined) body.bufferMinutes = input.bufferMinutes;

  const data = await client.post<{
    date: string;
    scheduled: Array<{
      taskId: string;
      title: string;
      scheduledStart: string;
      scheduledEnd: string;
      priority: string;
    }>;
    unscheduled: Array<{
      taskId: string;
      title: string;
      reason: string;
    }>;
    conflicts: Array<{
      type: string;
      description: string;
      tasksInvolved: string[];
    }>;
    stats: {
      totalScheduled: number;
      totalMinutes: number;
      byPriority: Record<string, number>;
    };
  }>('/api/schedules/auto', body);

  return jsonResult(data);
}

async function reschedule(client: MynApiClient, input: PlanningInput) {
  if (!input.taskIds || input.taskIds.length === 0) {
    return errorResult('taskIds array is required for reschedule action');
  }

  const body: Record<string, unknown> = {
    taskIds: input.taskIds
  };

  if (input.reason) body.reason = input.reason;
  if (input.targetDate) body.targetDate = input.targetDate;
  if (input.spreadOverDays !== undefined) body.spreadOverDays = input.spreadOverDays;

  const data = await client.post<{
    rescheduled: Array<{
      taskId: string;
      title: string;
      oldDate: string;
      newDate: string;
    }>;
    failed: Array<{
      taskId: string;
      reason: string;
    }>;
    suggestions: string[];
  }>('/api/schedules/reschedule', body);

  return jsonResult(data);
}

export function registerPlanningTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_planning',
    name: 'MYN Planning',
    description: 'AI-powered planning and scheduling. Actions: plan, schedule_all, reschedule.',
    inputSchema: PlanningInputSchema,
    async execute(input: unknown) {
      return executePlanning(client, input as PlanningInput);
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
