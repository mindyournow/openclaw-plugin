import { describe, it, expect } from 'vitest';
import { computeCapabilityHash } from '../src/tools/capabilityHash.js';

/**
 * Tests for computeCapabilityHash — deterministic SHA-256 of sorted capability manifest.
 * MIN-734
 */
describe('computeCapabilityHash', () => {
  it('returns a 64-char hex string', () => {
    const hash = computeCapabilityHash({ schemaVersion: '1.0' });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces the same hash for identical input', () => {
    const manifest = {
      schemaVersion: '1.0',
      agentInfo: { name: 'openclaw', version: '1.0.0' },
      capabilities: [{ id: 'web-search', name: 'Web Search' }],
    };
    const hash1 = computeCapabilityHash(manifest);
    const hash2 = computeCapabilityHash(manifest);
    expect(hash1).toBe(hash2);
  });

  it('produces the same hash regardless of key order in input', () => {
    const manifest1 = {
      schemaVersion: '1.0',
      agentInfo: { name: 'openclaw', version: '1.0.0' },
      capabilities: [],
    };
    const manifest2 = {
      capabilities: [],
      agentInfo: { version: '1.0.0', name: 'openclaw' },
      schemaVersion: '1.0',
    };
    expect(computeCapabilityHash(manifest1)).toBe(computeCapabilityHash(manifest2));
  });

  it('produces different hashes for different manifests', () => {
    const hash1 = computeCapabilityHash({ schemaVersion: '1.0' });
    const hash2 = computeCapabilityHash({ schemaVersion: '2.0' });
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty object', () => {
    const hash = computeCapabilityHash({});
    expect(hash).toHaveLength(64);
  });

  it('handles null values in manifest', () => {
    const hash = computeCapabilityHash({ field: null });
    expect(hash).toHaveLength(64);
  });

  it('preserves array element order (does not sort arrays)', () => {
    const manifest1 = { caps: ['a', 'b', 'c'] };
    const manifest2 = { caps: ['c', 'b', 'a'] };
    expect(computeCapabilityHash(manifest1)).not.toBe(computeCapabilityHash(manifest2));
  });

  it('deep-sorts nested object keys', () => {
    const manifest1 = {
      z: { b: 1, a: 2 },
      a: { y: 3, x: 4 },
    };
    const manifest2 = {
      a: { x: 4, y: 3 },
      z: { a: 2, b: 1 },
    };
    expect(computeCapabilityHash(manifest1)).toBe(computeCapabilityHash(manifest2));
  });
});
