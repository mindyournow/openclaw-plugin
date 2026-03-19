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
        json: () => Promise.resolve([
          { id: '1', title: 'Task 1' },
          { id: '2', title: 'Task 2' }
        ])
      });

      const result = await executeTasks(client, { action: 'list' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data)).toBe(true);
      }
    });

    it('should list tasks with filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ id: '1', priority: 'CRITICAL' }])
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
});
