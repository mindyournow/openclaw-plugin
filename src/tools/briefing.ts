/**
 * myn_briefing tool - Compass briefing generation and corrections
 */

import { Type } from '@sinclair/typebox';
import type { MynApiClient } from '../client.js';
import { jsonResult, errorResult } from '../client.js';

export const BriefingInputSchema = Type.Object({
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

export type BriefingInput = typeof BriefingInputSchema.static;

export async function executeBriefing(
  client: MynApiClient,
  input: BriefingInput
): Promise<{ success: true; data: unknown } | { success: false; error: string; details?: unknown }> {
  try {
    switch (input.action) {
      case 'status':
        return await getBriefingStatus(client);
      case 'generate':
        return await generateBriefing(client, input);
      case 'get':
        return await getBriefing(client, input);
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

async function getBriefingStatus(client: MynApiClient) {
  const data = await client.get<{
    hasActiveSession: boolean;
    sessionId?: string;
    lastBriefingId?: string;
    lastBriefingTime?: string;
    pendingCorrections: number;
  }>('/api/v2/compass/status');
  return jsonResult(data);
}

async function generateBriefing(client: MynApiClient, input: BriefingInput) {
  const body: Record<string, unknown> = {};

  if (input.context) body.context = input.context;
  if (input.focusAreas && input.focusAreas.length > 0) body.focusAreas = input.focusAreas;

  const data = await client.post<{
    briefingId: string;
    sessionId: string;
    summary: string;
    criticalNow: unknown[];
    opportunityNow: unknown[];
    overTheHorizon: unknown[];
    upcomingMeetings: unknown[];
    habitsDue: unknown[];
    suggestions: string[];
    createdAt: string;
  }>('/api/v2/compass/generate', body);
  return jsonResult(data);
}

async function getBriefing(client: MynApiClient, input: BriefingInput) {
  if (!input.briefingId) {
    // Get the latest briefing if no ID provided
    const data = await client.get<unknown>('/api/v2/compass/current');
    return jsonResult(data);
  }

  // BP7: The backend has no per-ID endpoint — return an explicit error rather than silently ignoring the provided ID
  return errorResult(
    'Fetching a briefing by ID is not supported. The backend only exposes the current briefing. ' +
    'Use action "get" without briefingId to retrieve the current briefing.'
  );
}

async function applyCorrection(client: MynApiClient, input: BriefingInput) {
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
    briefingUpdated: boolean;
  }>('/api/v2/compass/corrections/apply', body);
  return jsonResult(data);
}

async function completeSession(client: MynApiClient, input: BriefingInput) {
  const body: Record<string, unknown> = {};

  if (input.sessionSummary) body.summary = input.sessionSummary;
  if (input.decisions) body.decisions = input.decisions;

  const data = await client.post<{
    sessionId: string;
    completedAt: string;
    nextSessionRecommended?: string;
    followUps: unknown[];
  }>('/api/v2/compass/complete', body);
  return jsonResult(data);
}

export function registerBriefingTool(api: OpenClawPluginApi, client: MynApiClient): void {
  api.registerTool({
    id: 'myn_briefing',
    name: 'MYN Briefing',
    description: 'Generate and manage Compass briefings. Actions: status, generate, get, apply_correction, complete_session.',
    inputSchema: BriefingInputSchema,
    async execute(input: unknown) {
      return executeBriefing(client, input as BriefingInput);
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
