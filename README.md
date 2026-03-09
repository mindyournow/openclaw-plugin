# @mind-your-now/openclaw-plugin

[![npm version](https://badge.fury.io/js/@mindyournow%2Fopenclaw-plugin.svg)](https://badge.fury.io/js/@mindyournow%2Fopenclaw-plugin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> OpenClaw plugin for Mind Your Now - AI-powered task and life management

## Overview

This plugin integrates [Mind Your Now](https://mindyournow.com) (MYN) with [OpenClaw](https://openclaw.dev) agents, enabling AI assistants to manage tasks, calendar, habits, and more using the MYN productivity methodology.

## Features

- **12 powerful tools** for complete MYN integration
- **Urgency-based prioritization** following the MYN methodology
- **Shared API client** with automatic authentication
- **Built-in skill companion** for workflow guidance
- **TypeScript-first** with full type safety
- **Comprehensive test coverage**

## Installation

```bash
# Install via OpenClaw
openclaw plugins install @mind-your-now/openclaw-plugin

# Or via npm
npm install @mind-your-now/openclaw-plugin
```

## Configuration

Add to your OpenClaw configuration:

```yaml
plugins:
  entries:
    myn:
      enabled: true
      config:
        apiKey: "your-myn-api-key"  # Required: API key with AGENT_FULL scope
        baseUrl: "https://api.mindyournow.com"  # Optional: defaults to production
```

### Getting an API Key

1. Log into your Mind Your Now account
2. Go to Settings → API Keys
3. Generate a new key with `AGENT_FULL` scope

## Tools Reference

### myn_tasks
Manage tasks, habits, and chores.

```yaml
action: list | get | create | update | complete | archive | search
```

**Examples:**
```yaml
# List critical tasks
action: list
priority: CRITICAL
status: PENDING

# Create a task
action: create
id: "550e8400-e29b-41d4-a716-446655440000"  # Client-generated UUID
title: "Finish quarterly report"
taskType: TASK
priority: CRITICAL
startDate: "2026-03-01"
duration: "2h"
```

### myn_briefing
Generate and manage Compass briefings.

```yaml
action: status | generate | get | apply_correction | complete_session
```

**Examples:**
```yaml
# Generate morning briefing
action: generate
context: "Morning planning session"
focusAreas:
  - work
  - health
```

### myn_calendar
Manage calendar events and meetings.

```yaml
action: list_events | create_event | delete_event | meetings
```

**Examples:**
```yaml
# Create an event
action: create_event
title: "Team Standup"
startTime: "2026-03-01T09:00:00Z"
endTime: "2026-03-01T09:30:00Z"
```

### myn_habits
Track habits, streaks, and reminders.

```yaml
action: streaks | skip | chains | schedule | reminders
```

### myn_lists
Manage grocery and shopping lists.

```yaml
action: get | add | toggle | bulk_add | convert_to_tasks
```

### myn_search
Unified search across tasks, events, notes, and memories.

```yaml
action: search
query: "quarterly report"
types:
  - task
  - event
```

### myn_timers
Manage countdowns, alarms, and pomodoro sessions.

```yaml
action: create_countdown | create_alarm | list | cancel | snooze | pomodoro
```

**Examples:**
```yaml
# Create a pomodoro session
action: pomodoro
workDuration: 25
breakDuration: 5
sessions: 4

# Create a countdown
action: create_countdown
durationMinutes: 30
label: "Focus time"
```

### myn_memory
Store and retrieve agent memories.

```yaml
action: remember | recall | forget | search
```

**Examples:**
```yaml
# Remember user preference
action: remember
content: "User prefers morning meetings before 10am"
category: user_preference
tags: ["meetings", "preferences"]
importance: medium
```

### myn_profile
Manage user profile, goals, and preferences.

```yaml
action: get_info | get_goals | update_goals | preferences
```

### myn_household
Manage household members, invites, and chores.

```yaml
action: members | invite | chores | chore_schedule | chore_complete
```

### myn_projects
Manage projects and categories.

```yaml
action: list | get | create | move_task
```

### myn_planning
AI-powered planning and scheduling.

```yaml
action: plan | schedule_all | reschedule
```

## The MYN Methodology

Mind Your Now uses **urgency-based prioritization** rather than traditional importance-based systems.

### Critical Now (≤ 5 items)
The "Going Home Test": "Would you work until midnight to finish this?"
- If NO → It's not Critical Now
- If YES → It belongs here
- **Maximum 5 items** - More than 5 and things slip

### Opportunity Now (≤ 20 items)
Tasks you'd like to do soon but aren't burning. The max you can scan in one glance.

### Over-the-Horizon (10+ days out)
Items with start dates 10+ days in the future. This gets them OFF your mental radar so you can focus.

### Parking Lot
Low urgency tasks that don't fit elsewhere.

## Task Creation Rules

When creating tasks, you MUST provide:

| Field | Description |
|-------|-------------|
| `id` | Client-generated UUID (`crypto.randomUUID()`) |
| `taskType` | TASK, HABIT, or CHORE |
| `priority` | CRITICAL, OPPORTUNITY_NOW, OVER_THE_HORIZON, or PARKING_LOT |
| `startDate` | ISO 8601 date (YYYY-MM-DD) |

**Type-Specific Requirements:**
- **HABIT**: Must have `recurrenceRule`
- **CHORE**: Must have `recurrenceRule`, always household-scoped

**Duration Format**: Use simple format like "30m", "1h", "1h30m" (NOT ISO PT prefix)

## Skill Companion

This plugin includes a companion skill at `skills/myn/SKILL.md` that teaches agents MYN workflow patterns including:

- The morning routine (Compass briefing)
- Task creation best practices
- Priority management
- Common workflows

## Development

```bash
# Clone the repository
git clone https://github.com/mindyournow/openclaw-plugin.git
cd openclaw-plugin

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Type check
npm run typecheck
```

## API Reference

### MynApiClient

The shared API client used by all tools:

```typescript
import { MynApiClient } from '@mind-your-now/openclaw-plugin';

const client = new MynApiClient(
  'https://api.mindyournow.com',
  'your-api-key'
);

// Make authenticated requests
const tasks = await client.get('/api/v2/unified-tasks');
const newTask = await client.post('/api/v2/unified-tasks', { ... });
```

## Testing

The plugin includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run with coverage
npm run test -- --coverage

# Watch mode
npm run test:watch
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © Mind Your Now

## Support

- Email: support@mindyournow.com
- Issues: https://github.com/mindyournow/openclaw-plugin/issues
- Documentation: https://docs.mindyournow.com

---

<p align="center">
  <sub>Built with ❤️ by the Mind Your Now team</sub>
</p>
