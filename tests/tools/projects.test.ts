import { Value } from '@sinclair/typebox/value';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MynApiClient } from '../../src/client.js';
import {
  executeProjects,
  ProjectsInputSchema,
  registerProjectsTool
} from '../../src/tools/projects.js';

const DESCRIPTION = 'Browse MYN collections (called "projects" in the API) and file tasks into them. MYN has a fixed set of collections — PERSONAL, WORK, GROCERIES, BOOKS, CHORES, and so on. They cannot be created, renamed, or deleted; use move_task to change which collection a task belongs to. Actions: list, get, move_task.';
const REMOVED_FIELDS = [
  'name',
  'description',
  'color',
  'icon',
  'parentProjectId',
  'includeArchived',
  'includeStats'
];

describe('myn_projects', () => {
  const mockFetch = vi.fn();
  let client: MynApiClient;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    client = new MynApiClient('https://api.mindyournow.com', 'test-key');
    mockFetch.mockClear();
  });

  it('lists compact project summaries with a requested limit', async () => {
    const projects = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'ALL',
        customName: 'All tasks',
        customEmoji: '📁',
        displayName: 'All tasks',
        taskCount: 7
      }
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        projects,
        total: 1,
        limit: 25,
        offset: 0,
        hasMore: false
      })
    });

    const result = await executeProjects(client, {
      action: 'list',
      limit: 25
    });

    expect(result).toEqual({ success: true, data: projects });
    expect(mockFetch.mock.calls[0][0]).toContain('limit=25');
  });

  it('reads the task state hash before moving it', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: '22222222-2222-4222-8222-222222222222',
          stateHash: 'task-hash-v1'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          taskId: '22222222-2222-4222-8222-222222222222',
          newProjectId: '11111111-1111-4111-8111-111111111111',
          moved: true
        })
      });

    const result = await executeProjects(client, {
      action: 'move_task',
      taskId: '22222222-2222-4222-8222-222222222222',
      targetProjectId: '11111111-1111-4111-8111-111111111111'
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.mindyournow.com/api/v2/unified-tasks/22222222-2222-4222-8222-222222222222'
    );
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://api.mindyournow.com/api/project/11111111-1111-4111-8111-111111111111/moveTaskToProject/22222222-2222-4222-8222-222222222222'
    );
    expect(mockFetch.mock.calls[1][1]).toMatchObject({
      method: 'PUT',
      headers: expect.objectContaining({
        'X-MYN-State-Hash': 'task-hash-v1'
      })
    });
    expect(result).toEqual({
      success: true,
      data: {
        taskId: '22222222-2222-4222-8222-222222222222',
        newProjectId: '11111111-1111-4111-8111-111111111111',
        moved: true
      }
    });
  });

  it('accepts exactly list, get, and move_task actions', () => {
    expect(Value.Check(ProjectsInputSchema, { action: 'list' })).toBe(true);
    expect(Value.Check(ProjectsInputSchema, { action: 'get' })).toBe(true);
    expect(Value.Check(ProjectsInputSchema, { action: 'move_task' })).toBe(true);
    expect(Value.Check(ProjectsInputSchema, { action: 'create' })).toBe(false);
  });

  it('omits unsupported project fields from the schema', () => {
    const fields = Object.keys(ProjectsInputSchema.properties);

    for (const field of REMOVED_FIELDS) {
      expect(fields).not.toContain(field);
    }
    expect(fields).toEqual([
      'action',
      'projectId',
      'taskId',
      'targetProjectId',
      'limit'
    ]);
  });

  it('rejects create without calling the API', async () => {
    const result = await executeProjects(client, { action: 'create' } as never);

    expect(result).toEqual({ success: false, error: 'Unknown action: create' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('registers the fixed-collections description verbatim', () => {
    const registerTool = vi.fn();

    registerProjectsTool({
      registerTool,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    }, client);

    expect(registerTool).toHaveBeenCalledWith(expect.objectContaining({
      id: 'myn_projects',
      description: DESCRIPTION,
      inputSchema: ProjectsInputSchema
    }));
  });
});
