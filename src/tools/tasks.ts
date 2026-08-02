/**
 * myn_tasks tool - Task CRUD, lifecycle, and search
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult, guardedPatch, guardedPost } from '../client.js';
import { validateUuid } from '../validation.js';
import { resolveCalendarId } from './calendar.js';

// Schema definitions
const PrioritySchema = Type.Union([
  Type.Literal('CRITICAL'),
  Type.Literal('OPPORTUNITY_NOW'),
  Type.Literal('OVER_THE_HORIZON'),
  Type.Literal('PARKING_LOT')
]);

const TaskTypeSchema = Type.Union([
  Type.Literal('TASK'),
  Type.Literal('HABIT'),
  Type.Literal('CHORE')
]);

const TaskStatusSchema = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('IN_PROGRESS'),
  Type.Literal('COMPLETED'),
  Type.Literal('ARCHIVED')
]);

export const TasksInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('list'),
    Type.Literal('get'),
    Type.Literal('create'),
    Type.Literal('update'),
    Type.Literal('complete'),
    Type.Literal('archive'),
    Type.Literal('search')
  ]),
  // List parameters
  status: Type.Optional(TaskStatusSchema),
  priority: Type.Optional(PrioritySchema),
  projectId: Type.Optional(Type.String()),
  startDate: Type.Optional(Type.String({ format: 'date' })),
  endDate: Type.Optional(Type.String({ format: 'date' })),
  limit: Type.Optional(Type.Number({ default: 20 })),
  offset: Type.Optional(Type.Number({ default: 0 })),
  // Get/Update/Complete/Archive parameters
  taskId: Type.Optional(Type.String({ format: 'uuid' })),
  // Create/Update parameters
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  taskType: Type.Optional(TaskTypeSchema),
  duration: Type.Optional(Type.String()), // "30m", "1h", "1h30m"
  // Create specific
  id: Type.Optional(Type.String({ format: 'uuid' })), // Auto-generated if omitted — do NOT hallucinate UUIDs
  recurrenceRule: Type.Optional(Type.String()), // For HABIT/CHORE types
  isAutoScheduled: Type.Optional(Type.Boolean({ description: 'Enable auto-scheduling by the planning system. Defaults to true — only set false if user explicitly opts out.' })),
  autoScheduleEnabled: Type.Optional(Type.Boolean({ description: 'DEPRECATED alias for isAutoScheduled. Prefer isAutoScheduled.' })),
  calendarId: Type.Optional(Type.String({ description: 'Calendar ID to link this task to (e.g. "primary" for default Google Calendar)' })),
  calendarName: Type.Optional(Type.String({ description: 'Calendar name to resolve (e.g. "Family", "Work"). Used instead of calendarId.' })),
  scheduleNames: Type.Optional(Type.Array(Type.String(), { description: 'Schedule names to assign (e.g. ["Morning"], ["Weekday Evening", "Weekend Morning"]). Resolved to IDs automatically.' })),
  // Update specific
  updates: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  // Search parameters
  query: Type.Optional(Type.String()),
  includeArchived: Type.Optional(Type.Boolean({ default: false }))
});

export type TasksInput = typeof TasksInputSchema.static;

export async function executeTasks(
  client: MynApiClient,
  input: TasksInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'list':
        return await listTasks(client, input);
      case 'get':
        return await getTask(client, input);
      case 'create':
        return await createTask(client, input);
      case 'update':
        return await updateTask(client, input);
      case 'complete':
        return await completeTask(client, input);
      case 'archive':
        return await archiveTask(client, input);
      case 'search':
        return await searchTasks(client, input);
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

async function listTasks(client: MynApiClient, input: TasksInput) {
  const params = new URLSearchParams();

  if (input.status) params.append('status', input.status);
  if (input.priority) params.append('priority', input.priority);
  if (input.projectId) params.append('projectId', input.projectId);
  if (input.startDate) params.append('startDate', input.startDate);
  if (input.endDate) params.append('endDate', input.endDate);
  params.append('limit', String(input.limit ?? 20));
  if (input.offset) params.append('offset', input.offset.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const data = await client.get<{
    tasks: unknown[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>(`/api/v2/unified-tasks${queryString}`);
  return jsonResult(data.tasks);
}

async function getTask(client: MynApiClient, input: TasksInput) {
  if (!input.taskId) {
    return errorResult('taskId is required for get action');
  }
  const uuidErr = validateUuid(input.taskId, 'taskId');
  if (uuidErr) return errorResult(uuidErr);
  const data = await client.get<unknown>(`/api/v2/unified-tasks/${input.taskId}`);
  return jsonResult(data);
}

async function createTask(client: MynApiClient, input: TasksInput) {
  if (!input.title) {
    return errorResult('title is required for create action');
  }
  if (!input.priority) {
    return errorResult('priority is required for create action (CRITICAL, OPPORTUNITY_NOW, OVER_THE_HORIZON, PARKING_LOT)');
  }
  if (!input.taskType) {
    return errorResult('taskType is required for create action (TASK, HABIT, CHORE)');
  }
  if (!input.startDate) {
    return errorResult('startDate is required for create action');
  }
  // Auto-generate UUID if the caller didn't provide one (LLMs hallucinate bad UUIDs)
  const taskId = input.id || crypto.randomUUID();

  const body: Record<string, unknown> = {
    id: taskId,
    title: input.title,
    taskType: input.taskType,
    priority: input.priority,
    startDate: input.startDate
  };

  if (input.description) body.description = input.description;
  if (input.duration) body.duration = input.duration;
  if (input.projectId) body.projectId = input.projectId;
  if (input.recurrenceRule) body.recurrenceRule = input.recurrenceRule;
  // Accept both field names — some models hallucinate "autoScheduleEnabled" instead of "isAutoScheduled"
  const autoSched = input.isAutoScheduled ?? (input as Record<string, unknown>).autoScheduleEnabled;
  // Default to auto-scheduled unless explicitly set to false
  body.isAutoScheduled = autoSched ?? true;

  // Resolve calendarName → calendarId if needed
  let effectiveCalendarId = input.calendarId;
  if (!effectiveCalendarId && input.calendarName) {
    effectiveCalendarId = await resolveCalendarId(client, input.calendarName) ?? undefined;
  }
  if (effectiveCalendarId) body.calendarId = effectiveCalendarId;

  // Resolve scheduleNames → scheduleIds
  if (input.scheduleNames && input.scheduleNames.length > 0) {
    const scheduleIds = await resolveScheduleNames(client, input.scheduleNames);
    if (scheduleIds.length > 0) body.scheduleIds = scheduleIds;
  }

  // Validation: HABIT and CHORE must have recurrenceRule
  if ((input.taskType === 'HABIT' || input.taskType === 'CHORE') && !input.recurrenceRule) {
    return errorResult(`${input.taskType} type requires recurrenceRule`);
  }

  const data = await client.post<unknown>('/api/v2/unified-tasks', body);
  return jsonResult(data);
}

/**
 * W2: Allowlist of safe fields for task updates.
 * Blocks sensitive fields like ownerId, householdId, createdBy, isLocked.
 */
