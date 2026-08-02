# @mind-your-now/openclaw-plugin

[![npm version](https://badge.fury.io/js/@mindyournow%2Fopenclaw-plugin.svg)](https://badge.fury.io/js/@mindyournow%2Fopenclaw-plugin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> OpenClaw plugin for Mind Your Now - AI-powered task and life management

## Overview

This plugin integrates [Mind Your Now](https://mindyournow.com) (MYN) with [OpenClaw](https://openclaw.dev) agents, enabling AI assistants to manage tasks, calendar, habits, and more using the MYN productivity methodology.

## Features

- **14 powerful tools** for complete MYN integration
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

# Create a task (UUID auto-generated if omitted)
action: create
title: "Finish quarterly report"
taskType: TASK
priority: CRITICAL
startDate: "2026-03-01"
duration: "2h"
isAutoScheduled: true
calendarName: "Work"
scheduleNames:
  - "Morning"
```

**Scheduling Parameters:**
- `isAutoScheduled` (boolean): Enable auto-scheduling by the planning system. Defaults to `true`.
- `calendarId` / `calendarName`: Link the task to a specific calendar. `calendarName` is resolved to an ID automatically.
- `scheduleNames` (string[]): Schedule names to assign (e.g., `["Morning"]`, `["Weekday Evening", "Weekend Morning"]`). Resolved to IDs automatically.

### myn_debrief
Generate and manage Daily Debrief sessions.

```yaml
action: status | generate | get | apply_correction | complete_session
```

**Examples:**
```yaml
# Generate morning debrief
action: generate
type: DAILY
context: "Morning planning session"
focusAreas:
  - work
  - health

# Generate evening review
action: generate
type: EVENING
```

The `type` parameter for `generate` accepts: `DAILY`, `EVENING`, `WEEKLY`, `WEEKLY_AND_DAILY`, `ON_DEMAND`. Defaults to `DAILY`.

### myn_calendar
Manage calendar events and meetings.

```yaml
action: list_calendars | list_events | get_event | create_event | update_event | delete_event | move_event | meetings
```

**Examples:**
```yaml
# List available calendars
action: list_calendars

# Create an event
action: create_event
title: "Team Standup"
startTime: "2026-03-01T09:00:00Z"
endTime: "2026-03-01T09:30:00Z"

# Update an event
action: update_event
eventId: "event-uuid"
newTitle: "Team Standup (Rescheduled)"
newStartTime: "2026-03-01T10:00:00Z"

# Move event to family calendar
action: move_event
eventId: "event-uuid"
destinationCalendarName: "Family"
```

Calendar events may include a `taskId` field (MYN task UUID) when the event is linked to a task.

### myn_habits
Track habits, streaks, and reminders.

```yaml
action: streaks | skip | chains | schedule | reminders
```

### myn_lists
Manage grocery and shopping lists.

```yaml
action: get | add | toggle | bulk_add | update | delete | delete_checked | convert_to_tasks
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
category: PREFERENCE
```

**Categories:** `PREFERENCE`, `PATTERN`, `STYLE`, `MYN_BEHAVIOR`, `PERSONAL`, `RELATIONSHIP`

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
Browse MYN collections and file tasks into them.

```yaml
action: list | get | move_task
```

**Collections, not projects:** MYN has twelve fixed collections that cannot be created or deleted. Use `move_task` to re-file a task; real user-named projects are planned separately.

### myn_planning
AI-powered planning and scheduling.

```yaml
action: plan | schedule_all | reschedule
```

### myn_ynab
YNAB budget management with full read/write access.

```yaml
# Budget & accounts
action: budget_overview | category_balance | list_categories | account_balances | set_budget_amount | set_category_goal | goal_progress | budget_months | search_payees

# Transactions
action: create_transaction | create_transactions_bulk | list_transactions | update_transaction | delete_transaction | split_transaction

# Scheduled transactions & subscriptions
action: scheduled_transactions | create_scheduled_transaction | update_scheduled_transaction | delete_scheduled_transaction | subscriptions | upcoming_bills

# Analytics
action: spending_insights | payee_analysis | spending_trends | net_worth | debt_tracking

# Category management
action: create_category_group | create_category | rename_category | move_category | rename_category_group

# Connection
action: connection_status
```

**Examples:**
```yaml
# Check budget overview
action: budget_overview

# Create a transaction
action: create_transaction
accountId: "account-uuid"
payeeName: "Grocery Store"
amount: -45.50
categoryName: "Groceries"

# Get spending insights
action: spending_insights
months: 3
```

Amounts are in dollars (negative for expenses). Categories are resolved by name via fuzzy match. `categoryName` is required for all non-transfer transactions.

### myn_a2a_pairing
Pair OpenClaw with MYN/Kaia via the A2A (Agent-to-Agent) protocol.

```yaml
action: redeem_invite | ping | send_message | get_agent_card
```

**Examples:**
```yaml
# Redeem an invite code from MYN Settings
action: redeem_invite
inviteCode: "ABC-12345"
agentName: "openclaw"

# Ping MYN after pairing
action: ping
agentKey: "key-from-redeem-invite"

# Send a message to Kaia
action: send_message
agentKey: "key-from-redeem-invite"
message: "Hello from OpenClaw"
intent: chat
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
| `taskType` | TASK, HABIT, or CHORE |
| `priority` | CRITICAL, OPPORTUNITY_NOW, OVER_THE_HORIZON, or PARKING_LOT |
| `startDate` | ISO 8601 date (YYYY-MM-DD) |

**Type-Specific Requirements:**
- **HABIT**: Must have `recurrenceRule`
- **CHORE**: Must have `recurrenceRule`, always household-scoped

**Duration Format**: Use simple format like "30m", "1h", "1h30m" (NOT ISO PT prefix)

## Security Posture

The plugin implements several security layers:

- **S1 — TLS enforcement:** API URLs must use HTTPS; plain HTTP is accepted only for `localhost` and `127.0.0.1`.
- **S2 — No mass assignment:** Tool updates pass through an explicit field allowlist.
- **S3 — Safe query parameters:** All query strings use proper URL encoding.
- **S4 — Data minimization:** Memory search and credential handling avoid unnecessary data exposure.
- **S5 — Tool result redaction:** Each tool result is recursively scanned for secret-shaped keys (accessToken, refreshToken, apiKey, secret, password, credential, etc.) and matching values are replaced with `[REDACTED]` before returning to OpenClaw. This is a backstop against server-side regressions.
- **S6 — Visible degradation:** API failures are logged and never silently ignored.

## Skill Companion

This plugin includes a companion skill at `skills/myn/SKILL.md` that teaches agents MYN workflow patterns including:

- The morning routine (Daily Debrief)
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
const taskPage = await client.get('/api/v2/unified-tasks?limit=20');
const tasks = taskPage.tasks;
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
