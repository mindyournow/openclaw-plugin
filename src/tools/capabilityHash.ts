/**
 * MIN-734: Deterministic capability manifest hash computation.
 *
 * Matches the server-side CapabilityHashService.java implementation:
 * - Deep-sort all object keys alphabetically (recursive)
 * - Serialize to JSON string
 * - SHA-256 hex digest
 *
 * Uses the same approach as fast-json-stable-stringify for cross-platform consistency.
 */

import { createHash } from 'crypto';

/**
 * Deep-sort an object's keys alphabetically (recursive).
 * Arrays are left in their natural order; only object keys are sorted.
 */
function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Compute a deterministic SHA-256 hash of a capability manifest.
 *
 * @param manifest - The capability manifest object (any structure)
 * @returns lowercase hex SHA-256 string
 *
 * @example
 * const hash = computeCapabilityHash({
 *   schemaVersion: '1.0',
 *   capabilities: [{ id: 'web-search', name: 'Web Search' }],
 *   agentInfo: { name: 'my-agent', version: '1.0.0' },
 * });
 * // => "a3f2...c8d1" (64 hex chars)
 */
export function computeCapabilityHash(manifest: unknown): string {
  const sorted = deepSortKeys(manifest);
  const json = JSON.stringify(sorted);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}