const ALLOWED_UPDATE_FIELDS = new Set([
  'title', 'description', 'priority', 'status', 'startDate', 'endDate',
  'duration', 'projectId', 'recurrenceRule', 'isAutoScheduled', 'autoScheduleEnabled',
  'calendarId', 'location', 'notes', 'tags', 'estimatedMinutes', 'actualMinutes',
  'completedAt', 'archivedAt', 'taskType', 'assignedTo', 'scheduledAt', 'dueDate'
]);

async function updateTask(client: MynApiClient, input: TasksInput) {
  if (!input.taskId) {
    return errorResult('taskId is required for update action');
  }
  const uuidErr = validateUuid(input.taskId, 'taskId');
  if (uuidErr) return errorResult(uuidErr);
  if (!input.updates || Object.keys(input.updates).length === 0) {
    return errorResult('updates object is required for update action');
  }

  // W2: Filter updates to only allowed fields (mass assignment prevention)
  const filteredUpdates: Record<string, unknown> = {};
  const rejectedFields: string[] = [];
  for (const [key, value] of Object.entries(input.updates)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) {
      filteredUpdates[key] = value;
    } else {
      rejectedFields.push(key);
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return errorResult(
      `No valid update fields provided. Rejected fields: ${rejectedFields.join(', ')}. ` +
      `Allowed fields: ${Array.from(ALLOWED_UPDATE_FIELDS).join(', ')}`
    );
  }

  // MIN-740: read-before-write — automatically reads current stateHash, retries on 409
  const data = await guardedPatch<unknown>(
    client,
    `/api/v2/unified-tasks/${input.taskId}`,
    filteredUpdates,
    `/api/v2/unified-tasks/${input.taskId}`
  );
  return jsonResult(data);
}

