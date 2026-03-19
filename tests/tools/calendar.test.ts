/**
 * Tests for myn_calendar tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCalendar } from '../../src/tools/calendar.js';
import { MynApiClient } from '../../src/client.js';

describe('myn_calendar', () => {
  const mockFetch = vi.fn();
  let client: MynApiClient;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    client = new MynApiClient('https://api.mindyournow.com', 'test-key');
    mockFetch.mockClear();
  });

  describe('list_events action', () => {
    it('should list events with date range', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          events: [{ id: '1', title: 'Meeting' }],
          calendars: [{ id: 'cal1', name: 'Work' }]
        })
      });

      const result = await executeCalendar(client, {
        action: 'list_events',
        startDate: '2026-03-01T00:00:00Z',
        endDate: '2026-03-07T23:59:59Z'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('events');
        expect(result.data).toHaveProperty('calendars');
      }
    });

    it('should list events without filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ events: [], calendars: [] })
      });

      const result = await executeCalendar(client, { action: 'list_events' });

      expect(result.success).toBe(true);
    });
  });

  describe('create_event action', () => {
    it('should create event with all required fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'event-123', created: true })
      });

      const result = await executeCalendar(client, {
        action: 'create_event',
        title: 'Team Meeting',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z'
      });

      expect(result.success).toBe(true);
    });

    it('should return error if title missing', async () => {
      const result = await executeCalendar(client, {
        action: 'create_event',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z'
      });

      expect(result.success).toBe(false);
    });

    it('should return error if startTime missing', async () => {
      const result = await executeCalendar(client, {
        action: 'create_event',
        title: 'Meeting',
        endTime: '2026-03-01T11:00:00Z'
      });

      expect(result.success).toBe(false);
    });

    it('should create all-day event without endTime', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'event-123', created: true })
      });

      const result = await executeCalendar(client, {
        action: 'create_event',
        title: 'Holiday',
        startTime: '2026-03-01T00:00:00Z',
        isAllDay: true
      });

      expect(result.success).toBe(true);
    });

    it('should return error for non-all-day event without endTime', async () => {
      const result = await executeCalendar(client, {
        action: 'create_event',
        title: 'Meeting',
        startTime: '2026-03-01T10:00:00Z',
        isAllDay: false
      });

      expect(result.success).toBe(false);
    });
  });

  describe('delete_event action', () => {
    it('should delete event', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      const result = await executeCalendar(client, {
        action: 'delete_event',
        eventId: 'event-123'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('deleted', true);
      }
    });

    it('should return error if eventId missing', async () => {
      const result = await executeCalendar(client, {
        action: 'delete_event'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('meetings action', () => {
    it('should get meetings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          meetings: [
            { id: '1', title: 'Standup', startTime: '2026-03-01T09:00:00Z', endTime: '2026-03-01T09:30:00Z', attendees: [], isRecurring: true }
          ],
          total: 1
        })
      });

      const result = await executeCalendar(client, {
        action: 'meetings',
        daysAhead: 7
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('meetings');
        expect(result.data).toHaveProperty('total');
      }
    });
  });

  describe('email validation in create_event', () => {
    it('skips invalid email attendees and only sends valid ones', async () => {
      mockFetch
        // First call: resolve member emails (returns empty for non-email attendees)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ events: [], calendars: [] })
        })
        // Second call: create event
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ id: 'event-1', title: 'Meeting' })
        });

      // Mix of valid and invalid emails — invalid ones should be skipped
      const result = await executeCalendar(client, {
        action: 'create_event',
        title: 'Team Meeting',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
        attendees: ['valid@example.com', 'not-an-email', 'also@valid.org']
      });

      // The call should succeed (valid emails are processed)
      expect(result.success).toBe(true);
    });

    it('handles attendee list with only invalid @-containing emails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'event-2' })
      });

      // These contain '@' so email validation runs, but they are malformed
      const result = await executeCalendar(client, {
        action: 'create_event',
        title: 'Solo Meeting',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T11:00:00Z',
        attendees: ['not an@email', '@nodomain']
      });

      // Should still succeed (malformed emails are skipped, not fatal)
      expect(result.success).toBe(true);
    });
  });
});
