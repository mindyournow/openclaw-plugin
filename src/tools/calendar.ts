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
    Type.Literal('update_event'),
    Type.Literal('delete_event'),
    Type.Literal('meetings')
  ]),
  // list_events parameters
  startDate: Type.Optional(Type.String({ format: 'date-time' })),
  endDate: Type.Optional(Type.String({ format: 'date-time' })),
  calendarId: Type.Optional(Type.String()),
  includeAllDay: Type.Optional(Type.Boolean({ default: true })),
  limit: Type.Optional(Type.Number({ default: 50 })),
  // create_event parameters — startTime must be ISO 8601 (e.g. "2026-03-08T16:30:00")
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  startTime: Type.Optional(Type.String({ format: 'date-time' })),
  endTime: Type.Optional(Type.String({ format: 'date-time' })),
  isAllDay: Type.Optional(Type.Boolean({ default: false })),
  location: Type.Optional(Type.String()),
  // attendees: email addresses OR first names of household members (resolved automatically)
  attendees: Type.Optional(Type.Array(Type.String())),
  recurrence: Type.Optional(Type.String()), // RRULE format
  reminders: Type.Optional(Type.Array(Type.Object({
    minutes: Type.Number(),
    method: Type.Union([Type.Literal('popup'), Type.Literal('email')])
  }))),
  timezone: Type.Optional(Type.String()), // e.g. "America/New_York"
  // update_event / delete_event parameters
  eventId: Type.Optional(Type.String()),
  // update_event: fields to update (all optional, only provided fields are changed)
  newTitle: Type.Optional(Type.String({ description: 'New title for the event' })),
  newDescription: Type.Optional(Type.String({ description: 'New description for the event' })),
  newLocation: Type.Optional(Type.String({ description: 'New location for the event' })),
  newStartTime: Type.Optional(Type.String({ format: 'date-time', description: 'New start time (ISO 8601)' })),
  newEndTime: Type.Optional(Type.String({ format: 'date-time', description: 'New end time (ISO 8601)' })),
  newAttendees: Type.Optional(Type.Array(Type.String(), { description: 'Replace attendees list (email addresses or household member names)' })),
  addAttendees: Type.Optional(Type.Array(Type.String(), { description: 'Add attendees to existing list (email addresses or household member names)' })),
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
      case 'update_event':
        return await updateEvent(client, input);
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
  if (input.limit) params.append('limit', input.limit.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const data = await client.get<{
    events: unknown[];
    total: number;
    start: string;
    end: string;
  }>(`/api/v2/calendar/events${queryString}`);
  return jsonResult(data);
}

/**
 * Normalize a time value to ISO 8601 datetime.
 * Handles cases where the LLM passes a bare time like "16:30" alongside a startDate.
 */
function toIsoDateTime(time: string, date?: string): string {
  // Already a full datetime (has 'T' separator or full date prefix like "2026-")
  if (time.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(time)) {
    return time;
  }
  // Bare time like "16:30" or "16:30:00" — combine with the provided date
  if (date && /^\d{2}:\d{2}/.test(time)) {
    const normalizedDate = date.length >= 10 ? date.substring(0, 10) : date;
    const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
    return `${normalizedDate}T${normalizedTime}`;
  }
  return time;
}

/**
 * Resolve attendee strings to email addresses.
 * Items containing '@' are used as-is; everything else is looked up in household members by name.
 */
async function resolveAttendeesToEmails(
  client: MynApiClient,
  attendees: string[]
): Promise<string[]> {
  const emails: string[] = [];
  const namesToResolve: string[] = [];

  for (const attendee of attendees) {
    if (attendee.includes('@')) {
      emails.push(attendee);
    } else {
      namesToResolve.push(attendee.toLowerCase());
    }
  }

  if (namesToResolve.length === 0) {
    return emails;
  }

  try {
    const household = await client.get<{ id: string }>('/api/v1/households/current');
    if (household?.id) {
      const membersData = await client.get<{
        members: Array<{ name: string; email: string }>;
      }>(`/api/v1/households/${household.id}/members`);

      const members = membersData?.members ?? [];
      for (const name of namesToResolve) {
        const matched = members.find(m => {
          const memberName = m.name.toLowerCase();
          const firstName = memberName.split(' ')[0];
          return memberName.includes(name) || name.includes(firstName);
        });
        if (matched?.email) {
          emails.push(matched.email);
        }
      }
    }
  } catch {
    // Household lookup failed; proceed with email-only list
  }

  return emails;
}

