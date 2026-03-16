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

async function createPlan(client: MynApiClient, _input: PlanningInput) {
  // Triggers the AI planning engine to plan/schedule tasks for the current user.
  // The backend PlanningController at GET /planning/plan handles this automatically
  // based on the authenticated user's tasks — no request body is needed.
  const data = await client.get<string>('/planning/plan');

  return jsonResult({ result: data });
}

async function scheduleAll(client: MynApiClient, _input: PlanningInput) {
  // Auto-schedules all eligible tasks (today or past start date, not completed,
  // not OVER_THE_HORIZON/PARKING_LOT) for the authenticated user, then triggers planning.
  // MIN-740: Changed from GET to POST (read-before-write refactor).
  const data = await client.post<string>('/planning/scheduleAll', {});

  return jsonResult({ result: data });
}

async function reschedule(client: MynApiClient, input: PlanningInput) {
  // "Kick the can" — reschedules overdue/today tasks into the future based on priority.
  // Optionally pass rebalance=true to redistribute all uncompleted tasks evenly.
  // MIN-740: Changed from GET to POST (read-before-write refactor).
  const rebalance = input.spreadOverDays && input.spreadOverDays > 1 ? 'true' : 'false';
  const data = await client.post<unknown>(`/planning/kickTheCan?rebalance=${rebalance}`, {});

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
