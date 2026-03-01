/**
 * myn_calendar tool - Calendar events and meetings
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const CalendarInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('list_events'),
    Type.Literal('create_event'),
    Type.Literal('delete_event'),
    Type.Literal('meetings')
  ]),
  // list_events parameters
  startDate: Type.Optional(Type.String({ format: 'date-time' })),
  endDate: Type.Optional(Type.String({ format: 'date-time' })),
  calendarId: Type.Optional(Type.String()),
  includeAllDay: Type.Optional(Type.Boolean({ default: true })),
  limit: Type.Optional(Type.Number({ default: 50 })),
  // create_event parameters
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  startTime: Type.Optional(Type.String({ format: 'date-time' })),
  endTime: Type.Optional(Type.String({ format: 'date-time' })),
  isAllDay: Type.Optional(Type.Boolean({ default: false })),
  location: Type.Optional(Type.String()),
  attendees: Type.Optional(Type.Array(Type.String({ format: 'email' }))),
  recurrence: Type.Optional(Type.String()), // RRULE format
  reminders: Type.Optional(Type.Array(Type.Object({
    minutes: Type.Number(),
    method: Type.Union([Type.Literal('popup'), Type.Literal('email')])
  }))),
  // delete_event parameters
  eventId: Type.Optional(Type.String()),
  // meetings parameters
  includePast: Type.Optional(Type.Boolean({ default: false })),
  daysAhead: Type.Optional(Type.Number({ default: 7 }))
});

export type CalendarInput = typeof CalendarInputSchema.static;

export async function executeCalendar(
  client: MynApiClient,
  input: CalendarInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'list_events':
        return await listEvents(client, input);
      case 'create_event':
        return await createEvent(client, input);
      case 'delete_event':
        return await deleteEvent(client, input);
      case 'meetings':
        return await getMeetings(client, input);
      default:
        return errorResult(`Unknown action: ${(input as { action: string }).action}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      return errorResult(error.message);
    }
    return errorResult('Unknown error occurred');
  }
}

async function listEvents(client: MynApiClient, input: CalendarInput) {
  const params = new URLSearchParams();

  if (input.startDate) params.append('start', input.startDate);
  if (input.endDate) params.append('end', input.endDate);
  if (input.calendarId) params.append('calendarId', input.calendarId);
  if (input.includeAllDay !== undefined) params.append('allDay', input.includeAllDay.toString());
  if (input.limit) params.append('limit', input.limit.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const data = await client.get<{
    events: unknown[];
    calendars: unknown[];
  }>(`/api/v2/calendar/events${queryString}`);
  return jsonResult(data);
}

async function createEvent(client: MynApiClient, input: CalendarInput) {
  if (!input.title) {
    return errorResult('title is required for create_event action');
  }
  if (!input.startTime) {
    return errorResult('startTime is required for create_event action');
  }
  if (!input.endTime && !input.isAllDay) {
    return errorResult('endTime is required for non-all-day events');
  }

  const body: Record<string, unknown> = {
    title: input.title,
    startTime: input.startTime,
    isAllDay: input.isAllDay ?? false
  };

  if (!input.isAllDay && input.endTime) {
    body.endTime = input.endTime;
  }
  if (input.description) body.description = input.description;
  if (input.location) body.location = input.location;
  if (input.calendarId) body.calendarId = input.calendarId;
  if (input.attendees) body.attendees = input.attendees;
  if (input.recurrence) body.recurrence = input.recurrence;
  if (input.reminders) body.reminders = input.reminders;

  const data = await client.post<unknown>('/api/v2/calendar/events', body);
  return jsonResult(data);
}

async function deleteEvent(client: MynApiClient, input: CalendarInput) {
  if (!input.eventId) {
    return errorResult('eventId is required for delete_event action');
  }

  await client.delete(`/api/v2/calendar/events/${input.eventId}`);
  return jsonResult({ deleted: true, eventId: input.eventId });
}

async function getMeetings(client: MynApiClient, input: CalendarInput) {
  const params = new URLSearchParams();

  if (input.includePast) params.append('includePast', 'true');
  if (input.daysAhead) params.append('daysAhead', input.daysAhead.toString());
  if (input.limit) params.append('limit', input.limit.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const data = await client.get<{
    meetings: Array<{
      id: string;
      title: string;
      startTime: string;
      endTime: string;
      attendees: string[];
      location?: string;
      isRecurring: boolean;
    }>;
    total: number;
  }>(`/api/v2/calendar/meetings${queryString}`);
  return jsonResult(data);
}

export function registerCalendarTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_calendar',
    name: 'MYN Calendar',
    description: 'Manage calendar events and meetings. Actions: list_events, create_event, delete_event, meetings.',
    inputSchema: CalendarInputSchema,
    async execute(input: unknown) {
      return executeCalendar(client, input as CalendarInput);
    }
  });
}

// Type for OpenClaw plugin API
interface OpenClawPluginApi {
  registerTool(tool: {
    id: string;
    name: string;
    description: string;
    inputSchema: unknown;
    execute: (input: unknown) => Promise<unknown>;
  }): void;
  logger: {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  pluginConfig?: Record<string, unknown>;
}
