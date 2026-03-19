/**
 * Tests for myn_habits tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeHabits } from '../../src/tools/habits.js';
import { MynApiClient } from '../../src/client.js';

describe('myn_habits', () => {
  const mockFetch = vi.fn();
  let client: MynApiClient;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    client = new MynApiClient('https://api.mindyournow.com', 'test-key');
    mockFetch.mockClear();
  });

  describe('streaks action', () => {
    it('should require habitId for streaks action', async () => {
      // No bulk streaks endpoint — habitId required; use schedule action to see all habits
      const result = await executeHabits(client, { action: 'streaks' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('habitId is required');
      }
    });

    it('should get specific habit streak', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          habitId: '1',
          currentStreak: 5,
          longestStreak: 10,
          totalCompletions: 50
        })
      });

      const result = await executeHabits(client, {
        action: 'streaks',
        habitId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
    });

    it('should get streak with history', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          habitId: '1',
          currentStreak: 5,
          streakHistory: [
            { date: '2026-02-28', completed: true },
            { date: '2026-02-27', completed: true }
          ]
        })
      });

      const result = await executeHabits(client, {
        action: 'streaks',
        habitId: '550e8400-e29b-41d4-a716-446655440000',
        includeHistory: true
      });

      expect(result.success).toBe(true);
    });
  });

  describe('skip action', () => {
    it('should skip habit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          habitId: '1',
          skippedDate: '2026-03-01',
          streakPreserved: true,
          newStreakCount: 5
        })
      });

      const result = await executeHabits(client, {
        action: 'skip',
        habitId: '550e8400-e29b-41d4-a716-446655440000',
        skipDate: '2026-03-01',
        skipReason: 'Rest day'
      });

      expect(result.success).toBe(true);
    });

    it('should return error if habitId missing', async () => {
      const result = await executeHabits(client, {
        action: 'skip',
        skipDate: '2026-03-01'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('chains action', () => {
    it('should list all chains', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          chains: [
            { chainId: '1', name: 'Morning Routine', habitCount: 3, totalCompletions: 100 }
          ]
        })
      });

      const result = await executeHabits(client, { action: 'chains' });

      expect(result.success).toBe(true);
    });

    it('should get specific chain details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          chainId: '1',
          name: 'Morning Routine',
          habits: [
            { habitId: 'h1', title: 'Meditate', order: 1 },
            { habitId: 'h2', title: 'Exercise', order: 2 }
          ],
          trigger: 'Wake up',
          totalCompletions: 100
        })
      });

      const result = await executeHabits(client, {
        action: 'chains',
        chainId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('schedule action', () => {
    it('should get habit schedule', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          schedule: [
            {
              date: '2026-03-01',
              dayOfWeek: 1,
              habits: [
                { habitId: '1', title: 'Exercise', completed: false }
              ]
            }
          ],
          habitsDue: 5
        })
      });

      const result = await executeHabits(client, {
        action: 'schedule',
        dateRange: 7
      });

      expect(result.success).toBe(true);
    });
  });

  describe('reminders action', () => {
    it('should list all reminders', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          reminders: [
            { habitId: '1', title: 'Exercise', enabled: true, reminderTime: '08:00', reminderDays: [1, 2, 3, 4, 5] }
          ]
        })
      });

      const result = await executeHabits(client, { action: 'reminders' });

      expect(result.success).toBe(true);
    });

    it('should get specific habit reminders', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          habitId: '1',
          remindersEnabled: true,
          reminderTime: '08:00',
          reminderDays: [1, 2, 3, 4, 5]
        })
      });

      const result = await executeHabits(client, {
        action: 'reminders',
        habitId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(result.success).toBe(true);
    });

    it('should update reminder settings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          habitId: '1',
          remindersEnabled: true,
          reminderTime: '07:30'
        })
      });

      const result = await executeHabits(client, {
        action: 'reminders',
        habitId: '550e8400-e29b-41d4-a716-446655440000',
        enableReminders: true,
        reminderTime: '07:30'
      });

      expect(result.success).toBe(true);
    });
  });
});
