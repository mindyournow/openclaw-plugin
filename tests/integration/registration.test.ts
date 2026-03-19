/**
 * Integration tests for plugin registration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the module before importing
vi.mock('../../src/client.js', () => ({
  MynApiClient: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  })),
  MynApiError: class MynApiError extends Error {
    constructor(message: string, public statusCode: number) {
      super(message);
    }
  },
  jsonResult: vi.fn((data) => ({ success: true, data })),
  errorResult: vi.fn((error) => ({ success: false, error }))
}));

// Import after mocking
const { MynApiClient } = await import('../../src/client.js');

describe('Plugin Registration', () => {
  let mockApi: {
    registerTool: ReturnType<typeof vi.fn>;
    logger: {
      debug: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };
    pluginConfig?: Record<string, unknown>;
  };

  beforeEach(() => {
    mockApi = {
      registerTool: vi.fn(),
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    };
    vi.clearAllMocks();
  });

  describe('without apiKey', () => {
    it('should warn and not register tools when apiKey is missing', async () => {
      const plugin = await import('../../index.js');

      mockApi.pluginConfig = {};

      plugin.default.register(mockApi as unknown as OpenClawPluginApi);

      expect(mockApi.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('apiKey not configured')
      );
      expect(mockApi.registerTool).not.toHaveBeenCalled();
    });

    it('should warn when pluginConfig is undefined', async () => {
      const plugin = await import('../../index.js');

      mockApi.pluginConfig = undefined;

      plugin.default.register(mockApi as unknown as OpenClawPluginApi);

      expect(mockApi.logger.warn).toHaveBeenCalled();
    });
  });

  describe('with apiKey', () => {
    it('should register all 14 tools when apiKey is provided', async () => {
      const plugin = await import('../../index.js');

      mockApi.pluginConfig = {
        apiKey: 'test-api-key',
        baseUrl: 'https://api.mindyournow.com'
      };

      plugin.default.register(mockApi as unknown as OpenClawPluginApi);

      expect(mockApi.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Initializing Mind Your Now')
      );
      expect(mockApi.registerTool).toHaveBeenCalledTimes(14);
      expect(mockApi.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registered 14 tools')
      );
    });

    it('should use default baseUrl when not provided', async () => {
      const plugin = await import('../../index.js');

      mockApi.pluginConfig = {
        apiKey: 'test-api-key'
      };

      plugin.default.register(mockApi as unknown as OpenClawPluginApi);

      expect(MynApiClient).toHaveBeenCalledWith(
        'https://api.mindyournow.com',
        'test-api-key'
      );
    });

    it('should use custom baseUrl when provided', async () => {
      const plugin = await import('../../index.js');

      mockApi.pluginConfig = {
        apiKey: 'test-api-key',
        baseUrl: 'https://custom.api.com'
      };

      plugin.default.register(mockApi as unknown as OpenClawPluginApi);

      expect(MynApiClient).toHaveBeenCalledWith(
        'https://custom.api.com',
        'test-api-key'
      );
    });
  });

  describe('tool registration', () => {
    it('should register tools with correct IDs', async () => {
      const plugin = await import('../../index.js');

      mockApi.pluginConfig = { apiKey: 'test-key' };

      plugin.default.register(mockApi as unknown as OpenClawPluginApi);

      // The wrapper converts tool.id → name when calling api.registerTool
      const registeredNames = mockApi.registerTool.mock.calls.map(
        (call: [{ name: string }]) => call[0].name
      );

      expect(registeredNames).toContain('myn_tasks');
      expect(registeredNames).toContain('myn_debrief');
      expect(registeredNames).toContain('myn_calendar');
      expect(registeredNames).toContain('myn_habits');
      expect(registeredNames).toContain('myn_lists');
      expect(registeredNames).toContain('myn_search');
      expect(registeredNames).toContain('myn_timers');
      expect(registeredNames).toContain('myn_memory');
      expect(registeredNames).toContain('myn_profile');
      expect(registeredNames).toContain('myn_household');
      expect(registeredNames).toContain('myn_projects');
      expect(registeredNames).toContain('myn_planning');
    });

    it('should register tools with names and schemas', async () => {
      const plugin = await import('../../index.js');

      mockApi.pluginConfig = { apiKey: 'test-key' };

      plugin.default.register(mockApi as unknown as OpenClawPluginApi);

      // The wrapper maps internal ToolDefinition to OpenClaw's API format:
      // id → name, inputSchema → parameters
      mockApi.registerTool.mock.calls.forEach((call: [{ name: string; description: string; parameters: unknown; execute: unknown }]) => {
        const tool = call[0];
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
        expect(tool).toHaveProperty('execute');
        expect(typeof tool.execute).toBe('function');
      });
    });
  });
});

// Type for OpenClaw plugin API
interface OpenClawPluginApi {
  registerTool(tool: {
    id: string;
    name: string;
    description: string;
    inputSchema: unknown;
    execute: (input: unknown) => Promise<unknown>;
  }): void;
  logger: {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  pluginConfig?: Record<string, unknown>;
}
