/**
 * myn_tasks tool - Task CRUD, lifecycle, and search
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

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

  // Validation: HABIT and CHORE must have recurrenceRule
  if ((input.taskType === 'HABIT' || input.taskType === 'CHORE') && !input.recurrenceRule) {
    return errorResult(`${input.taskType} type requires recurrenceRule`);
  }

  const data = await client.post<unknown>('/api/v2/unified-tasks', body);
  return jsonResult(data);
}

async function updateTask(client: MynApiClient, input: TasksInput) {
  if (!input.taskId) {
    return errorResult('taskId is required for update action');
  }
  if (!input.updates || Object.keys(input.updates).length === 0) {
    return errorResult('updates object is required for update action');
  }

  const data = await client.patch<unknown>(`/api/v2/unified-tasks/${input.taskId}`, input.updates);
  return jsonResult(data);
}

async function completeTask(client: MynApiClient, input: TasksInput) {
  if (!input.taskId) {
    return errorResult('taskId is required for complete action');
  }

  const data = await client.post<unknown>(`/api/v2/unified-tasks/${input.taskId}/complete`, {});
  return jsonResult(data);
}

async function archiveTask(client: MynApiClient, input: TasksInput) {
  if (!input.taskId) {
    return errorResult('taskId is required for archive action');
  }

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
