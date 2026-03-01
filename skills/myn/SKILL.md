# Mind Your Now (MYN) - Agent Workflow Guide

This skill teaches agents how to effectively work with the Mind Your Now productivity system. MYN is built around a specific philosophy of urgency-based prioritization rather than traditional importance-based systems.

## Core Philosophy: Control Urgency

> "Control urgency so you can focus on important work with a calmer state of mind."

The key insight of MYN is that your brain naturally fixates on urgent things. By properly managing what's "urgent now," you free up mental space for truly important work.

## The MYN Priority System

MYN uses only ONE criterion: **URGENCY** - "Is this absolutely due today?"

### Critical Now (<= 5 items)

**The Going Home Test**: "Would you work until midnight to finish this?"

- If NO → It's not Critical Now
- If YES → It belongs here

**Rules**:
- **MAXIMUM 5 items** - More than 5 and things slip
- Must be genuinely due TODAY
- These are your "hair on fire" tasks

**Agent Pattern**: When helping users find their Critical Now tasks:
```
Use: myn_tasks with action: "list", priority: "CRITICAL", status: "PENDING"
```

### Opportunity Now (<= 20 items)

The max you can scan in one glance. These are tasks you'd like to do soon but aren't burning.

**Rules**:
- **MAXIMUM 20 items**
- Start dates in the past or near future
- Can be worked on opportunistically

**Agent Pattern**: To help users see their Opportunity Now:
```
Use: myn_tasks with action: "list", priority: "OPPORTUNITY_NOW", limit: 20
```

### Over-the-Horizon (10+ days out)

**The Psychological Release**: Items with start dates 10+ days in the future.

This is the secret sauce of MYN - by setting start dates in the future, you get these tasks OFF your mental radar. Your brain stops worrying about them.

**Agent Pattern**: When planning future work:
```
Use: myn_tasks with action: "create", priority: "OVER_THE_HORIZON", startDate: "2026-03-15"
```

### Parking Lot

Low urgency tasks that don't fit elsewhere. Review periodically.

## Task Creation Rules

When creating tasks for users, you MUST provide:

1. **`id`** - Client-generated UUID (`crypto.randomUUID()`)
2. **`taskType`** - One of: TASK, HABIT, CHORE
3. **`priority`** - One of: CRITICAL, OPPORTUNITY_NOW, OVER_THE_HORIZON, PARKING_LOT
4. **`startDate`** - ISO 8601 date (YYYY-MM-DD)

**Type-Specific Rules**:

| Type | Requirements |
|------|-------------|
| TASK | Basic task, can be shared |
| HABIT | MUST have `recurrenceRule`, CANNOT be shared |
| CHORE | MUST have `recurrenceRule`, always household-scoped |

**Duration Format**: Use simple format like "30m", "1h", "1h30m" (NOT ISO PT prefix)

**Example Task Creation**:
```typescript
{
  action: "create",
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Prepare quarterly report",
  taskType: "TASK",
  priority: "CRITICAL",
  startDate: "2026-03-01",
  duration: "2h"
}
```

## The Morning Routine

Help users start their day with the **Compass Briefing**:

```
1. Get briefing status
   Use: myn_briefing with action: "status"

2. Generate morning briefing
   Use: myn_briefing with action: "generate", context: "Morning planning session"

3. Review what's generated and help user decide:
   - Which Critical Now items to tackle first
   - What to defer
   - What to add

4. Apply any corrections if needed
   Use: myn_briefing with action: "apply_correction"

5. Complete the session
   Use: myn_briefing with action: "complete_session"
```

## Common Workflows

### Adding a New Task

Always check capacity first:

1. Get current Critical Now count
   ```
   Use: myn_tasks with action: "list", priority: "CRITICAL"
   ```

2. If >= 5 items, warn the user and suggest re-prioritization

3. Create the task with appropriate priority and start date

4. If it's a HABIT or CHORE, ensure `recurrenceRule` is provided

### Planning a Project

```
1. Check existing projects
   Use: myn_projects with action: "list"

2. Create project if needed
   Use: myn_projects with action: "create", name: "Project Name"

3. Break down into tasks with the planning tool
   Use: myn_planning with action: "plan", goal: "Complete project X"

4. Review and adjust priorities
   - CRITICAL for immediate work
   - OPPORTUNITY_NOW for this week
   - OVER_THE_HORIZON for later phases
```

### Reviewing the Day

```
1. List today's events
   Use: myn_calendar with action: "list_events", startDate: "today", endDate: "today"

2. Check habit streaks
   Use: myn_habits with action: "streaks"

3. Get today's schedule
   Use: myn_habits with action: "schedule", dateRange: 1

4. Check household chores
   Use: myn_household with action: "chore_schedule", date: "today"
```

### Dealing with Overload

When a user has too many Critical Now items:

1. Acknowledge the constraint (max 5)
2. Suggest moving items to OPPORTUNITY_NOW
3. Update task priorities
   ```
   Use: myn_tasks with action: "update", updates: { priority: "OPPORTUNITY_NOW" }
   ```
4. Help reschedule with the planning tool
   ```
   Use: myn_planning with action: "reschedule"
   ```

## Memory Best Practices

Use the memory tool to remember important context:

```
// Remember user preferences
Use: myn_memory with action: "remember",
     content: "User prefers morning meetings before 10am",
     category: "user_preference",
     tags: ["meetings", "preferences"]

// Remember work context
Use: myn_memory with action: "remember",
     content: "Currently focused on Q1 planning project",
     category: "work_context",
     importance: "high"
```

## Search Tips

The unified search helps find anything:

```
// Search tasks
Use: myn_search with action: "search", query: "quarterly report", types: ["task"]

// Search memories
Use: myn_search with action: "search", query: "user preference", types: ["memory"]

// Filter by date range
Use: myn_search with action: "search",
     query: "meeting",
     filters: { dateFrom: "2026-03-01", dateTo: "2026-03-07" }
```

## Error Handling

When a tool returns an error:

1. Check the error message - it often tells you exactly what's wrong
2. Common issues:
   - Missing required fields (id, priority, startDate for tasks)
   - Invalid UUID format
   - HABIT/CHORE missing recurrenceRule
3. Fix and retry, or ask the user for clarification

## Key Principles to Remember

1. **Urgency, not importance** - Help users focus on what MUST be done today
2. **Start dates, not due dates** - Encourage FRESH prioritization
3. **Respect the limits** - Don't let Critical Now exceed 5 items
4. **Use Over-the-Horizon** - Push future work out of mind
5. **The Going Home Test** - Be honest about what's truly critical

## Tool Reference Quick List

| Tool | Purpose |
|------|---------|
| myn_tasks | Task CRUD, complete, archive, search |
| myn_briefing | Compass morning/evening briefings |
| myn_calendar | Events, meetings |
| myn_habits | Streaks, skip, chains, reminders |
| myn_lists | Grocery/shopping list management |
| myn_search | Unified search |
| myn_timers | Countdowns, alarms, pomodoro |
| myn_memory | Remember/recall/forget |
| myn_profile | User info, goals, preferences |
| myn_household | Members, invites, chores |
| myn_projects | Project/category management |
| myn_planning | AI planning and scheduling |
