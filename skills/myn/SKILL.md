# Mind Your Now — OpenClaw Tool Reference

This skill maps MYN API operations to OpenClaw tool names. For full MYN philosophy, priority system, and API details, see the base skill from `@mind-your-now/skills`.

## Tool Mapping

Use these OpenClaw tool names instead of raw REST calls:

| OpenClaw Tool | Actions | REST Equivalent | Reference |
|---------------|---------|-----------------|-----------|
| `myn_tasks` | list, get, create, update, complete, archive, search | `/api/v2/unified-tasks` | [references/tasks-api.md](references/tasks-api.md) |
| `myn_debrief` | status, generate, get, apply_correction, complete_session | `/api/v2/debrief/*` | [references/debrief-api.md](references/debrief-api.md) |
| `myn_calendar` | list_calendars, list_events, get_event, create_event, update_event, delete_event, move_event, meetings | `/api/v2/calendar/*` | [references/calendar-api.md](references/calendar-api.md) |
| `myn_habits` | streaks, skip, chains, schedule, reminders | `/api/v2/unified-tasks/*, /api/habits/*` | [references/habits-api.md](references/habits-api.md) |
| `myn_lists` | get, add, toggle, bulk_add, update, delete, delete_checked, convert_to_tasks | `/api/v1/households/*/grocery-list` | [references/lists-api.md](references/lists-api.md) |
| `myn_timers` | create_countdown, create_alarm, list, cancel, snooze, pomodoro | `/api/v2/timers/*` | [references/timers-api.md](references/timers-api.md) |
| `myn_search` | search | `/api/v2/search` | [references/search-api.md](references/search-api.md) |
| `myn_memory` | remember, recall, forget, search | `/api/v1/agent/memories, /api/v1/customers/memories` | [references/memory-api.md](references/memory-api.md) |
| `myn_profile` | get_info, get_goals, update_goals, preferences | `/api/v1/customers` | [references/profile-api.md](references/profile-api.md) |
| `myn_household` | members, invite, chores, chore_schedule, chore_complete | `/api/v1/households/*, /api/v2/chores/*` | [references/household-api.md](references/household-api.md) |
| `myn_projects` | list, get, create, move_task | `/api/project/*` | [references/projects-api.md](references/projects-api.md) |
| `myn_planning` | plan, schedule_all, reschedule | `/planning/*` | [references/planning-api.md](references/planning-api.md) |
| `myn_ynab` | budget_overview, category_balance, list_categories, account_balances, set_budget_amount, set_category_goal, goal_progress, budget_months, search_payees, create_transaction, create_transactions_bulk, list_transactions, update_transaction, delete_transaction, split_transaction, scheduled_transactions, create_scheduled_transaction, update_scheduled_transaction, delete_scheduled_transaction, subscriptions, upcoming_bills, spending_insights, payee_analysis, spending_trends, net_worth, debt_tracking, create_category_group, create_category, rename_category, move_category, rename_category_group, connection_status | `/api/v1/ynab/*` | [references/ynab-api.md](references/ynab-api.md) |
| `myn_a2a_pairing` | redeem_invite, ping, send_message, get_agent_card | `/api/v1/agent/*, /a2a/*` | N/A |

## Quick Reference

### MYN Priority System

| Priority | Max Items | Meaning |
|----------|-----------|---------|
| `CRITICAL` | 5 | Must complete today (Going Home Test) |
| `OPPORTUNITY_NOW` | 20 | Soon but not burning |
| `OVER_THE_HORIZON` | unlimited | 10+ days out, off radar |
| `PARKING_LOT` | unlimited | Someday, review periodically |

### Task Creation (Required Fields)

Every `myn_tasks create` call needs: `title`, `taskType`, `priority`, `startDate`. The `id` field is optional (auto-generated if omitted).

### Morning Routine

1. `myn_debrief` action=status
2. `myn_debrief` action=generate
3. Review and apply corrections
4. `myn_debrief` action=complete_session

### Overload Handling

1. `myn_tasks` action=list, priority=CRITICAL — check count
2. If >= 5, help user move items to OPPORTUNITY_NOW
3. `myn_planning` action=reschedule for bulk rescheduling

## Base Skills

Detailed API documentation lives in `references/` (synced from `@mind-your-now/skills` at build time). See those files for endpoint parameters, request/response shapes, and curl examples.
