/**
 * Tests for myn_memory tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeMemory } from '../../src/tools/memory.js';
import { MynApiClient } from '../../src/client.js';

describe('myn_memory', () => {
  const mockFetch = vi.fn();
  let client: MynApiClient;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    client = new MynApiClient('https://api.mindyournow.com', 'test-key');
    mockFetch.mockClear();
  });

  describe('remember action', () => {
    it('should return error — direct memory creation not supported by backend', async () => {
      // The backend has no POST /memories endpoint; memories are created via AI conversations.
      const result = await executeMemory(client, {
        action: 'remember',
        content: 'User prefers morning meetings',
        category: 'user_preference',
        tags: ['meetings', 'preferences'],
        importance: 'medium'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not supported');
      }
    });

    it('should return error if content missing', async () => {
      const result = await executeMemory(client, {
        action: 'remember',
        category: 'user_preference'
      });

      expect(result.success).toBe(false);
    });

    it('should return error even for minimal remember', async () => {
      // Backend has no POST endpoint — always returns not-supported error.
      const result = await executeMemory(client, {
        action: 'remember',
        content: 'Simple memory'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('recall action', () => {
    it('should get recent memories', async () => {
      // Backend returns an array of memory objects (not a wrapper object)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { memoryId: '1', content: 'Memory 1', category: 'work_context', tags: [], importance: 'high', createdAt: '2026-03-01T10:00:00Z' }
        ])
      });

      const result = await executeMemory(client, { action: 'recall' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data)).toBe(true);
      }
    });

    it('should get specific memory by id (client-side filter)', async () => {
      // Backend returns all memories as array; client filters by memoryId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          {
            memoryId: '550e8400-e29b-41d4-a716-446655440000',
            content: 'Specific memory',
            category: 'user_preference',
            tags: ['pref'],
            importance: 'medium',
            createdAt: '2026-03-01T10:00:00Z',
            accessedAt: '2026-03-01T12:00:00Z'
          }
        ])
      });

      const result = await executeMemory(client, {
        action: 'recall',
        memoryId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('memoryId', '550e8400-e29b-41d4-a716-446655440000');
      }
    });
  });

  describe('forget action', () => {
    it('should delete memory', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      const result = await executeMemory(client, {
        action: 'forget',
        memoryId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('deleted', true);
      }
    });

    it('should return error if memoryId missing', async () => {
      const result = await executeMemory(client, { action: 'forget' });

      expect(result.success).toBe(false);
    });
  });

  describe('search action', () => {
    it('should search memories', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          results: [
            { memoryId: '1', content: 'User likes coffee', category: 'user_preference', relevance: 0.95, createdAt: '2026-03-01T10:00:00Z' }
          ],
          total: 1
        })
      });

      const result = await executeMemory(client, {
        action: 'search',
        query: 'coffee',
        limit: 10
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('results');
        expect(result.data).toHaveProperty('total');
      }
    });

    it('should search with category filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [], total: 0 })
      });

      const result = await executeMemory(client, {
        action: 'search',
        query: 'meeting',
        filterCategory: 'user_preference',
        filterTags: ['work']
      });

      expect(result.success).toBe(true);
    });
  });
});
