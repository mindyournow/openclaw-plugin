/**
 * myn_a2a_pairing tool — Pair OpenClaw with MYN/Kaia via the A2A protocol.
 *
 * MIN-734: openclaw-a2a-lite-v1
 *
 * This tool uses direct fetch() calls because A2A authentication uses a
 * separate key mechanism (X-Agent-Key) from the standard API key (X-API-KEY).
 */

import { Type } from '@sinclair/typebox';
import { errorResult, jsonResult } from '../client.js';
import { computeCapabilityHash } from './capabilityHash.js';
import { checkAndSync } from './syncOnMismatch.js';

export const MynA2APairingInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('redeem_invite'),
    Type.Literal('ping'),
    Type.Literal('send_message'),
    Type.Literal('get_agent_card'),
  ]),
  /** X-Agent-Key value for authenticated A2A requests (after pairing) */
  agentKey: Type.Optional(Type.String({ description: 'Agent key from redeem_invite response' })),
  // redeem_invite fields
  inviteCode: Type.Optional(Type.String({ description: 'Invite code from MYN Settings (e.g. ABC-12345)' })),
  agentName: Type.Optional(Type.String({ description: 'Lowercase alphanumeric agent name (e.g. "openclaw")' })),
  displayName: Type.Optional(Type.String()),
  outboundEndpoint: Type.Optional(Type.String({ description: 'HTTPS URL where MYN calls this agent (optional — use "none" if not available)' })),
  capabilities: Type.Optional(Type.Array(Type.Any(), { description: 'Capability objects for the manifest' })),
  // send_message fields
  intent: Type.Optional(Type.Union([Type.Literal('chat'), Type.Literal('briefing'), Type.Literal('ping')])),
  message: Type.Optional(Type.String()),
  conversationId: Type.Optional(Type.String()),
});

export type MynA2APairingInput = typeof MynA2APairingInputSchema.static;

// OpenClaw plugin API interface (matches pattern from other tools)
interface OpenClawPluginApi {
  registerTool(tool: {
    id: string;
    name: string;
    description: string;
    inputSchema: unknown;
    execute: (input: unknown) => Promise<unknown>;
  }): void;
}

/**
 * Register the A2A pairing tool with the plugin API.
 * @param baseUrl - The MYN API base URL from plugin config (e.g. https://api.mindyournow.com)
 */
export function registerA2APairingTool(api: OpenClawPluginApi, baseUrl: string): void {
  api.registerTool({
    id: 'myn_a2a_pairing',
    name: 'MYN A2A Pairing',
    description: `Pair OpenClaw with MYN/Kaia via A2A protocol. The MYN API URL is already configured — do NOT guess or change it.

IMPORTANT: If this tool returns an error, STOP IMMEDIATELY and report the error to the user. Do NOT retry with different URLs or parameters. Do NOT try to discover endpoints. The configuration is correct; errors mean something else is wrong.

Actions:
- redeem_invite: Redeem an invite code. Required: inviteCode, agentName. Optional: outboundEndpoint, displayName, capabilities.
- ping: Ping MYN after pairing. Required: agentKey.
- send_message: Send a message. Required: agentKey, message.
- get_agent_card: Fetch MYN's agent card (no auth needed).

For redeem_invite, use agentName "openclaw" and outboundEndpoint "none" if no public endpoint is available.`,
    inputSchema: MynA2APairingInputSchema,
    async execute(input: unknown) {
      return myn_a2a_pairing(input as MynA2APairingInput, baseUrl);
    }
  });
}

async function a2aFetch(url: string, options: RequestInit): Promise<unknown> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.status === 204 ? null : response.json();
}

/** Invite code pattern: 3 uppercase letters, dash, 5 digits (e.g. ABC-12345) */
const INVITE_CODE_REGEX = /^[A-Z]{3}-\d{5}$/;

/** Agent name pattern: lowercase alphanumeric and hyphens only */
const AGENT_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]$/;

/**
 * Execute a MYN A2A pairing action.
 */
