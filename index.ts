/**
 * Mind Your Now - OpenClaw Plugin
 * @mindyournow/openclaw-plugin
 *
 * Main entry point that registers all 12 MYN tools with the OpenClaw agent.
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

export interface OpenClawPluginApi {
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

    // Register all 12 tools
    registerTasksTool(api, client);
    registerBriefingTool(api, client);
    registerCalendarTool(api, client);
    registerHabitsTool(api, client);
    registerListsTool(api, client);
    registerSearchTool(api, client);
    registerTimersTool(api, client);
    registerMemoryTool(api, client);
    registerProfileTool(api, client);
    registerHouseholdTool(api, client);
    registerProjectsTool(api, client);
    registerPlanningTool(api, client);

    api.logger.info('[myn] Registered 12 tools: tasks, briefing, calendar, habits, lists, search, timers, memory, profile, household, projects, planning');
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
