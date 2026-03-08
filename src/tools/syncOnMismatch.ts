/**
 * syncOnMismatch — capability sync middleware for the A2A protocol.
 *
 * MIN-734: openclaw-a2a-lite-v1
 *
 * When MYN returns `capabilityUpdatePending: true` on any A2A response it means
 * the stored hash on the server side no longer matches OpenClaw's current
 * capabilities. This middleware wraps every A2A fetch call and automatically
 * re-sends the capability manifest whenever the flag is set.
 */

import { computeCapabilityHash } from './capabilityHash.js';

/** Shape of the A2A response body that carries the mismatch flag */
interface A2AResponseWithPending {
  capabilityUpdatePending?: boolean;
  [key: string]: unknown;
}

/** Minimal capability manifest shape — matches the server schema */
interface CapabilityManifest {
  schemaVersion: string;
  agentInfo: { name: string; version: string };
  capabilities: unknown[];
}

/**
 * sendCapabilityUpdate — POST the current capability manifest to MYN.
 * Called automatically by syncOnMismatch when capabilityUpdatePending is true.
 */
async function sendCapabilityUpdate(
  mynBaseUrl: string,
  agentKey: string,
  manifest: CapabilityManifest,
): Promise<void> {
  const base = mynBaseUrl.replace(/\/$/, '');
  const capabilityHash = computeCapabilityHash(manifest);

  const body = {
    from: manifest.agentInfo.name,
    intent: 'briefing',
    meta: { type: 'capability-update' },
    capabilityHash,
    capabilityManifest: manifest,
  };

  const response = await fetch(`${base}/a2a/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Key': agentKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Capability sync failed: HTTP ${response.status}: ${text}`);
  }
}

/**
 * withSyncOnMismatch — wraps an A2A fetch call with automatic capability re-sync.
 *
 * @param fetchFn        Function that performs the A2A request and returns the parsed JSON body.
 * @param mynBaseUrl     MYN API base URL (e.g. https://api.mindyournow.com).
 * @param agentKey       Current X-Agent-Key for authenticated requests.
 * @param manifest       Current capability manifest to send if a mismatch is detected.
 * @returns              The original response from fetchFn (the sync is a side-effect).
 *
 * @example
 * const response = await withSyncOnMismatch(
 *   () => a2aFetch(`${base}/a2a/message`, { method: 'POST', ... }),
 *   base, agentKey, manifest,
 * );
 */
export async function withSyncOnMismatch<T extends A2AResponseWithPending>(
  fetchFn: () => Promise<T>,
  mynBaseUrl: string,
  agentKey: string,
  manifest: CapabilityManifest,
): Promise<T> {
  const result = await fetchFn();

  if (result?.capabilityUpdatePending === true) {
    // Fire-and-forget: don't block the caller on the sync
    sendCapabilityUpdate(mynBaseUrl, agentKey, manifest).catch((err) => {
      console.warn('[syncOnMismatch] Capability sync failed:', err?.message ?? err);
    });
  }

  return result;
}

/**
 * checkAndSync — standalone helper to check a response and trigger a sync
 * if capabilityUpdatePending is true.  Use this when you already have the
 * response object and want to retrofit sync behaviour without restructuring
 * the call site.
 *
 * @example
 * const data = await a2aFetch(...);
 * checkAndSync(data, base, agentKey, manifest);
 * return data;
 */
export function checkAndSync(
  response: A2AResponseWithPending | null | undefined,
  mynBaseUrl: string,
  agentKey: string,
  manifest: CapabilityManifest,
): void {
  if (response?.capabilityUpdatePending === true) {
    sendCapabilityUpdate(mynBaseUrl, agentKey, manifest).catch((err) => {
      console.warn('[syncOnMismatch] Capability sync failed:', err?.message ?? err);
    });
  }
}
