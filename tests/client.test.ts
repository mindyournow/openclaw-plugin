/**
 * Tests for MYN API Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MynApiClient, MynApiError, jsonResult, errorResult } from '../src/client.js';

describe('MynApiClient', () => {
  const mockFetch = vi.fn();
  let client: MynApiClient;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    client = new MynApiClient('https://api.mindyournow.com', 'test-api-key');
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('should remove trailing slash from baseUrl', () => {
      const clientWithSlash = new MynApiClient('https://api.mindyournow.com/', 'key');
      expect(clientWithSlash).toBeDefined();
    });
  });

  describe('GET requests', () => {
    it('should make GET request with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' })
      });

      await client.get('/test-path');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mindyournow.com/test-path',
        {
          method: 'GET',
          headers: {
            'X-API-KEY': 'test-api-key',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
    });

    it('should return parsed JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '123', name: 'Test' })
      });

      const result = await client.get('/test');

      expect(result).toEqual({ id: '123', name: 'Test' });
    });
  });

  describe('POST requests', () => {
    it('should make POST request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ created: true })
      });

      const body = { title: 'Test Task' };
      await client.post('/tasks', body);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mindyournow.com/tasks',
        {
          method: 'POST',
          headers: {
            'X-API-KEY': 'test-api-key',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(body)
        }
      );
    });
  });

  describe('PUT requests', () => {
    it('should make PUT request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ updated: true })
      });

      const body = { status: 'completed' };
      await client.put('/tasks/123', body);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mindyournow.com/tasks/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(body)
        })
      );
    });
  });

  describe('PATCH requests', () => {
    it('should make PATCH request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ patched: true })
      });

      await client.patch('/tasks/123', { priority: 'high' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mindyournow.com/tasks/123',
        expect.objectContaining({
          method: 'PATCH'
        })
      );
    });
  });

  describe('DELETE requests', () => {
    it('should make DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      await client.delete('/tasks/123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mindyournow.com/tasks/123',
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });

  describe('error handling', () => {
    it('should throw MynApiError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Resource not found')
      });

      await expect(client.get('/missing')).rejects.toThrow(MynApiError);
    });

    it('should include status code in error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key')
      });

      try {
        await client.get('/protected');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MynApiError);
        expect((error as MynApiError).statusCode).toBe(401);
      }
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(client.get('/test')).rejects.toThrow('Network error');
    });

    it('should handle 204 No Content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      });

      const result = await client.delete('/tasks/123');
      expect(result).toBeUndefined();
    });
  });
});

describe('jsonResult', () => {
  it('should return success result with data', () => {
    const data = { id: '123', name: 'Test' };
    const result = jsonResult(data);

    expect(result).toEqual({
      success: true,
      data
    });
  });
});

describe('errorResult', () => {
  it('should return error result with message', () => {
    const result = errorResult('Something went wrong');

    expect(result).toEqual({
      success: false,
      error: 'Something went wrong'
    });
  });

  it('should include details when provided', () => {
    const details = { field: 'title', issue: 'required' };
    const result = errorResult('Validation failed', details);

    expect(result).toEqual({
      success: false,
      error: 'Validation failed',
      details
    });
  });
});
