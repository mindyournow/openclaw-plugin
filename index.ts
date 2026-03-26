/**
 * Mind Your Now - OpenClaw Plugin
 * @mind-your-now/myn
 *
 * Main entry point that registers all 14 MYN tools with the OpenClaw agent
 * and injects Kaia's memories into the conversation via before_prompt_build hook.
 */

import { MynApiClient } from './src/client.js';
import { fetchMemoryContext, formatMemoriesForPrompt } from './src/memory-context.js';
import { registerTasksTool } from './src/tools/tasks.js';
import { registerDebriefTool } from './src/tools/debrief.js';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(hookName: string, handler: (...args: any[]) => any, opts?: { priority?: number }): void;
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

    // W1: Reject non-HTTPS base URLs (allow http://localhost for development)
    if (!baseUrl.startsWith('https://') && !baseUrl.startsWith('http://localhost')) {
      api.logger.warn(`[myn] baseUrl must use HTTPS (got: ${baseUrl}). MYN tools will not be registered.`);
      api.logger.warn('[myn] Set plugins.entries.myn.config.baseUrl to an https:// URL');
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

    // Register all 14 tools
    registerTasksTool(wrappedApi, client);
    registerDebriefTool(wrappedApi, client);
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

    api.logger.info('[myn] Registered 14 tools: tasks, debrief, calendar, habits, lists, search, timers, memory, profile, household, projects, planning, a2a_pairing, ynab');

    // Behavioral guidance — always injected before the conversation
    api.on('before_prompt_build', () => {
      return {
        prependContext: `## Mind Your Now — Agent Behavioral Guidelines

### Calendar Intelligence
- When creating events involving household members, use \`calendarName: "Family"\` or let the plugin auto-detect the family/shared calendar. Do NOT default to the personal "primary" calendar for shared events.
- When the user mentions someone by name in the context of a shared activity (e.g. "church with Martha", "dinner with family"), infer they should be included as attendees. However, if the context is about discussing someone (e.g. "prepare notes about John's review"), do NOT add them — use judgment about whether the person is a participant or a subject.
- Use \`list_calendars\` to discover available calendars if unsure which one to use.

### Task + Calendar Event Linking
- When creating a calendar event, ALSO create a linked task (via myn_tasks) unless the user explicitly says not to. Use the same calendarId for both.
- When creating a task for a specific date/time activity, ALSO create a calendar event for it.

### Scheduling Defaults
- ALWAYS set \`isAutoScheduled: true\` when creating tasks unless the user says otherwise.
- Pick appropriate \`scheduleNames\` based on when the task should happen. Common schedules: "Morning", "Afternoon", "Evening", "Daytime", "Weekdays", "Weekends". If no specific time is indicated, the system will apply the user's default schedule(s) automatically.
- Think about WHEN the task should happen: church on Sunday morning → ["Morning"], work meeting → ["Weekdays"], general errand → let the default apply.

### Household Awareness
- When a user mentions a family member by first name, recognize them as a household member.
- For shared activities, prefer the family calendar and include relevant household members as attendees.
`
      };
    }, { priority: 5 }); // Lower priority = runs first, before memories

    // MIN-801: Inject Kaia's memories into every conversation turn
    api.on('before_prompt_build', async (event: { prompt: string }) => {
      try {
        const memories = await fetchMemoryContext(client, event.prompt);
        if (!memories) return;
        const context = formatMemoriesForPrompt(memories);
        if (!context) return;
        return { prependContext: context };
      } catch (err) {
        api.logger.warn(`[myn] Memory context injection failed: ${err}`);
        return;
      }
    }, { priority: 10 });

    api.logger.info('[myn] Registered before_prompt_build hook for Kaia memory injection');
  }
};

// Re-export types and utilities for advanced usage
export { MynApiClient, MynApiError, jsonResult, errorResult } from './src/client.js';
export type { MynApiClientOptions } from './src/client.js';

// Re-export tool schemas for programmatic use
export { TasksInputSchema } from './src/tools/tasks.js';
export { DebriefInputSchema } from './src/tools/debrief.js';
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
export type { DebriefInput } from './src/tools/debrief.js';
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