async function completeTask(client: MynApiClient, input: TasksInput) {
  if (!input.taskId) {
    return errorResult('taskId is required for complete action');
  }
  const uuidErr = validateUuid(input.taskId, 'taskId');
  if (uuidErr) return errorResult(uuidErr);

  // MIN-740: read-before-write — reads task first to get stateHash
  const data = await guardedPost<unknown>(
    client,
    `/api/v2/unified-tasks/${input.taskId}/complete`,
    {},
    `/api/v2/unified-tasks/${input.taskId}`
  );
  return jsonResult(data);
}

async function archiveTask(client: MynApiClient, input: TasksInput) {
  if (!input.taskId) {
    return errorResult('taskId is required for archive action');
  }
  const uuidErr = validateUuid(input.taskId, 'taskId');
  if (uuidErr) return errorResult(uuidErr);

  // MIN-740: read-before-write — reads task first to get stateHash
  const data = await guardedPost<unknown>(
    client,
    `/api/v2/unified-tasks/${input.taskId}/archive`,
    {},
    `/api/v2/unified-tasks/${input.taskId}`
  );
  return jsonResult(data);
}

async function searchTasks(client: MynApiClient, input: TasksInput) {
  const params = new URLSearchParams();

  if (input.query) params.append('q', input.query);
  if (input.includeArchived) params.append('includeArchived', 'true');
  if (input.limit) params.append('limit', input.limit.toString());
  if (input.offset) params.append('offset', input.offset.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const data = await client.get<unknown[]>(`/api/v2/search${queryString}`);
  return jsonResult(data);
}

/**
 * Resolve schedule names to IDs by looking up the user's available schedules.
 */
async function resolveScheduleNames(client: MynApiClient, names: string[]): Promise<string[]> {
  try {
    const schedules = await client.get<Array<{ id: string; name: string }>>('/api/schedules');
    if (!schedules || !Array.isArray(schedules)) return [];

    const ids: string[] = [];
    for (const name of names) {
      const nameLower = name.toLowerCase().trim();
      // Exact match first, then contains
      const match = schedules.find(s => s.name?.toLowerCase() === nameLower)
        ?? schedules.find(s => s.name?.toLowerCase().includes(nameLower));
      if (match) ids.push(match.id);
    }
    return ids;
  } catch {
    return [];
  }
}

export function registerTasksTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_tasks',
    name: 'MYN Tasks',
    description: 'Manage tasks, habits, and chores. Actions: list, get, create, update, complete, archive, search. ' +
      'SCHEDULING: Tasks default to isAutoScheduled=true. Always assign scheduleNames based on when the task should happen ' +
      '(e.g. ["Morning"], ["Weekend Morning"], ["Weekday Evening"]). Use calendarName to link to a specific calendar (e.g. "Family"). ' +
      'CALENDAR EVENTS: When creating a task for a specific date/time event, also create a matching calendar event via myn_calendar.',
    inputSchema: TasksInputSchema,
    async execute(input: unknown) {
      return executeTasks(client, input as TasksInput);
    }
  });
}

// Type for OpenClaw plugin API (will be available from openclaw package)
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
