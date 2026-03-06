/**
 * myn_projects tool - Project/category management
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const ProjectsInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('list'),
    Type.Literal('get'),
    Type.Literal('create'),
    Type.Literal('move_task')
  ]),
  // get parameters
  projectId: Type.Optional(Type.String({ format: 'uuid' })),
  // create parameters
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  color: Type.Optional(Type.String({ pattern: '^#[0-9A-Fa-f]{6}$' })),
  icon: Type.Optional(Type.String()),
  parentProjectId: Type.Optional(Type.String({ format: 'uuid' })),
  // move_task parameters
  taskId: Type.Optional(Type.String({ format: 'uuid' })),
  targetProjectId: Type.Optional(Type.String({ format: 'uuid' })),
  // list parameters
  includeArchived: Type.Optional(Type.Boolean({ default: false })),
  includeStats: Type.Optional(Type.Boolean({ default: true }))
});

export type ProjectsInput = typeof ProjectsInputSchema.static;

export async function executeProjects(
  client: MynApiClient,
  input: ProjectsInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'list':
        return await listProjects(client, input);
      case 'get':
        return await getProject(client, input);
      case 'create':
        return await createProject(client, input);
      case 'move_task':
        return await moveTask(client, input);
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

async function listProjects(client: MynApiClient, input: ProjectsInput) {
  const params = new URLSearchParams();

  if (input.includeArchived) params.append('includeArchived', 'true');
  if (input.includeStats) params.append('includeStats', 'true');

  const queryString = params.toString() ? `?${params.toString()}` : '';

  const data = await client.get<{
    projects: Array<{
      id: string;
      name: string;
      description?: string;
      color?: string;
      icon?: string;
      parentId?: string;
      createdAt: string;
      stats?: {
        totalTasks: number;
        completedTasks: number;
        criticalTasks: number;
      };
    }>;
  }>(`/api/project/defaults${queryString}`);

  return jsonResult(data);
}

async function getProject(client: MynApiClient, input: ProjectsInput) {
  if (!input.projectId) {
    return errorResult('projectId is required for get action');
  }

  const data = await client.get<{
    id: string;
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    parentId?: string;
    createdAt: string;
    tasks: Array<{
      id: string;
      title: string;
      priority: string;
      status: string;
      startDate: string;
    }>;
    subProjects: Array<{
      id: string;
      name: string;
      taskCount: number;
    }>;
  }>(`/api/project/${input.projectId}`);

  return jsonResult(data);
}

async function createProject(client: MynApiClient, input: ProjectsInput) {
  if (!input.name) {
    return errorResult('name is required for create action');
  }

  const body: Record<string, unknown> = {
    name: input.name
  };

  if (input.description) body.description = input.description;
  if (input.color) body.color = input.color;
  if (input.icon) body.icon = input.icon;
  if (input.parentProjectId) body.parentId = input.parentProjectId;

  const data = await client.post<{
    id: string;
    name: string;
    created: boolean;
  }>('/api/project/create', body);

  return jsonResult(data);
}

async function moveTask(client: MynApiClient, input: ProjectsInput) {
  if (!input.taskId) {
    return errorResult('taskId is required for move_task action');
  }

  if (!input.targetProjectId) {
    return errorResult('targetProjectId is required for move_task action');
  }

  const data = await client.put<{
    taskId: string;
    previousProjectId?: string;
    newProjectId: string;
    moved: boolean;
  }>(`/api/project/${input.targetProjectId}/moveTaskToProject/${input.taskId}`);

  return jsonResult(data);
}

export function registerProjectsTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_projects',
    name: 'MYN Projects',
    description: 'Manage projects and categories. Actions: list, get, create, move_task.',
    inputSchema: ProjectsInputSchema,
    async execute(input: unknown) {
      return executeProjects(client, input as ProjectsInput);
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