async function createEvent(client: MynApiClient, input: CalendarInput) {
  if (!input.title) {
    return errorResult('title is required for create_event action');
  }
  if (!input.startTime) {
    return errorResult('startTime is required for create_event action (ISO 8601 format, e.g. "2026-03-08T16:30:00")');
  }
  if (!input.isAllDay && !input.endTime) {
    return errorResult('endTime is required for non-all-day events');
  }

  // Normalize datetime strings — handle bare times like "16:30" alongside a startDate
  const effectiveDate = input.startDate?.substring(0, 10);
  const startTime = toIsoDateTime(input.startTime, effectiveDate);
  const endTime = input.endTime ? toIsoDateTime(input.endTime, effectiveDate) : undefined;

  // Resolve attendees: names → emails via household members API
  const resolvedAttendees = input.attendees && input.attendees.length > 0
    ? await resolveAttendeesToEmails(client, input.attendees)
    : undefined;

  const body: Record<string, unknown> = {
    title: input.title,
    startTime,
    isAllDay: input.isAllDay ?? false
  };

  if (!input.isAllDay && endTime) body.endTime = endTime;
  if (input.description) body.description = input.description;
  if (input.location) body.location = input.location;
  if (input.calendarId) body.calendarId = input.calendarId;
  if (input.timezone) body.timezone = input.timezone;
  if (resolvedAttendees && resolvedAttendees.length > 0) body.attendees = resolvedAttendees;
  if (input.recurrence) body.recurrence = input.recurrence;

  const data = await client.post<unknown>('/api/v2/calendar/standalone-events', body);
  return jsonResult(data);
}

async function updateEvent(client: MynApiClient, input: CalendarInput) {
  if (!input.eventId) {
    return errorResult('eventId is required for update_event action');
  }

  const updates: Record<string, unknown> = {};

  if (input.newTitle) updates.title = input.newTitle;
  if (input.newDescription) updates.description = input.newDescription;
  if (input.newLocation) updates.location = input.newLocation;

  if (input.newStartTime) {
    const tz = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    updates.start = { dateTime: input.newStartTime, timeZone: tz };
  }
  if (input.newEndTime) {
    const tz = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    updates.end = { dateTime: input.newEndTime, timeZone: tz };
  }

  // Handle attendees: newAttendees replaces, addAttendees appends
  if (input.newAttendees && input.newAttendees.length > 0) {
    const emails = await resolveAttendeesToEmails(client, input.newAttendees);
    updates.attendees = emails.map(e => ({ email: e }));
  } else if (input.addAttendees && input.addAttendees.length > 0) {
    // For addAttendees, we need to get current attendees first, then merge
    // Google Calendar PATCH with attendees replaces the whole list, so we
    // fetch current event, merge, and send the full list
    try {
      const currentEvent = await client.get<{ attendees?: Array<{ email: string }> }>(
        `/api/v2/calendar/events/${input.eventId}`
      );
      const existingEmails = currentEvent?.attendees?.map(a => a.email) ?? [];
      const newEmails = await resolveAttendeesToEmails(client, input.addAttendees);
      const allEmails = [...new Set([...existingEmails, ...newEmails])];
      updates.attendees = allEmails.map(e => ({ email: e }));
    } catch {
      // If we can't fetch current event, just send the new attendees
      const emails = await resolveAttendeesToEmails(client, input.addAttendees);
      updates.attendees = emails.map(e => ({ email: e }));
    }
  }

  if (Object.keys(updates).length === 0) {
    return errorResult('No update fields provided. Use newTitle, newDescription, newLocation, newStartTime, newEndTime, newAttendees, or addAttendees.');
  }

  const calendarId = input.calendarId ?? 'primary';
  const data = await client.patch<unknown>(
    `/api/v2/calendar/standalone-events/${input.eventId}?calendarId=${encodeURIComponent(calendarId)}`,
    updates
  );
  return jsonResult({ updated: true, eventId: input.eventId, ...data as object });
}

async function deleteEvent(client: MynApiClient, input: CalendarInput) {
  if (!input.eventId) {
    return errorResult('eventId is required for delete_event action');
  }

  await client.delete(`/api/v2/calendar/events/${input.eventId}`);
  return jsonResult({ deleted: true, eventId: input.eventId });
}

async function getMeetings(client: MynApiClient, input: CalendarInput) {
  // Use the events endpoint with date range, then filter to events with attendees (meetings)
  const params = new URLSearchParams();

  const now = new Date();
  if (input.includePast) {
    // Include today's past events
    params.append('start', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
  } else {
    params.append('start', now.toISOString());
  }

  const daysAhead = input.daysAhead ?? 7;
  const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  params.append('end', endDate.toISOString());
  if (input.limit) params.append('limit', input.limit.toString());

  const queryString = `?${params.toString()}`;
  const data = await client.get<{
    events: Array<{ attendees?: unknown[] }>;
    total: number;
  }>(`/api/v2/calendar/events${queryString}`);

  // Filter to only events with attendees (actual meetings)
  if (data && data.events) {
    data.events = data.events.filter(e => e.attendees && Array.isArray(e.attendees) && e.attendees.length > 0);
    data.total = data.events.length;
  }

  return jsonResult(data);
}

export function registerCalendarTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_calendar',
    name: 'MYN Calendar',
    description: 'Manage calendar events and meetings. Actions: list_events, create_event, update_event, delete_event, meetings. For create_event: startTime must be ISO 8601 (e.g. "2026-03-08T16:30:00"). For update_event: pass eventId and any fields to change (newTitle, newDescription, newLocation, newStartTime, newEndTime, addAttendees). Attendees can be email addresses or household member first names.',
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
