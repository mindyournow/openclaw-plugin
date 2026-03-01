/**
 * MYN API Client
 * Shared HTTP client for all MYN tools with X-API-KEY authentication
 */

export interface MynApiClientOptions {
  baseUrl: string;
  apiKey: string;
}

export class MynApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'X-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const fetchOptions: RequestInit = {
      method,
      headers
    };

    if (body !== undefined && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (error) {
      throw new MynApiError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        0
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    // Handle error responses
    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch {
        errorBody = 'Unable to read error response';
      }
      throw new MynApiError(
        `HTTP ${response.status}: ${errorBody || response.statusText}`,
        response.status,
        errorBody
      );
    }

    // Parse JSON response
    try {
      return await response.json() as T;
    } catch (error) {
      // Handle non-JSON success responses
      return undefined as T;
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

export class MynApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = 'MynApiError';
  }
}

/**
 * Helper to create a standardized tool result
 */
export function jsonResult<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

/**
 * Helper to create a standardized error result
 */
export function errorResult(message: string, details?: unknown): { success: false; error: string; details?: unknown } {
  return { success: false, error: message, details };
}
