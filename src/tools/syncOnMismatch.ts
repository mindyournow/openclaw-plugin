/**
 * syncOnMismatch — capability sync middleware for the A2A protocol.
 *
 * MIN-734: openclaw-a2a-lite-v1
 *
 * When MYN returns `capabilityUpdatePending: true` on any A2A response it means
 * the stored hash on the server side no longer matches OpenClaw's current
 * capabilities. This middleware wraps every A2A fetch call and automatically
 * re-sends the capability manifest whenever the flag is set.
 *
 * A per-key dedup guard prevents concurrent duplicate syncs from firing when
 * multiple requests arrive at nearly the same time.
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
 * In-flight dedup set: tracks `${agentKey}@${base}` to avoid sending duplicate
 * capability syncs when multiple A2A responses with capabilityUpdatePending=true
 * arrive before the first sync completes.
 */
const inFlightSyncs = new Set<string>();

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
  const dedupKey = `${agentKey}@${base}`;

  if (inFlightSyncs.has(dedupKey)) {
    return; // already syncing — skip duplicate
  }

  inFlightSyncs.add(dedupKey);
  try {
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
  } finally {
    inFlightSyncs.delete(dedupKey);
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

/** Exposed for testing only — clears the dedup set between tests */
export function _clearInFlightSyncsForTest(): void {
  inFlightSyncs.clear();
}
