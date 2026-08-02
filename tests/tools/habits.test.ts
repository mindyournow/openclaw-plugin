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
    const habitId = '550e8400-e29b-41d4-a716-446655440000';

    it('reads reminder settings from the unified task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: habitId,
          taskType: 'HABIT',
          reminderEnabled: true,
          reminderTime: '08:00'
        })
      });

      const result = await executeHabits(client, {
        action: 'reminders',
        habitId
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.mindyournow.com/api/v2/unified-tasks/${habitId}`,
        expect.any(Object)
      );
      expect(result).toEqual({
        success: true,
        data: { habitId, reminderEnabled: true, reminderTime: '08:00' }
      });
    });

    it.each(['TASK', 'CHORE'])('rejects a %s reminder read', async taskType => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: habitId, taskType })
      });

      const result = await executeHabits(client, { action: 'reminders', habitId });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain('must reference a HABIT');
    });

    it.each(['TASK', 'CHORE'])('rejects a %s reminder write before PATCH', async taskType => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: habitId, taskType, stateHash: 'hash-v1' })
      });

      const result = await executeHabits(client, {
        action: 'reminders',
        habitId,
        enableReminders: true
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain('must reference a HABIT');
    });

    it.each([
      ['bare', (tasks: unknown[]) => tasks],
      ['wrapped', (tasks: unknown[]) => ({ tasks })]
    ])('lists only enabled habits from a %s unified-tasks response', async (_shape, wrap) => {
      const tasks = [
        {
          id: habitId,
          title: 'Exercise',
          taskType: 'HABIT',
          reminderEnabled: true,
          reminderTime: '08:00'
        },
        {
          id: 'disabled-habit',
          title: 'Read',
          taskType: 'HABIT',
          reminderEnabled: false,
          reminderTime: '20:00'
        },
        {
          id: 'enabled-chore',
          title: 'Water plants',
          taskType: 'CHORE',
          reminderEnabled: true,
          reminderTime: '09:00'
        }
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(wrap(tasks))
      });

      const result = await executeHabits(client, { action: 'reminders' });

      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.mindyournow.com/api/v2/unified-tasks?type=HABIT&page=0&size=200'
      );
      expect(result).toEqual({
        success: true,
        data: {
          reminders: [{ habitId, title: 'Exercise', reminderTime: '08:00' }]
        }
      });
    });

    it('returns an enabled reminder from a later unified-task page', async () => {
      const firstPage = Array.from({ length: 200 }, (_, index) => ({
        id: `habit-${index}`,
        taskType: 'HABIT',
        reminderEnabled: false
      }));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ tasks: firstPage })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          tasks: [{
            id: habitId,
            title: 'Later-page habit',
            taskType: 'HABIT',
            reminderEnabled: true,
            reminderTime: '08:00'
          }]
        })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ tasks: firstPage })
      });

      const result = await executeHabits(client, { action: 'reminders' });

      expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
        'https://api.mindyournow.com/api/v2/unified-tasks?type=HABIT&page=0&size=200',
        'https://api.mindyournow.com/api/v2/unified-tasks?type=HABIT&page=1&size=200',
        'https://api.mindyournow.com/api/v2/unified-tasks?type=HABIT&page=0&size=200'
      ]);
      expect(result).toEqual({
        success: true,
        data: {
          reminders: [{ habitId, title: 'Later-page habit', reminderTime: '08:00' }]
        }
      });
    });

    it('fails when a full unified-task page repeats', async () => {
      const repeatedPage = Array.from({ length: 200 }, (_, index) => ({
        id: `habit-${index}`,
        taskType: 'HABIT'
      }));
      for (let call = 0; call < 2; call += 1) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tasks: repeatedPage })
        });
      }

      const result = await executeHabits(client, { action: 'reminders' });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain('pagination did not advance');
    });

    it('deduplicates IDs when page boundaries overlap', async () => {
      const firstPage = Array.from({ length: 200 }, (_, index) => ({
        id: `habit-${index}`,
        taskType: 'HABIT',
        reminderEnabled: false
      }));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ tasks: firstPage })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          tasks: [
            {
              id: 'habit-199',
              title: 'Updated boundary habit',
              taskType: 'HABIT',
              reminderEnabled: true,
              reminderTime: '07:00'
            },
            {
              id: habitId,
              title: 'Later-page habit',
              taskType: 'HABIT',
              reminderEnabled: true,
              reminderTime: '08:00'
            }
          ]
        })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ tasks: firstPage })
      });

      const result = await executeHabits(client, { action: 'reminders' });

      expect(result).toEqual({
        success: true,
        data: {
          reminders: [
            { habitId: 'habit-199', title: 'Updated boundary habit', reminderTime: '07:00' },
            { habitId, title: 'Later-page habit', reminderTime: '08:00' }
          ]
        }
      });
    });

    it('writes real reminder fields through guardedPatch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: habitId, taskType: 'HABIT', stateHash: 'hash-v1' })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ updated: true })
      });

      const result = await executeHabits(client, {
        action: 'reminders',
        habitId,
        enableReminders: true,
        reminderTime: '07:30'
      });

      expect(mockFetch.mock.calls.map(call => call[1].method)).toEqual(['GET', 'PATCH']);
      expect(mockFetch.mock.calls[1][0]).toBe(
        `https://api.mindyournow.com/api/v2/unified-tasks/${habitId}`
      );
      expect(mockFetch.mock.calls[1][1].headers['X-MYN-State-Hash']).toBe('hash-v1');
      expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
        reminderEnabled: true,
        reminderTime: '07:30'
      });
      expect(result.success).toBe(true);
    });

    it('re-reads and revalidates before retrying one conflict', async () => {
      vi.useFakeTimers();
      try {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: habitId, taskType: 'HABIT', stateHash: 'hash-v1' })
        });
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 409,
          statusText: 'Conflict',
          text: () => Promise.resolve(JSON.stringify({ currentStateHash: 'unchecked-hash' }))
        });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: habitId, taskType: 'HABIT', stateHash: 'hash-v2' })
        });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ updated: true })
        });

        const result = await executeHabits(client, {
          action: 'reminders',
          habitId,
          enableReminders: false
        });

        expect(mockFetch).toHaveBeenCalledTimes(4);
        expect(mockFetch.mock.calls.map(call => call[1].method)).toEqual([
          'GET', 'PATCH', 'GET', 'PATCH'
        ]);
        expect(mockFetch.mock.calls[1][1].headers['X-MYN-State-Hash']).toBe('hash-v1');
        expect(mockFetch.mock.calls[3][1].headers['X-MYN-State-Hash']).toBe('hash-v2');
        expect(result.success).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects a conflict retry when the fresh entity is no longer a habit', async () => {
      vi.useFakeTimers();
      try {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: habitId, taskType: 'HABIT', stateHash: 'hash-v1' })
        });
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 409,
          statusText: 'Conflict',
          text: () => Promise.resolve(JSON.stringify({ currentStateHash: 'unchecked-hash' }))
        });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: habitId, taskType: 'CHORE', stateHash: 'hash-v2' })
        });

        const result = await executeHabits(client, {
          action: 'reminders',
          habitId,
          enableReminders: false
        });

        expect(mockFetch.mock.calls.map(call => call[1].method)).toEqual(['GET', 'PATCH', 'GET']);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error).toContain('must reference a HABIT');
      } finally {
        vi.useRealTimers();
      }
    });

    it('fails clearly at the defensive pagination ceiling', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        const page = Number(new URL(url).searchParams.get('page'));
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            tasks: Array.from({ length: 200 }, (_, index) => ({
              id: `page-${page}-habit-${index}`,
              taskType: 'HABIT'
            }))
          })
        };
      });

      const result = await executeHabits(client, { action: 'reminders' });

      expect(mockFetch).toHaveBeenCalledTimes(100);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain('100-page safety limit');
      mockFetch.mockReset();
    });
  });
});
