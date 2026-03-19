/**
 * myn_tasks tool - Task CRUD, lifecycle, and search
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';
import { validateUuid } from '../validation.js';

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
  id: Type.Optional(Type.String({ format: 'uuid' })), // Client-generated UUID
  recurrenceRule: Type.Optional(Type.String()), // For HABIT/CHORE types
  isAutoScheduled: Type.Optional(Type.Boolean({ description: 'Enable auto-scheduling by the planning system. Use this field name, NOT autoScheduleEnabled.' })),
  autoScheduleEnabled: Type.Optional(Type.Boolean({ description: 'DEPRECATED alias for isAutoScheduled. Prefer isAutoScheduled.' })),
  calendarId: Type.Optional(Type.String({ description: 'Calendar ID to link this task to (e.g. "primary" for default Google Calendar)' })),
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
  if (input.limit) params.append('limit', input.limit.toString());
  if (input.offset) params.append('offset', input.offset.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const data = await client.get<unknown[]>(`/api/v2/unified-tasks${queryString}`);
  return jsonResult(data);
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
  if (!input.id) {
    return errorResult('id (client-generated UUID) is required for create action');
  }

  const body: Record<string, unknown> = {
    id: input.id,
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
  if (autoSched != null) body.isAutoScheduled = autoSched;
  if (input.calendarId) body.calendarId = input.calendarId;

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

  // Filter updates to only allowed fields
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

  const data = await client.patch<unknown>(`/api/v2/unified-tasks/${input.taskId}`, filteredUpdates);
  return jsonResult(data);
}

async function completeTask(client: MynApiClient, input: TasksInput) {
  if (!input.taskId) {
    return errorResult('taskId is required for complete action');
  }
  const uuidErr = validateUuid(input.taskId, 'taskId');
  if (uuidErr) return errorResult(uuidErr);

  const data = await client.post<unknown>(`/api/v2/unified-tasks/${input.taskId}/complete`, {});
  return jsonResult(data);
}

async function archiveTask(client: MynApiClient, input: TasksInput) {
  if (!input.taskId) {
    return errorResult('taskId is required for archive action');
  }
  const uuidErr = validateUuid(input.taskId, 'taskId');
  if (uuidErr) return errorResult(uuidErr);

  const data = await client.post<unknown>(`/api/v2/unified-tasks/${input.taskId}/archive`, {});
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

export function registerTasksTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_tasks',
    name: 'MYN Tasks',
    description: 'Manage tasks, habits, and chores. Actions: list, get, create, update, complete, archive, search.',
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
