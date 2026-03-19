/**
 * Tests for myn_debrief tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeDebrief } from '../../src/tools/debrief.js';
import { MynApiClient } from '../../src/client.js';

describe('myn_debrief', () => {
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

      const result = await executeDebrief(client, { action: 'status' });

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
          debriefId: 'brief-123',
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

      const result = await executeDebrief(client, {
        action: 'generate',
        context: 'Morning planning session',
        focusAreas: ['work', 'health']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('debriefId');
        expect(result.data).toHaveProperty('criticalNow');
      }
    });

    it('should generate briefing without context', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          debriefId: 'brief-123',
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

      const result = await executeDebrief(client, { action: 'generate' });

      expect(result.success).toBe(true);
    });
  });

  describe('get action', () => {
    it('should get latest briefing without id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          debriefId: 'latest',
          summary: 'Latest briefing'
        })
      });

      const result = await executeDebrief(client, { action: 'get' });

      expect(result.success).toBe(true);
    });

    it('should get specific briefing with id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          debriefId: 'specific-id',
          summary: 'Specific briefing'
        })
      });

      const result = await executeDebrief(client, {
        action: 'get',
        debriefId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('apply_correction action', () => {
    it('should apply correction', async () => {
      // guardedPost: GET /api/v2/debrief/current (stateHash read) + POST (write)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sessionId: 'session-456', stateHash: 'abc123' })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          correctionId: 'corr-123',
          appliedAt: '2026-03-01T08:30:00Z',
          briefingUpdated: true
        })
      });

      const result = await executeDebrief(client, {
        action: 'apply_correction',
        correctionType: 'TASK_COMPLETED',
        correctionData: { taskId: 'task-123' },
        reason: 'Task was already done'
      });

      expect(result.success).toBe(true);
    });

    it('should return error if correctionType missing', async () => {
      const result = await executeDebrief(client, {
        action: 'apply_correction',
        correctionData: { taskId: 'task-123' }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('complete_session action', () => {
    it('should complete session with summary', async () => {
      // guardedPost: GET /api/v2/debrief/current (stateHash read) + POST (write)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sessionId: 'session-current', stateHash: 'abc123' })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          sessionId: 'session-456',
          completedAt: '2026-03-01T09:00:00Z',
          followUps: []
        })
      });

      const result = await executeDebrief(client, {
        action: 'complete_session',
        sessionSummary: 'Planned the day successfully',
        decisions: ['Focus on project X', 'Defer meeting Y']
      });

      expect(result.success).toBe(true);
    });
  });
});
