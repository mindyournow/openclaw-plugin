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

// ---- MIN-740: Read-before-write guarded request helpers ----

interface StateHashResponse {
  stateHash?: string;
  [key: string]: unknown;
}

interface StaleStateErrorBody {
  error?: string;
  currentStateHash?: string;
  [key: string]: unknown;
}

/**
 * Perform a PATCH request with automatic read-before-write state hash enforcement.
 *
 * Flow:
 * 1. GET `getPath` (defaults to `path`) to obtain current `stateHash`
 * 2. PATCH `path` with `X-MYN-State-Hash` header
 * 3. On 409 (stale state): use the currentStateHash from the 409 body and retry once
 */
export async function guardedPatch<T>(
  client: MynApiClient,
  path: string,
  body: unknown,
  getPath?: string
): Promise<T> {
  return guardedWrite<T>(client, 'PATCH', path, body, getPath);
}

/**
 * Perform a PUT request with automatic read-before-write state hash enforcement.
 */
export async function guardedPut<T>(
  client: MynApiClient,
  path: string,
  body: unknown,
  getPath?: string
): Promise<T> {
  return guardedWrite<T>(client, 'PUT', path, body, getPath);
}

/**
 * Perform a POST request with automatic read-before-write state hash enforcement.
 */
export async function guardedPost<T>(
  client: MynApiClient,
  path: string,
  body: unknown,
  getPath?: string
): Promise<T> {
  return guardedWrite<T>(client, 'POST', path, body, getPath);
}

/**
 * Perform a DELETE request with automatic read-before-write state hash enforcement.
 */
export async function guardedDelete<T>(
  client: MynApiClient,
  path: string,
  getPath?: string
): Promise<T> {
  return guardedWrite<T>(client, 'DELETE', path, undefined, getPath);
}

async function guardedWrite<T>(
  client: MynApiClient,
  method: 'PATCH' | 'PUT' | 'POST' | 'DELETE',
  path: string,
  body: unknown,
  getPath?: string
): Promise<T> {
  const readPath = getPath ?? path;

  // Step 1: Read the current state to get the stateHash
  const current = await client.get<StateHashResponse>(readPath);
  let stateHash = current?.stateHash;

  // Step 2: Attempt the write with the state hash
  try {
    return await writeWithHash<T>(client, method, path, body, stateHash);
  } catch (err) {
    if (err instanceof MynApiError && err.statusCode === 409) {
      // Step 3: On conflict, extract current hash from 409 body and retry once
      try {
        const errorBody: StaleStateErrorBody = err.responseBody ? JSON.parse(err.responseBody) : {};
        if (errorBody.currentStateHash) {
          stateHash = errorBody.currentStateHash;
        } else {
          // Re-read to get fresh hash
          const fresh = await client.get<StateHashResponse>(readPath);
          stateHash = fresh?.stateHash;
        }
        return await writeWithHash<T>(client, method, path, body, stateHash);
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw err;
  }
}

async function writeWithHash<T>(
  client: MynApiClient,
  method: 'PATCH' | 'PUT' | 'POST' | 'DELETE',
  path: string,
  body: unknown,
  stateHash: string | undefined
): Promise<T> {
  // We need to inject the X-MYN-State-Hash header — use a special requestWithHeaders approach
  // Since MynApiClient doesn't expose header injection directly, we reconstruct the request
  const baseUrl = (client as unknown as { baseUrl: string }).baseUrl;
  const apiKey = (client as unknown as { apiKey: string }).apiKey;
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'X-API-KEY': apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  if (stateHash) {
    headers['X-MYN-State-Hash'] = stateHash;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    throw new MynApiError(
      `Network error: ${error instanceof Error ? error.message : String(error)}`,
      0
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

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

  try {
    return await response.json() as T;
  } catch {
    return undefined as T;
  }
}
