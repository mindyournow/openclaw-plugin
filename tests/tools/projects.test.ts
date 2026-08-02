import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MynApiClient } from '../../src/client.js';
import { executeProjects } from '../../src/tools/projects.js';

describe('myn_projects', () => {
  const mockFetch = vi.fn();
  let client: MynApiClient;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    client = new MynApiClient('https://api.mindyournow.com', 'test-key');
    mockFetch.mockClear();
  });

  it('lists projects with a limit and unwraps the projects envelope', async () => {
    const projects = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'ALL',
        customName: 'All tasks',
        customEmoji: '📁',
        hideTasksInMainList: false
      }
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        projects,
        total: 1,
        limit: 50,
        offset: 0,
        hasMore: false
      })
    });

    const result = await executeProjects(client, {
      action: 'list',
      includeArchived: true,
      includeStats: true
    });

    expect(result).toEqual({ success: true, data: projects });
    expect(mockFetch.mock.calls[0][0]).toContain('limit=50');
    expect(mockFetch.mock.calls[0][0]).toContain('includeArchived=true');
    expect(mockFetch.mock.calls[0][0]).toContain('includeStats=true');
  });
});
