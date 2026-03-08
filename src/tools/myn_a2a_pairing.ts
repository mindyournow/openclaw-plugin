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

export const MynA2APairingInputSchema = Type.Object({
  action: Type.Union([
    Type.Literal('redeem_invite'),
    Type.Literal('ping'),
    Type.Literal('send_message'),
    Type.Literal('get_agent_card'),
  ]),
  /** Base URL of the MYN instance (e.g. https://api.mindyournow.com) */
  mynBaseUrl: Type.String({ description: 'MYN API base URL' }),
  /** X-Agent-Key value for authenticated A2A requests (after pairing) */
  agentKey: Type.Optional(Type.String({ description: 'Agent key from redeem_invite response' })),
  // redeem_invite fields
  inviteCode: Type.Optional(Type.String({ description: 'Invite code from MYN Settings (e.g. ABC-12345)' })),
  agentName: Type.Optional(Type.String()),
  displayName: Type.Optional(Type.String()),
  outboundEndpoint: Type.Optional(Type.String({ description: 'HTTPS URL where MYN calls this agent' })),
  capabilities: Type.Optional(Type.Array(Type.Any(), { description: 'Capability objects for the manifest' })),
  // send_message fields
  intent: Type.Optional(Type.Union([Type.Literal('chat'), Type.Literal('briefing'), Type.Literal('ping')])),
  message: Type.Optional(Type.String()),
  conversationId: Type.Optional(Type.String()),
});

export type MynA2APairingInput = typeof MynA2APairingInputSchema.static;

async function a2aFetch(url: string, options: RequestInit): Promise<unknown> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.status === 204 ? null : response.json();
}

/**
 * Execute a MYN A2A pairing action.
 */
export async function myn_a2a_pairing(input: MynA2APairingInput): Promise<unknown> {
  const base = input.mynBaseUrl.replace(/\/$/, '');
  const caps = input.capabilities ?? [];

  try {
    switch (input.action) {
      case 'get_agent_card': {
        const data = await a2aFetch(`${base}/.well-known/agent.json`, { method: 'GET' });
        return jsonResult(data);
      }

      case 'redeem_invite': {
        if (!input.inviteCode || !input.agentName || !input.outboundEndpoint) {
          return errorResult('inviteCode, agentName, and outboundEndpoint are required');
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
          outboundEndpoint: input.outboundEndpoint,
          capabilityHash,
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
        if (!input.agentKey) return errorResult('agentKey is required for ping');
        const data = await a2aFetch(`${base}/a2a/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Agent-Key': input.agentKey },
          body: JSON.stringify({ from: input.agentName ?? 'openclaw', intent: 'ping' }),
        });
        return jsonResult(data);
      }

      case 'send_message': {
        if (!input.agentKey) return errorResult('agentKey is required for send_message');
        if (!input.message) return errorResult('message is required for send_message');

        const msgBody: Record<string, unknown> = {
          from: input.agentName ?? 'openclaw',
          intent: input.intent ?? 'chat',
          message: input.message,
        };
        if (input.conversationId) msgBody.conversationId = input.conversationId;

        if (caps.length > 0) {
          const manifest = {
            schemaVersion: '1.0',
            agentInfo: { name: input.agentName ?? 'openclaw', version: '1.0.0' },
            capabilities: caps,
          };
          msgBody.capabilityHash = computeCapabilityHash(manifest);
        }

        const data = await a2aFetch(`${base}/a2a/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Agent-Key': input.agentKey },
          body: JSON.stringify(msgBody),
        }) as { capabilityUpdatePending?: boolean } | null;

        return jsonResult(data);
      }

      default:
        return errorResult(`Unknown action: ${(input as { action: string }).action}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(`A2A request failed: ${msg}`);
  }
}
