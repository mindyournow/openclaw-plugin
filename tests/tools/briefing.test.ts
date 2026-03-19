/**
 * Tests for myn_briefing tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeBriefing } from '../../src/tools/briefing.js';
import { MynApiClient } from '../../src/client.js';

describe('myn_briefing', () => {
  const mockFetch = vi.fn();
  let client: MynApiClient;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    client = new MynApiClient('https://api.mindyournow.com', 'test-key');
    mockFetch.mockClear();
  });

  describe('status action', () => {
    it('should get briefing status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          hasActiveSession: false,
          pendingCorrections: 0
        })
      });

      const result = await executeBriefing(client, { action: 'status' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('hasActiveSession');
      }
    });
  });

  describe('generate action', () => {
    it('should generate briefing with context', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          briefingId: 'brief-123',
          sessionId: 'session-456',
          summary: 'Your morning briefing',
          criticalNow: [],
          opportunityNow: [],
          overTheHorizon: [],
          upcomingMeetings: [],
          habitsDue: [],
          suggestions: [],
          createdAt: '2026-03-01T08:00:00Z'
        })
      });

      const result = await executeBriefing(client, {
        action: 'generate',
        context: 'Morning planning session',
        focusAreas: ['work', 'health']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('briefingId');
        expect(result.data).toHaveProperty('criticalNow');
      }
    });

    it('should generate briefing without context', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          briefingId: 'brief-123',
          sessionId: 'session-456',
          summary: 'Briefing',
          criticalNow: [],
          opportunityNow: [],
          overTheHorizon: [],
          upcomingMeetings: [],
          habitsDue: [],
          suggestions: [],
          createdAt: '2026-03-01T08:00:00Z'
        })
      });

      const result = await executeBriefing(client, { action: 'generate' });

      expect(result.success).toBe(true);
    });
  });

  describe('get action', () => {
    it('should get latest briefing without id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          briefingId: 'latest',
          summary: 'Latest briefing'
        })
      });

      const result = await executeBriefing(client, { action: 'get' });

      expect(result.success).toBe(true);
    });

    it('should return error when briefingId is provided (no per-ID endpoint)', async () => {
      const result = await executeBriefing(client, {
        action: 'get',
        briefingId: '550e8400-e29b-41d4-a716-446655440000'
      });

      // BP7: The backend has no per-ID endpoint — return explicit error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not supported');
      }
    });
  });

  describe('apply_correction action', () => {
    it('should apply correction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          correctionId: 'corr-123',
          appliedAt: '2026-03-01T08:30:00Z',
          briefingUpdated: true
        })
      });

      const result = await executeBriefing(client, {
        action: 'apply_correction',
        correctionType: 'TASK_COMPLETED',
        correctionData: { taskId: 'task-123' },
        reason: 'Task was already done'
      });

      expect(result.success).toBe(true);
    });

    it('should return error if correctionType missing', async () => {
      const result = await executeBriefing(client, {
        action: 'apply_correction',
        correctionData: { taskId: 'task-123' }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('get action — briefingId rejection (BP7)', () => {
    it('should return an error when briefingId is provided', async () => {
      const result = await executeBriefing(client, {
        action: 'get',
        briefingId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not supported');
      }
    });

    it('should succeed (fetch current) when no briefingId is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'b1', tasks: [] })
      });

      const result = await executeBriefing(client, { action: 'get' });
      expect(result.success).toBe(true);
    });
  });

  describe('complete_session action', () => {
    it('should complete session with summary', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          sessionId: 'session-456',
          completedAt: '2026-03-01T09:00:00Z',
          followUps: []
        })
      });

      const result = await executeBriefing(client, {
        action: 'complete_session',
        sessionSummary: 'Planned the day successfully',
        decisions: ['Focus on project X', 'Defer meeting Y']
      });

      expect(result.success).toBe(true);
    });
  });
});
