/**
 * Tests for myn_timers tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTimers } from '../../src/tools/timers.js';
import { MynApiClient } from '../../src/client.js';

describe('myn_timers', () => {
  const mockFetch = vi.fn();
  let client: MynApiClient;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    client = new MynApiClient('https://api.mindyournow.com', 'test-key');
    mockFetch.mockClear();
  });

  describe('create_countdown action', () => {
    it('should create countdown with duration in seconds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          timerId: 'timer-123',
          type: 'COUNTDOWN',
          duration: 1800,
          endTime: '2026-03-01T10:30:00Z',
          label: 'Focus time',
          status: 'ACTIVE'
        })
      });

      const result = await executeTimers(client, {
        action: 'create_countdown',
        duration: 1800,
        label: 'Focus time'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('timerId');
        expect(result.data).toHaveProperty('type', 'COUNTDOWN');
      }
    });

    it('should create countdown with duration in minutes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          timerId: 'timer-123',
          type: 'COUNTDOWN',
          duration: 3600,
          endTime: '2026-03-01T11:00:00Z',
          status: 'ACTIVE'
        })
      });

      const result = await executeTimers(client, {
        action: 'create_countdown',
        durationMinutes: 60
      });

      expect(result.success).toBe(true);
    });

    it('should return error if duration missing', async () => {
      const result = await executeTimers(client, {
        action: 'create_countdown',
        label: 'Timer'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('create_alarm action', () => {
    it('should create alarm', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          timerId: 'alarm-123',
          type: 'ALARM',
          alarmTime: '2026-03-01T08:00:00Z',
          label: 'Wake up',
          recurrence: 'daily',
          status: 'ACTIVE'
        })
      });

      const result = await executeTimers(client, {
        action: 'create_alarm',
        alarmTime: '2026-03-01T08:00:00Z',
        label: 'Wake up',
        recurrence: 'daily'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('type', 'ALARM');
      }
    });

    it('should return error if alarmTime missing', async () => {
      const result = await executeTimers(client, {
        action: 'create_alarm',
        label: 'Wake up'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('list action', () => {
    it('should list all timers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          timers: [
            { timerId: '1', type: 'COUNTDOWN', label: 'Focus', status: 'ACTIVE', duration: 1800, remaining: 1200 },
            { timerId: '2', type: 'ALARM', label: 'Meeting', status: 'ACTIVE', alarmTime: '2026-03-01T14:00:00Z' }
          ],
          activeCount: 2
        })
      });

      const result = await executeTimers(client, { action: 'list' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('timers');
        expect(result.data).toHaveProperty('activeCount');
      }
    });
  });

  describe('cancel action', () => {
    it('should cancel timer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          timerId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'cancelled'
        })
      });

      const result = await executeTimers(client, {
        action: 'cancel',
        timerId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('status', 'cancelled');
      }
    });

    it('should return error if timerId missing', async () => {
      const result = await executeTimers(client, { action: 'cancel' });

      expect(result.success).toBe(false);
    });
  });

  describe('snooze action', () => {
    it('should snooze timer with default minutes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          timerId: 'alarm-123',
          snoozedUntil: '2026-03-01T08:05:00Z',
          status: 'SNOOZED'
        })
      });

      const result = await executeTimers(client, {
        action: 'snooze',
        timerId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
    });

    it('should snooze timer with custom minutes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          timerId: 'alarm-123',
          snoozedUntil: '2026-03-01T08:10:00Z',
          status: 'SNOOZED'
        })
      });

      const result = await executeTimers(client, {
        action: 'snooze',
        timerId: '550e8400-e29b-41d4-a716-446655440000',
        snoozeMinutes: 10
      });

      expect(result.success).toBe(true);
    });

    it('should return error if timerId missing', async () => {
      const result = await executeTimers(client, { action: 'snooze' });

      expect(result.success).toBe(false);
    });
  });

  describe('pomodoro action', () => {
    it('should create pomodoro with defaults', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          timerId: 'pomodoro-123',
          type: 'POMODORO',
          sessions: 4,
          currentSession: 1,
          isWorkPhase: true,
          workDuration: 1500,
          breakDuration: 300,
          longBreakDuration: 900,
          status: 'ACTIVE'
        })
      });

      const result = await executeTimers(client, { action: 'pomodoro' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('type', 'POMODORO');
        expect(result.data).toHaveProperty('sessions', 4);
      }
    });

    it('should create pomodoro with custom settings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          timerId: 'pomodoro-123',
          type: 'POMODORO',
          label: 'Deep work session',
          sessions: 2,
          currentSession: 1,
          isWorkPhase: true,
          workDuration: 3000,
          breakDuration: 600,
          longBreakDuration: 1200,
          status: 'ACTIVE'
        })
      });

      const result = await executeTimers(client, {
        action: 'pomodoro',
        label: 'Deep work session',
        workDuration: 50,
        breakDuration: 10,
        longBreakDuration: 20,
        sessions: 2,
        autoStart: true
      });

      expect(result.success).toBe(true);
    });
  });
});
