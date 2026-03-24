# MIN-801: Kaia Memory Injection into OpenClaw Agent

## Problem

Kaia (the OpenClaw agent) has amnesia. The MYN backend stores rich user memories
with vector embeddings, confidence scoring, and semantic search — but none of it
reaches the agent. The `myn_memory` tool's `remember` action is a stub, and
`search` does naive client-side string matching. The agent can't proactively
recall what it knows about the user.

## Goal

On every conversation turn, automatically surface the user's most relevant MYN
memories into the agent's system prompt. The agent should "just know" things
about the user without being asked to recall.

## Design Decisions

### Why `before_prompt_build` hook (not memory plugin slot)

OpenClaw's memory plugin slot (`kind: "memory"`) is **exclusive** — only one
plugin can fill it. We want to keep `memory-core` (OpenClaw's native memory)
active so users who use OpenClaw outside of MYN still get memory, and so we
benefit from upstream memory innovations. The `before_prompt_build` hook lets us
inject `appendSystemContext` alongside the native memory system.

### Why `prependContext`

The `before_prompt_build` hook returns `{ prependContext?: string }` which gets
prepended to the user's message. There is no `appendSystemContext` field in the
current API — only `prependContext` and `systemPrompt` (full override).
`prependContext` is the right choice: it puts memories right before the user's
question so the LLM has context when processing the request. Multiple plugins'
`prependContext` values are concatenated.

### Why semantic search per-turn (not session-level cache)

v1 will do a semantic search on every turn using the user's prompt as the query.
This is simpler and more accurate than caching. The backend pgvector query
should be < 50ms. If latency becomes an issue, we add caching later.

### Memory creation: agent-initiated

The `POST /api/v1/agent/memories` endpoint lets the agent create memories
directly. This un-stubs the `myn_memory remember` action. The backend handles
duplicate detection (cosine similarity > 0.92 = duplicate) and confidence
initialization (0.5).

## API Contract

### `GET /api/v1/agent/memories/context`

Primary endpoint for the `before_prompt_build` hook.

```
Query params:
  query    string   optional  User's current prompt (for semantic ranking)
  limit    int      optional  Max memories to return (default: 10, max: 20)
  types    string   optional  Comma-separated MemoryType filter

Response 200:
{
  "items": [
    {
      "id": "uuid",
      "content": "Prefers morning meetings before 10am",
      "type": "PREFERENCE",
      "confidence": 0.85,
      "createdAt": "2026-01-15T...",
      "lastAccessedAt": "2026-03-20T..."
    }
  ],
  "total": 42
}
```

When `query` is provided: semantic search via pgvector, ranked by embedding
similarity. When omitted: returns top memories by confidence score.

### `POST /api/v1/agent/memories`

Create a memory from the agent.

```
Request body:
{
  "content": "User prefers dark mode",     // required, max 500 chars
  "type": "PREFERENCE"                      // optional, auto-inferred if omitted
}

Response 201:
{
  "id": "uuid",
  "content": "User prefers dark mode",
  "type": "PREFERENCE",
  "confidence": 0.5,
  "createdAt": "2026-03-24T...",
  "duplicate": false
}

Response 200 (duplicate detected):
{
  "id": "existing-uuid",
  "content": "User prefers dark mode",
  "duplicate": true,
  "message": "Similar memory already exists; confidence reinforced"
}
```

### `GET /api/v1/agent/memories/search`

Semantic search for the `myn_memory search` tool action.

```
Query params:
  query    string   required  Search query
  limit    int      optional  Max results (default: 10)

Response 200:
{
  "results": [ ...same shape as context items... ],
  "total": 5
}
```

## System Prompt Format

```markdown
## What Kaia knows about this user

- [PREFERENCE] Prefers morning meetings before 10am (confidence: 85%)
- [PATTERN] Deep focus work on Tuesday/Thursday afternoons (confidence: 72%)
- [PERSONAL] Has two kids, ages 7 and 10 (confidence: 95%)
```

Keep it concise. The agent doesn't need to cite confidence to the user — it's
there so the LLM can weigh memories appropriately.

## Implementation

### Backend (myn/api)

New `AgentMemoryController` under `/api/v1/agent/memories`. Follows the same
pattern as `A2APairingController` (API key auth, resolves customer from key).

- Delegates to existing `KaiaMemoryService` methods
- `searchMemories()` for semantic search
- `createMemory()` / duplicate detection for POST
- `getMemoriesForCustomer()` for unranked fallback

### Plugin (openclaw-plugin)

1. Expand `OpenClawPluginApi` interface to include `on()` method
2. Register `before_prompt_build` hook in `register()`
3. New `src/memory-context.ts` — fetch + format memories
4. Fix `src/tools/memory.ts` — wire to real endpoints
5. Bump version to 0.8.0 (new capability)

### Deployment

1. Deploy backend (auto on push to main)
2. Build plugin, copy to exe.dev `~/.openclaw/extensions/myn/`
3. Restart OpenClaw gateway
4. Test in Slack
