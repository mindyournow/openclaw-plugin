import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAndSync, withSyncOnMismatch } from '../src/tools/syncOnMismatch.js';

/**
 * Tests for syncOnMismatch middleware — auto capability re-sync on hash mismatch.
 * MIN-734
 */

const MANIFEST = {
  schemaVersion: '1.0',
  agentInfo: { name: 'test-agent', version: '1.0.0' },
  capabilities: [{ id: 'web-search', name: 'Web Search' }],
};

describe('checkAndSync', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('does not fetch when capabilityUpdatePending is false', () => {
    checkAndSync({ capabilityUpdatePending: false }, 'https://api.example.com', 'key-abc', MANIFEST);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when response is null', () => {
    checkAndSync(null, 'https://api.example.com', 'key-abc', MANIFEST);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when capabilityUpdatePending is missing', () => {
    checkAndSync({ status: 'ok' }, 'https://api.example.com', 'key-abc', MANIFEST);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('triggers fetch to /a2a/message when capabilityUpdatePending is true', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'received' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    checkAndSync({ capabilityUpdatePending: true }, 'https://api.example.com', 'key-abc', MANIFEST);

    // Allow the micro-task (fire-and-forget promise) to execute
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/a2a/message');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-Agent-Key']).toBe('key-abc');
    const body = JSON.parse(opts.body);
    expect(body.intent).toBe('briefing');
    expect(body.meta?.type).toBe('capability-update');
    expect(body.capabilityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('strips trailing slash from base URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    checkAndSync({ capabilityUpdatePending: true }, 'https://api.example.com/', 'key-abc', MANIFEST);
    await new Promise(resolve => setTimeout(resolve, 10));

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/a2a/message');
  });
});

describe('withSyncOnMismatch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns the result of the wrapped fetchFn', async () => {
    const fakeResult = { status: 'ok', capabilityUpdatePending: false };
    const result = await withSyncOnMismatch(
      async () => fakeResult,
      'https://api.example.com',
      'key-abc',
      MANIFEST,
    );
    expect(result).toEqual(fakeResult);
  });

  it('passes through result even when sync is triggered', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    const fakeResult = { status: 'ok', capabilityUpdatePending: true, from: 'kaia-myn' };
    const result = await withSyncOnMismatch(
      async () => fakeResult,
      'https://api.example.com',
      'key-abc',
      MANIFEST,
    );

    expect(result).toEqual(fakeResult);

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not trigger sync when capabilityUpdatePending is false', async () => {
    const result = await withSyncOnMismatch(
      async () => ({ status: 'ok', capabilityUpdatePending: false }),
      'https://api.example.com',
      'key-abc',
      MANIFEST,
    );
    expect(result.status).toBe('ok');
    expect(fetch).not.toHaveBeenCalled();
  });
});