export async function myn_a2a_pairing(input: MynA2APairingInput, configuredBaseUrl?: string): Promise<unknown> {
  const rawBase = (configuredBaseUrl ?? 'https://api.mindyournow.com').replace(/\/$/, '');
  const caps = input.capabilities ?? [];

  // W5: Reject non-HTTPS base URLs (allow http://localhost for development)
  if (!rawBase.startsWith('https://') && !rawBase.startsWith('http://localhost')) {
    return errorResult(`STOP: baseUrl must use HTTPS (got: ${rawBase}). The API URL is pre-configured — contact support if you believe this is an error.`);
  }

  const base = rawBase;

  try {
    switch (input.action) {
      case 'get_agent_card': {
        const data = await a2aFetch(`${base}/.well-known/agent.json`, { method: 'GET' });
        return jsonResult(data);
      }

      case 'redeem_invite': {
        if (!input.inviteCode || !input.agentName) {
          return errorResult('STOP: inviteCode and agentName are required. Do not retry — ask the user for the missing values.');
        }
        // BP5: Validate invite code and agent name formats
        if (!INVITE_CODE_REGEX.test(input.inviteCode)) {
          return errorResult('STOP: inviteCode must be in the format ABC-12345 (3 uppercase letters, dash, 5 digits). Ask the user for the correct invite code from MYN Settings.');
        }
        if (!AGENT_NAME_REGEX.test(input.agentName)) {
          return errorResult('STOP: agentName must be lowercase alphanumeric with optional hyphens (e.g. "openclaw"). Do not retry with a different format.');
        }

        const manifest = {
          schemaVersion: '1.0',
          agentInfo: { name: input.agentName, version: '1.0.0' },
          capabilities: caps,
        };
        const capabilityHash = computeCapabilityHash(manifest);

        const body = {
          inviteCode: input.inviteCode,
          agentName: input.agentName,
          displayName: input.displayName ?? input.agentName,
          outboundEndpoint: input.outboundEndpoint || 'none',
          capabilityHash,
          capabilityManifest: manifest,
        };

        const data = await a2aFetch(`${base}/api/v1/agent/redeem-invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        return jsonResult({
          ...(data as object),
          capabilityHash,
          note: 'Store mynInboundKey securely — use it as agentKey in future calls.',
        });
      }

      case 'ping': {
        if (!input.agentKey) return errorResult('STOP: agentKey is required for ping. This comes from the redeem_invite response (mynInboundKey).');
        const pingData = await a2aFetch(`${base}/a2a/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Agent-Key': input.agentKey },
          body: JSON.stringify({ from: input.agentName ?? 'openclaw', intent: 'ping' }),
        }) as { capabilityUpdatePending?: boolean } | null;

        // Ping responses also carry capabilityUpdatePending — sync if flagged
        if (caps.length > 0) {
          const pingManifest = {
            schemaVersion: '1.0',
            agentInfo: { name: input.agentName ?? 'openclaw', version: '1.0.0' },
            capabilities: caps,
          };
          checkAndSync(pingData, base, input.agentKey, pingManifest);
        }

        return jsonResult(pingData);
      }

      case 'send_message': {
        if (!input.agentKey) return errorResult('STOP: agentKey is required for send_message.');
        if (!input.message) return errorResult('STOP: message is required for send_message.');

        const msgBody: Record<string, unknown> = {
          from: input.agentName ?? 'openclaw',
          intent: input.intent ?? 'chat',
          message: input.message,
        };
        if (input.conversationId) msgBody.conversationId = input.conversationId;

        const manifest = caps.length > 0 ? {
          schemaVersion: '1.0',
          agentInfo: { name: input.agentName ?? 'openclaw', version: '1.0.0' },
          capabilities: caps,
        } : null;

        if (manifest) {
          msgBody.capabilityHash = computeCapabilityHash(manifest);
        }

        const data = await a2aFetch(`${base}/a2a/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Agent-Key': input.agentKey },
          body: JSON.stringify(msgBody),
        }) as { capabilityUpdatePending?: boolean } | null;

        // Auto-sync capabilities when server signals a hash mismatch — MIN-734
        if (manifest) {
          checkAndSync(data, base, input.agentKey, manifest);
        }

        return jsonResult(data);
      }

      default:
        return errorResult(`Unknown action: ${(input as { action: string }).action}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(`STOP: A2A request failed: ${msg}. Do NOT retry with different URLs — the API URL is pre-configured. Report this error to the user.`);
  }
}
