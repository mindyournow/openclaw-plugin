/**
 * Tests for myn_tasks tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTasks, TasksInputSchema } from '../../src/tools/tasks.js';
import { MynApiClient } from '../../src/client.js';

describe('myn_tasks', () => {
  const mockFetch = vi.fn();
  let client: MynApiClient;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    client = new MynApiClient('https://api.mindyournow.com', 'test-key');
    mockFetch.mockClear();
  });

  describe('list action', () => {
    it('should list tasks with no filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          tasks: [
            { id: '1', title: 'Task 1' },
            { id: '2', title: 'Task 2' }
          ],
          total: 2,
          limit: 20,
          offset: 0,
          hasMore: false
        })
      });

      const result = await executeTasks(client, { action: 'list' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([
          { id: '1', title: 'Task 1' },
          { id: '2', title: 'Task 2' }
        ]);
      }
      expect(mockFetch.mock.calls[0][0]).toContain('limit=20');
    });

    it('should list tasks with filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          tasks: [{ id: '1', priority: 'CRITICAL' }],
          total: 1,
          limit: 10,
          offset: 0,
          hasMore: false
        })
      });

      await executeTasks(client, {
        action: 'list',
        priority: 'CRITICAL',
        status: 'PENDING',
        limit: 10
      });

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('priority=CRITICAL');
      expect(callUrl).toContain('status=PENDING');
      expect(callUrl).toContain('limit=10');
    });
  });

  describe('get action', () => {
    it('should get specific task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'task-123', title: 'Test Task' })
      });

      const result = await executeTasks(client, {
        action: 'get',
        taskId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('id', 'task-123');
      }
    });

    it('should return error if taskId missing', async () => {
      const result = await executeTasks(client, { action: 'get' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('taskId is required');
      }
    });
  });

  describe('create action', () => {
    it('should create task with all required fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'new-task-id', created: true })
      });

      const result = await executeTasks(client, {
        action: 'create',
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'New Task',
        taskType: 'TASK',
        priority: 'OPPORTUNITY_NOW',
        startDate: '2026-03-01'
      });

      expect(result.success).toBe(true);
    });

    it('should auto-generate UUID when id is omitted', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'auto-generated', created: true })
      });

      const result = await executeTasks(client, {
        action: 'create',
        title: 'Task Without ID',
        taskType: 'TASK',
        priority: 'OPPORTUNITY_NOW',
        startDate: '2026-03-01'
      });

      expect(result.success).toBe(true);
      // Verify the POST body contained an auto-generated UUID
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should return error if title missing', async () => {
      const result = await executeTasks(client, {
        action: 'create',
        id: '550e8400-e29b-41d4-a716-446655440000',
        taskType: 'TASK',
        priority: 'CRITICAL',
        startDate: '2026-03-01'
      });

      expect(result.success).toBe(false);
    });

    it('should return error if priority missing', async () => {
      const result = await executeTasks(client, {
        action: 'create',
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Task',
        taskType: 'TASK',
        startDate: '2026-03-01'
      });

      expect(result.success).toBe(false);
    });

    it('should require recurrenceRule for HABIT', async () => {
      const result = await executeTasks(client, {
        action: 'create',
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Daily Habit',
        taskType: 'HABIT',
        priority: 'OPPORTUNITY_NOW',
        startDate: '2026-03-01'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('recurrenceRule');
      }
    });

    it('should create HABIT with recurrenceRule', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'habit-id' })
      });

      const result = await executeTasks(client, {
        action: 'create',
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Daily Habit',
        taskType: 'HABIT',
        priority: 'OPPORTUNITY_NOW',
        startDate: '2026-03-01',
        recurrenceRule: 'FREQ=DAILY'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('update action', () => {
    it('should update task with updates object', async () => {
      // guardedPatch: GET (stateHash read) + PATCH (write)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000', stateHash: 'abc123' })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ updated: true })
      });

      const result = await executeTasks(client, {
        action: 'update',
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        updates: { title: 'Updated Title', priority: 'CRITICAL' }
      });

      expect(result.success).toBe(true);
    });

    it('should return error if updates missing', async () => {
      const result = await executeTasks(client, {
        action: 'update',
        taskId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('complete action', () => {
    it('should complete task', async () => {
      // guardedPost: GET (stateHash read) + POST (write)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000', stateHash: 'abc123' })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ completed: true })
      });

      const result = await executeTasks(client, {
        action: 'complete',
        taskId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
    });

    it('should return error if taskId missing', async () => {
      const result = await executeTasks(client, { action: 'complete' });

      expect(result.success).toBe(false);
    });
  });

  describe('archive action', () => {
    it('should archive task', async () => {
      // guardedPost: GET (stateHash read) + POST (write)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000', stateHash: 'abc123' })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ archived: true })
      });

      const result = await executeTasks(client, {
        action: 'archive',
        taskId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('UUID validation', () => {
    it('rejects invalid UUID on get action', async () => {
      const result = await executeTasks(client, {
        action: 'get',
        taskId: 'not-a-valid-uuid'
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('taskId');
      }
    });

    it('rejects invalid UUID on update action', async () => {
      const result = await executeTasks(client, {
        action: 'update',
        taskId: 'bad-uuid',
        updates: { title: 'New Title' }
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('taskId');
      }
    });

    it('rejects invalid UUID on complete action', async () => {
      const result = await executeTasks(client, {
        action: 'complete',
        taskId: '12345'
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID on archive action', async () => {
      const result = await executeTasks(client, {
        action: 'archive',
        taskId: 'not-uuid'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ALLOWED_UPDATE_FIELDS allowlist', () => {
    it('rejects updates containing only sensitive fields', async () => {
      const result = await executeTasks(client, {
        action: 'update',
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        updates: { ownerId: '999', householdId: '777', isLocked: true }
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Rejected fields');
      }
    });

    it('filters out sensitive fields but passes allowed fields', async () => {
      // guardedPatch: GET (stateHash read) + PATCH (write)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000', stateHash: 'abc123' })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ updated: true })
      });

      const result = await executeTasks(client, {
        action: 'update',
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        updates: { title: 'Safe Title', ownerId: '999' }
      });

      // Should succeed (title is allowed) and not include ownerId in request
      expect(result.success).toBe(true);
      // calls[0] is the GET (stateHash read), calls[1] is the PATCH (write)
      const requestBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(requestBody).toHaveProperty('title', 'Safe Title');
      expect(requestBody).not.toHaveProperty('ownerId');
    });

    it('passes reminder fields to guardedPatch verbatim', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000', stateHash: 'abc123' })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ updated: true })
      });

      const result = await executeTasks(client, {
        action: 'update',
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        updates: { reminderEnabled: true, reminderTime: '09:00' }
      });

      expect(result.success).toBe(true);
      expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
        reminderEnabled: true,
        reminderTime: '09:00'
      });
    });
  });

  describe('search action', () => {
    it('should search tasks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: '1', title: 'Matching Task' }
        ])
      });

      const result = await executeTasks(client, {
        action: 'search',
        query: 'meeting',
        includeArchived: false
      });

      expect(result.success).toBe(true);
    });
  });
  describe('plans (MIN-1085)', () => {
    const PLAN = '22222222-2222-4222-8222-222222222222';
    const A = '33333333-3333-4333-8333-333333333333';
    const B = '44444444-4444-4444-8444-444444444444';
    const planView = (ids: string[]) => ({
      planId: PLAN,
      steps: ids.map((id, i) => ({ step: i + 1, id })),
      currentStep: ids.length ? { id: ids[0] } : null
    });
    // Route by method + path so the call order inside the tool does not matter.
    const route = (handler: (method: string, url: string, body: unknown) => unknown) => {
      mockFetch.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(init.body) : undefined;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(handler(method, url, body)) });
      });
    };

    it('create_plan creates the plan, then each step in order with parentTaskId and position', async () => {
      const posts: Array<Record<string, unknown>> = [];
      route((method, url, body) => {
        if (method === 'POST') { posts.push(body as Record<string, unknown>); return body; }
        if (url.endsWith('/plan')) return planView([]);
        return { id: PLAN, priority: 'CRITICAL', startDate: '2026-10-12' };
      });

      const result = await executeTasks(client, {
        action: 'create_plan',
        id: PLAN,
        title: 'Bothell move',
        steps: [{ title: 'Book the movers', startDate: '2026-10-13' }, { title: 'Pack the kitchen' }]
      });

      expect(result.success).toBe(true);
      expect(posts[0]).toMatchObject({ id: PLAN, title: 'Bothell move', taskType: 'TASK' });
      expect(posts.slice(1).map(p => [p.title, p.parentTaskId, p.position, p.startDate])).toEqual([
        ['Book the movers', PLAN, 0, '2026-10-13'],
        ['Pack the kitchen', PLAN, 1, '2026-10-12']
      ]);
    });

    it('add_steps moves an existing task in through the state-hash guard', async () => {
      const patches: Array<[string, string | undefined, unknown]> = [];
      mockFetch.mockImplementation((url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
        const method = init?.method ?? 'GET';
        if (method === 'PATCH') patches.push([url, init?.headers?.['X-MYN-State-Hash'], JSON.parse(init!.body!)]);
        const json = method === 'PATCH' ? {} : url.endsWith('/plan') ? planView([A]) : { id: B, stateHash: 'hash-v1' };
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
      });

      const result = await executeTasks(client, { action: 'add_steps', taskId: PLAN, stepIds: [B] });

      expect(result.success).toBe(true);
      expect(patches).toHaveLength(1);
      expect(patches[0][0]).toContain(`/api/v2/unified-tasks/${B}`);
      expect(patches[0][2]).toEqual({ parentTaskId: PLAN, position: 1 });
    });

    it('plan reads the current step', async () => {
      route(() => planView([A, B]));
      const result = await executeTasks(client, { action: 'plan', taskId: A });
      expect(result.success).toBe(true);
      expect(mockFetch.mock.calls[0][0]).toContain(`/api/v2/unified-tasks/${A}/plan`);
      if (result.success) expect((result.data as { currentStep: { id: string } }).currentStep.id).toBe(A);
    });

    it('reorder_steps patches only the steps that move', async () => {
      const patches: Array<[string, unknown]> = [];
      route((method, url, body) => {
        if (method === 'PATCH') { patches.push([url, body]); return {}; }
        if (url.endsWith('/plan')) return planView([A, B]);
        return { stateHash: 'hash-v1' };
      });

      const result = await executeTasks(client, { action: 'reorder_steps', taskId: PLAN, stepIds: [B] });

      expect(result.success).toBe(true);
      expect(patches.map(([url, body]) => [url.split('/').pop(), body])).toEqual([
        [B, { position: 0 }],
        [A, { position: 1 }]
      ]);
    });

    it('reorder_steps refuses a task that is not a step of the plan', async () => {
      route(() => planView([A]));
      const result = await executeTasks(client, { action: 'reorder_steps', taskId: PLAN, stepIds: [B] });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain('Not steps of this plan');
    });

    it('accepts parentTaskId and position as update fields', async () => {
      route((method) => (method === 'GET' ? { stateHash: 'h' } : { updated: true }));
      const result = await executeTasks(client, { action: 'update', taskId: A, updates: { parentTaskId: PLAN, position: 2 } });
      expect(result.success).toBe(true);
      expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ parentTaskId: PLAN, position: 2 });
    });
  });
});
