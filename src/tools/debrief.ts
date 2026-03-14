/**
 * myn_debrief tool - Daily Debrief generation and corrections
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const DebriefInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('status'),
    Type.Literal('generate'),
    Type.Literal('get'),
    Type.Literal('apply_correction'),
    Type.Literal('complete_session')
  ]),
  // generate parameters
  context: Type.Optional(Type.String({ description: 'Additional context for briefing generation' })),
  focusAreas: Type.Optional(Type.Array(Type.String())),
  // get parameters
  briefingId: Type.Optional(Type.String({ format: 'uuid' })),
  // apply_correction parameters
  correctionId: Type.Optional(Type.String({ format: 'uuid' })),
  correctionType: Type.Optional(Type.Union([
    Type.Literal('TASK_COMPLETED'),
    Type.Literal('TASK_MISSED'),
    Type.Literal('TASK_RESCHEDULED'),
    Type.Literal('TASK_ADDED'),
    Type.Literal('PRIORITY_CHANGED'),
    Type.Literal('OTHER')
  ])),
  correctionData: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  reason: Type.Optional(Type.String()),
  // complete_session parameters
  sessionSummary: Type.Optional(Type.String()),
  decisions: Type.Optional(Type.Array(Type.String()))
});

export type DebriefInput = typeof DebriefInputSchema.static;

export async function executeDebrief(
  client: MynApiClient,
  input: DebriefInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'status':
        return await getDebriefStatus(client);
      case 'generate':
        return await generateDebrief(client, input);
      case 'get':
        return await getDebrief(client, input);
      case 'apply_correction':
        return await applyCorrection(client, input);
      case 'complete_session':
        return await completeSession(client, input);
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

async function getDebriefStatus(client: MynApiClient) {
  const data = await client.get<{
    hasActiveSession: boolean;
    sessionId?: string;
    lastDebriefId?: string;
    lastDebriefTime?: string;
    pendingCorrections: number;
  }>('/api/v2/debrief/status');
  return jsonResult(data);
}

async function generateDebrief(client: MynApiClient, input: DebriefInput) {
  const body: Record<string, unknown> = {};

  if (input.context) body.context = input.context;
  if (input.focusAreas && input.focusAreas.length > 0) body.focusAreas = input.focusAreas;

  const data = await client.post<{
    debriefId: string;
    sessionId: string;
    summary: string;
    criticalNow: unknown[];
    opportunityNow: unknown[];
    overTheHorizon: unknown[];
    upcomingMeetings: unknown[];
    habitsDue: unknown[];
    suggestions: string[];
    createdAt: string;
  }>('/api/v2/debrief/generate', body);
  return jsonResult(data);
}

async function getDebrief(client: MynApiClient, input: DebriefInput) {
  if (!input.briefingId) {
    // Get the latest debrief if no ID provided
    const data = await client.get<unknown>('/api/v2/debrief/current');
    return jsonResult(data);
  }

  // No per-ID endpoint exists; use /current for the active debrief or /history for past ones
  const data = await client.get<unknown>('/api/v2/debrief/current');
  return jsonResult(data);
}

async function applyCorrection(client: MynApiClient, input: DebriefInput) {
  if (!input.correctionType) {
    return errorResult('correctionType is required for apply_correction action');
  }

  const body: Record<string, unknown> = {
    type: input.correctionType
  };

  if (input.correctionData) body.data = input.correctionData;
  if (input.reason) body.reason = input.reason;

  const data = await client.post<{
    correctionId: string;
    appliedAt: string;
    debriefUpdated: boolean;
  }>('/api/v2/debrief/corrections/apply', body);
  return jsonResult(data);
}

async function completeSession(client: MynApiClient, input: DebriefInput) {
  const body: Record<string, unknown> = {};

  if (input.sessionSummary) body.summary = input.sessionSummary;
  if (input.decisions) body.decisions = input.decisions;

  const data = await client.post<{
    sessionId: string;
    completedAt: string;
    nextSessionRecommended?: string;
    followUps: unknown[];
  }>('/api/v2/debrief/complete', body);
  return jsonResult(data);
}

export function registerDebriefTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_debrief',
    name: 'MYN Daily Debrief',
    description: 'Generate and manage Daily Debrief sessions. Actions: status, generate, get, apply_correction, complete_session.',
    inputSchema: DebriefInputSchema,
    async execute(input: unknown) {
      return executeDebrief(client, input as DebriefInput);
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
