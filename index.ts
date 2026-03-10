/**
 * Mind Your Now - OpenClaw Plugin
 * @mind-your-now/myn
 *
 * Main entry point that registers all 14 MYN tools with the OpenClaw agent.
 */

import { MynApiClient } from './src/client.js';
import { registerTasksTool } from './src/tools/tasks.js';
import { registerBriefingTool } from './src/tools/briefing.js';
import { registerCalendarTool } from './src/tools/calendar.js';
import { registerHabitsTool } from './src/tools/habits.js';
import { registerListsTool } from './src/tools/lists.js';
import { registerSearchTool } from './src/tools/search.js';
import { registerTimersTool } from './src/tools/timers.js';
import { registerMemoryTool } from './src/tools/memory.js';
import { registerProfileTool } from './src/tools/profile.js';
import { registerHouseholdTool } from './src/tools/household.js';
import { registerProjectsTool } from './src/tools/projects.js';
import { registerPlanningTool } from './src/tools/planning.js';
import { registerA2APairingTool } from './src/tools/myn_a2a_pairing.js';
import { registerYnabTool } from './src/tools/ynab.js';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (input: unknown) => Promise<unknown>;
}

export interface OpenClawPluginApi {
  registerTool(tool: ToolDefinition): void;
  logger: {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  pluginConfig?: Record<string, unknown>;
}

/**
 * Normalize JSON Schema for cross-provider compatibility.
 *
 * 1. JSON round-trip to strip TypeBox Symbol keys (Symbol(TypeBox.Kind))
 * 2. Convert anyOf/const unions → enum (Moonshot/Kimi, Google require this)
 * 3. Strip non-standard fields (format, patternProperties, minLength, maxLength)
 */
function normalizeSchema(schema: unknown): unknown {
  // JSON round-trip strips TypeBox Symbol keys and non-serializable metadata
  const clean = JSON.parse(JSON.stringify(schema));
  return deepNormalize(clean);
}

function deepNormalize(schema: unknown): unknown {
  if (schema === null || typeof schema !== 'object') return schema;
  const s = schema as Record<string, unknown>;

  // Convert anyOf of const literals → enum
  if (Array.isArray(s.anyOf)) {
    const allConst = s.anyOf.every(
      (item: unknown) => item !== null && typeof item === 'object' && 'const' in (item as Record<string, unknown>)
    );
    if (allConst) {
      const enumValues = s.anyOf.map((item: unknown) => (item as Record<string, unknown>).const);
      const { anyOf: _, ...rest } = s;
      return deepNormalize({ ...rest, type: 'string', enum: enumValues });
    }
  }

  // Keys that break cross-provider compatibility
  const skipKeys = new Set(['$schema', 'format', 'patternProperties', 'minLength', 'maxLength']);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(s)) {
    if (skipKeys.has(key)) continue;

    if (Array.isArray(value)) {
      result[key] = value.map((item: unknown) => deepNormalize(item));
    } else if (value !== null && typeof value === 'object') {
      result[key] = deepNormalize(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface MynPluginConfig {
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://api.mindyournow.com';

export default {
  id: 'myn',
  name: 'Mind Your Now',
  configSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        description: 'MYN API key with AGENT_FULL scope'
      },
      baseUrl: {
        type: 'string',
        description: 'MYN API base URL',
        default: DEFAULT_BASE_URL
      }
    },
    required: ['apiKey']
  },

  register(api: OpenClawPluginApi): void {
    const apiKey = api.pluginConfig?.apiKey as string | undefined;
    const baseUrl = (api.pluginConfig?.baseUrl as string) || DEFAULT_BASE_URL;

    if (!apiKey) {
      api.logger.warn('[myn] apiKey not configured; MYN tools will not be registered');
      api.logger.warn('[myn] Set plugins.entries.myn.config.apiKey in your OpenClaw config');
      return;
    }

    api.logger.info('[myn] Initializing Mind Your Now plugin...');

    // Create shared API client
    const client = new MynApiClient(baseUrl, apiKey);

    // Wrap registerTool to adapt our internal tool format to OpenClaw's plugin SDK:
    // - 'parameters' (not 'inputSchema') for the schema
    // - execute(_id, params) signature (not execute(input))
    // - Return { content: [{ type: "text", text }] } format
    // - Normalize TypeBox schemas for cross-provider compatibility
    const wrappedApi: OpenClawPluginApi = {
      ...api,
      registerTool(tool: ToolDefinition) {
        const origExecute = tool.execute;
        api.registerTool({
          name: tool.id,
          description: tool.description,
          parameters: normalizeSchema(tool.inputSchema),
          async execute(_id: string, params: unknown) {
            const result = await origExecute(params);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          },
        } as unknown as ToolDefinition);
      },
    };

    // Register all 13 tools
    registerTasksTool(wrappedApi, client);
    registerBriefingTool(wrappedApi, client);
    registerCalendarTool(wrappedApi, client);
    registerHabitsTool(wrappedApi, client);
    registerListsTool(wrappedApi, client);
    registerSearchTool(wrappedApi, client);
    registerTimersTool(wrappedApi, client);
    registerMemoryTool(wrappedApi, client);
    registerProfileTool(wrappedApi, client);
    registerHouseholdTool(wrappedApi, client);
    registerProjectsTool(wrappedApi, client);
    registerPlanningTool(wrappedApi, client);
    registerA2APairingTool(wrappedApi, baseUrl);
    registerYnabTool(wrappedApi, client);

    api.logger.info('[myn] Registered 14 tools: tasks, briefing, calendar, habits, lists, search, timers, memory, profile, household, projects, planning, a2a_pairing, ynab');
  }
};

// Re-export types and utilities for advanced usage
export { MynApiClient, MynApiError, jsonResult, errorResult } from './src/client.js';
export type { MynApiClientOptions } from './src/client.js';

// Re-export tool schemas for programmatic use
export { TasksInputSchema } from './src/tools/tasks.js';
export { BriefingInputSchema } from './src/tools/briefing.js';
export { CalendarInputSchema } from './src/tools/calendar.js';
export { HabitsInputSchema } from './src/tools/habits.js';
export { ListsInputSchema } from './src/tools/lists.js';
export { SearchInputSchema } from './src/tools/search.js';
export { TimersInputSchema } from './src/tools/timers.js';
export { MemoryInputSchema } from './src/tools/memory.js';
export { ProfileInputSchema } from './src/tools/profile.js';
export { HouseholdInputSchema } from './src/tools/household.js';
export { ProjectsInputSchema } from './src/tools/projects.js';
export { PlanningInputSchema } from './src/tools/planning.js';
export { MynA2APairingInputSchema } from './src/tools/myn_a2a_pairing.js';
export { YnabInputSchema } from './src/tools/ynab.js';

// Type-only exports
export type { TasksInput } from './src/tools/tasks.js';
export type { BriefingInput } from './src/tools/briefing.js';
export type { CalendarInput } from './src/tools/calendar.js';
export type { HabitsInput } from './src/tools/habits.js';
export type { ListsInput } from './src/tools/lists.js';
export type { SearchInput } from './src/tools/search.js';
export type { TimersInput } from './src/tools/timers.js';
export type { MemoryInput } from './src/tools/memory.js';
export type { ProfileInput } from './src/tools/profile.js';
export type { HouseholdInput } from './src/tools/household.js';
export type { ProjectsInput } from './src/tools/projects.js';
export type { PlanningInput } from './src/tools/planning.js';
export type { MynA2APairingInput } from './src/tools/myn_a2a_pairing.js';
export type { YnabInput } from './src/tools/ynab.js';
