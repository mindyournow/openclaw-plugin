# Security Review - 2026-03-09T14-00-00

**Package:** `@mind-your-now/myn` (openclaw-plugin)
**Version:** 0.4.2
**Reviewer:** Security Review Agent
**Files reviewed:** 15 source files across `src/`, `index.ts`, `scripts/`, `package.json`, `openclaw.plugin.json`

---

## Summary

Found **0 critical vulnerabilities**, **6 security warnings**, and **8 best-practice recommendations**.

The codebase is generally well-structured. There are no hardcoded secrets, no command injection vectors, and no use of dangerous deserialization patterns. The most significant risks are: a missing TLS enforcement check on the `baseUrl` configuration, insufficient input validation on several fields before they are interpolated into URL paths (IDOR potential), an unsafe type cast throughout the execute layer that bypasses schema enforcement at runtime, and a fire-and-forget async operation in the A2A sync path that silently swallows errors in production.

---

## Critical Vulnerabilities

None identified.

---

## Security Warnings

### 1. [src/client.ts:15-17] No TLS enforcement on configurable baseUrl

**Severity:** Warning
**OWASP Category:** A02:2021 - Cryptographic Failures / A05:2021 - Security Misconfiguration
**Location:** `src/client.ts:15`, `index.ts:117`

**Issue:**
The `baseUrl` is accepted from `pluginConfig` with no validation that it uses HTTPS. The default is `https://api.mindyournow.com`, but any installer can configure `http://` or an entirely different host. All API requests carry the `X-API-KEY` credential in plaintext over any such connection.

```typescript
// index.ts:117 — no protocol check
const baseUrl = (api.pluginConfig?.baseUrl as string) || DEFAULT_BASE_URL;
const client = new MynApiClient(baseUrl, apiKey);
```

**Risk:**
A misconfigured deployment pointing at an HTTP endpoint exposes the user's MYN API key and all personal data (tasks, calendar events, memories, household data) in transit. An operator could also supply a hostile base URL and harvest credentials via a credential-capturing proxy.

**Mitigation:**
Validate that `baseUrl` starts with `https://` and reject or warn loudly if it does not:

```typescript
if (!baseUrl.startsWith('https://')) {
  api.logger.error('[myn] SECURITY: baseUrl must use HTTPS. Refusing to register tools.');
  return;
}
```

---

### 2. [src/tools/tasks.ts:169] Mass assignment via unconstrained `updates` object

**Severity:** Warning
**OWASP Category:** A03:2021 - Injection / A04:2021 - Insecure Design
**Location:** `src/tools/tasks.ts:169`

**Issue:**
The `update` action forwards the entire `input.updates` object directly to the backend PATCH endpoint without any field allowlist:

```typescript
// tasks.ts:165-169
if (!input.updates || Object.keys(input.updates).length === 0) {
  return errorResult('updates object is required for update action');
}
const data = await client.patch<unknown>(`/api/v2/unified-tasks/${input.taskId}`, input.updates);
```

The schema defines `updates` as `Type.Record(Type.String(), Type.Unknown())` — any key/value pair is accepted.

**Risk:**
An AI agent or malicious caller could include privileged fields like `ownerId`, `householdId`, `userId`, or internal audit timestamps in the updates payload. Whether the backend enforces an allowlist is unknown from this codebase alone, but the plugin provides no defence-in-depth layer.

**Mitigation:**
Define an explicit allowlist of updatable fields and filter the updates object before sending:

```typescript
const ALLOWED_UPDATE_FIELDS = new Set(['title', 'description', 'priority', 'taskType',
  'duration', 'startDate', 'recurrenceRule', 'projectId', 'status']);

const safeUpdates = Object.fromEntries(
  Object.entries(input.updates).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k))
);
if (Object.keys(safeUpdates).length === 0) {
  return errorResult('No valid update fields provided');
}
const data = await client.patch<unknown>(`/api/v2/unified-tasks/${input.taskId}`, safeUpdates);
```

---

### 3. [src/tools/household.ts:146] URL parameter injection via householdId in query string

**Severity:** Warning
**OWASP Category:** A03:2021 - Injection
**Location:** `src/tools/household.ts:146`

**Issue:**
The `getChores` function appends `householdId` directly into a query string using string concatenation rather than `URLSearchParams`:

```typescript
// household.ts:146
const data = await client.get<...>(`/api/v2/chores/today?householdId=${householdId}`);
```

While `householdId` has a `format: 'uuid'` hint in the TypeBox schema, this format constraint is stripped by `normalizeSchema()` in `index.ts:72` before the schema reaches the OpenClaw runtime validator. There is no runtime UUID validation enforced by the plugin itself.

**Risk:**
If `householdId` is obtained from `pluginConfig` or a user-controlled source and contains characters like `&`, `#`, or `=`, an attacker could inject additional query parameters or corrupt the request. For example, `householdId=abc&adminOverride=true` would produce `?householdId=abc&adminOverride=true`.

**Proof of Concept:**
```
householdId = "real-uuid&includeAllHouseholds=true"
→ GET /api/v2/chores/today?householdId=real-uuid&includeAllHouseholds=true
```

**Mitigation:**
Use `URLSearchParams` consistently for all query parameter construction:

```typescript
const params = new URLSearchParams({ householdId });
const data = await client.get<...>(`/api/v2/chores/today?${params}`);
```

The same pattern should be applied to `/api/v2/chores/schedule/range` in `getChoreSchedule` (line 175), which already uses `URLSearchParams` but also manually sets `householdId` via `params.append` — that usage is safe.

---

### 4. [src/tools/memory.ts:104] Client-side filtering of sensitive user data fetches entire dataset

**Severity:** Warning
**OWASP Category:** A04:2021 - Insecure Design
**Location:** `src/tools/memory.ts:86-164`

**Issue:**
Both `recall` and `searchMemories` fetch **all** of a user's memories from `/api/v1/customers/memories` and filter client-side. This occurs because the backend does not expose per-ID or search endpoints:

```typescript
// memory.ts:87-111
const data = await client.get<Array<...>>('/api/v1/customers/memories');
// Then filter locally for a specific memoryId or search query
```

**Risk:**
This pattern has two security implications:

1. **Data over-exposure in agent context:** The AI agent receives the complete raw memory dataset (potentially hundreds of records with personal information) in order to filter one record. This data is retained in the LLM's context window and potentially in session logs, violating data minimisation principles (GDPR Article 5(1)(c)).

2. **Timing oracle:** Filtering client-side means the response time for "memory not found" vs. "memory found" is distinguishable, enabling enumeration of valid memory IDs.

**Mitigation:**
This is primarily a backend API gap. As a partial mitigation, log a warning when fetching all memories, and apply a hard limit on how many raw records are passed back to the calling AI agent (the current code returns the full unfiltered array on `recall` with no `memoryId`).

---

### 5. [src/tools/myn_a2a_pairing.ts:87] Configurable base URL accepted without validation in A2A tool

**Severity:** Warning
**OWASP Category:** A10:2021 - Server-Side Request Forgery (SSRF)
**Location:** `src/tools/myn_a2a_pairing.ts:87-88`

**Issue:**
The A2A pairing tool accepts `configuredBaseUrl` from plugin configuration and uses it directly for `fetch()` calls with no validation:

```typescript
// myn_a2a_pairing.ts:87-88
export async function myn_a2a_pairing(input: MynA2APairingInput, configuredBaseUrl?: string): Promise<unknown> {
  const base = (configuredBaseUrl ?? 'https://api.mindyournow.com').replace(/\/$/, '');
```

The tool then makes several fetch calls to `${base}/.well-known/agent.json`, `${base}/api/v1/agent/redeem-invite`, and `${base}/a2a/message` using the caller-supplied `agentKey`. Unlike the standard tools (which use `MynApiClient`), this tool uses raw `fetch()` calls and does not benefit from any centralised validation.

**Risk:**
SSRF: a misconfigured or malicious `baseUrl` could direct the plugin to make authenticated requests to internal infrastructure (`http://169.254.169.254/`, `http://localhost:8080/`, etc.), potentially exfiltrating cloud metadata or accessing internal services. The `agentKey` (which is also caller-supplied via `input.agentKey`) would be sent to whatever host is targeted.

**Mitigation:**
Apply the same `https://` enforcement recommended in Warning #1, specifically for the A2A path. Additionally, consider validating that the host portion of the base URL matches the expected MYN domain or a configured allowlist:

```typescript
const base = (configuredBaseUrl ?? 'https://api.mindyournow.com').replace(/\/$/, '');
if (!base.startsWith('https://')) {
  return errorResult('STOP: baseUrl must use HTTPS.');
}
```

---

### 6. [src/tools/syncOnMismatch.ts:103] Silent error suppression in security-adjacent capability sync

**Severity:** Warning
**OWASP Category:** A09:2021 - Security Logging and Monitoring Failures
**Location:** `src/tools/syncOnMismatch.ts:102-104`, `src/tools/myn_a2a_pairing.ts:147-148`

**Issue:**
Capability sync failures are swallowed via `.catch()` with only a `console.warn`:

```typescript
// syncOnMismatch.ts:102-104
sendCapabilityUpdate(mynBaseUrl, agentKey, manifest).catch((err) => {
  console.warn('[syncOnMismatch] Capability sync failed:', err?.message ?? err);
});
```

The `agentKey` is passed to `sendCapabilityUpdate` and used in an `X-Agent-Key` header. If this operation silently fails in a context where the capability hash becomes permanently stale, the agent may operate under an incorrect security posture without the operator knowing.

**Risk:**
Security-critical state changes (capability manifest sync) fail silently. In an AI agent context where `console.warn` output is not monitored, a key revocation or capability mismatch that should block operations could go undetected.

**Mitigation:**
Route sync failures through the plugin's structured logger (not `console.warn`) so they appear in OpenClaw's log infrastructure. The plugin API's `logger.warn()` should be used where available. Since `syncOnMismatch.ts` does not have access to the API logger, pass it as a parameter or use a module-level logger injection:

```typescript
// Pass a logger callback
export function checkAndSync(
  response: A2AResponseWithPending | null | undefined,
  mynBaseUrl: string,
  agentKey: string,
  manifest: CapabilityManifest,
  logWarn?: (msg: string) => void,
): void {
  if (response?.capabilityUpdatePending === true) {
    sendCapabilityUpdate(mynBaseUrl, agentKey, manifest).catch((err) => {
      (logWarn ?? console.warn)('[syncOnMismatch] Capability sync failed:', err?.message ?? err);
    });
  }
}
```

---

## Best Practices

### 1. [index.ts:210] Tool execute functions accept `unknown` and cast without runtime validation

**Location:** `index.ts:143-144`, all `register*Tool` functions
**Recommendation:**
Every tool's `execute` function receives `input: unknown` and immediately casts it to the typed input:

```typescript
async execute(input: unknown) {
  return executeTasks(client, input as TasksInput);
}
```

TypeBox schemas are passed to OpenClaw as `parameters`, but runtime schema validation is delegated entirely to the host runtime. If OpenClaw does not validate inputs against the schema before calling `execute`, malformed inputs will reach the business logic unchecked. Consider adding an AJV-based runtime validation step inside each execute function or in a shared middleware wrapper.

**Benefit:** Defence-in-depth against malformed inputs bypassing schema validation in the OpenClaw host.

---

### 2. [src/tools/tasks.ts:48] UUID format validation stripped at schema normalisation boundary

**Location:** `index.ts:72`, `src/tools/tasks.ts:49`
**Recommendation:**
Fields like `taskId`, `id`, `projectId`, `briefingId`, `memoryId`, `habitId`, `chainId`, and `choreId` are declared with `format: 'uuid'` in TypeBox schemas, but the `normalizeSchema()` function in `index.ts` strips `format` keys:

```typescript
// index.ts:72
const skipKeys = new Set(['$schema', 'format', 'patternProperties', 'minLength', 'maxLength']);
```

This means UUID format validation is stripped from the schema before it reaches the runtime validator. A caller can supply any string as a `taskId`, which will be interpolated into URL paths like `/api/v2/unified-tasks/${input.taskId}`. While the MYN backend presumably validates UUIDs, the plugin provides no client-side check.

**Benefit:** Prevents path manipulation attempts (e.g., `taskId = "../../admin/users"`) from reaching the backend at all. Add a UUID format check before use: `if (!/^[0-9a-f-]{36}$/i.test(input.taskId))`.

---

### 3. [src/tools/calendar.ts:117-122] Attendee email validation is presence-only

**Location:** `src/tools/calendar.ts:117-122`
**Recommendation:**
Attendees containing `@` are passed to the backend as email addresses without format validation:

```typescript
if (attendee.includes('@')) {
  emails.push(attendee);
}
```

An input like `attacker@evil.com<script>` or `user@example.com\nBcc: spy@evil.com` could pass this check. If the backend uses these addresses in email notifications without sanitisation, this could lead to email header injection.

**Benefit:** Add basic email format validation (e.g., a simple regex or the `format: 'email'` constraint enforcement that is currently being stripped by `normalizeSchema`).

---

### 4. [src/tools/profile.ts:128-135] User-controlled goal titles embedded in markdown without escaping

**Location:** `src/tools/profile.ts:128-135`
**Recommendation:**
Goal titles and descriptions are embedded directly into a markdown string sent to the backend:

```typescript
const markdown = input.goals.map(g => {
  let line = `- **${g.title}**`;
  if (input.description) line += `\n  ${g.description}`;
  ...
}).join('\n');
const data = await client.put<...>('/api/v1/customers/goals', { goalsAndAmbitions: markdown });
```

While this is Markdown (not HTML), if the backend renders this Markdown to HTML without sanitisation, a goal title like `**XSS** <img src=x onerror=alert(1)>` could result in stored XSS in the MYN web interface.

**Benefit:** Sanitise or escape the title/description fields before embedding in Markdown.

---

### 5. [src/tools/myn_a2a_pairing.ts:99-116] Invite code and agent name not validated before use

**Location:** `src/tools/myn_a2a_pairing.ts:99-116`
**Recommendation:**
The `inviteCode` and `agentName` fields are accepted without format validation and sent directly in the JSON body:

```typescript
const body = {
  inviteCode: input.inviteCode,
  agentName: input.agentName,
  ...
};
```

The TypeBox schema declares these as `Type.String()` with only a description hint. A malformed `inviteCode` or `agentName` containing special characters has no client-side gate.

**Benefit:** Validate `agentName` against its documented constraint (`^[a-z0-9-]+$`) and validate `inviteCode` against its expected format (e.g., `^[A-Z]{3}-\d{5}$`) before sending.

---

### 6. [vitest.config.ts] Test configuration missing `maxForks` limit

**Location:** `vitest.config.ts`
**Recommendation:**
Per project memory, all vitest configs should have `maxForks: 4` to prevent OOM crashes. The current config lacks this:

```typescript
// vitest.config.ts — missing maxWorkers/maxForks
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    ...
  }
});
```

**Benefit:** Prevents resource exhaustion during test runs on development machines and CI.

---

### 7. [src/tools/briefing.ts:100-109] `get` action ignores the provided `briefingId`

**Location:** `src/tools/briefing.ts:100-109`
**Recommendation:**
When `briefingId` is provided, the implementation silently ignores it and always fetches `/api/v2/compass/current`:

```typescript
async function getBriefing(client: MynApiClient, input: BriefingInput) {
  if (!input.briefingId) {
    const data = await client.get<unknown>('/api/v2/compass/current');
    return jsonResult(data);
  }
  // No per-ID endpoint exists; use /current...
  const data = await client.get<unknown>('/api/v2/compass/current');
  return jsonResult(data);
}
```

This is a logic gap, but from a security perspective it means an agent that passes a specific `briefingId` expecting data isolation (e.g., for a different user session) always receives the current user's briefing, potentially creating confusion about data ownership.

**Benefit:** Either implement the per-ID endpoint or return an explicit `errorResult` when `briefingId` is provided, to avoid silent data substitution.

---

### 8. [scripts/sync-skills.js] Supply chain: synced skills content is not integrity-checked

**Location:** `scripts/sync-skills.js:15-24`
**Recommendation:**
The `prebuild` hook copies skill reference documents from `node_modules/@mind-your-now/skills` into the published package:

```javascript
const src = resolve(projectRoot, 'node_modules', '@mind-your-now', 'skills', 'skills', 'myn-api', 'references');
cpSync(src, dest, { recursive: true });
```

The `@mind-your-now/skills` package is a `^0.1.0` semver range dependency. A compromised patch release (e.g., `0.1.1` with a malicious skills file) would be automatically included in the published plugin without any integrity verification. The skills are Markdown files loaded as context for AI agents — malicious content could manipulate agent behaviour (prompt injection via skill documents).

**Benefit:** Pin the `@mind-your-now/skills` dependency to an exact version and add a checksum verification step in the prebuild script, or restrict the semver range to `~0.1.0` (patch-only).

---

## Dependency Vulnerabilities

No direct `npm audit` was run, but the following observations apply:

- **`openclaw@^2026.2.22`** (devDependency and peerDependency): This is a private/internal package. No CVE data available, but the peer dependency range is open-ended (`>=2026.2.22`), meaning future breaking versions could be loaded without constraint.
- **`@sinclair/typebox@^0.34.0`**: Generally considered safe for schema validation. No known CVEs as of knowledge cutoff.
- **`@mind-your-now/skills@^0.1.0`**: Pure Markdown package — no runtime code risk, but prompt injection risk via content (see Best Practice #8).
- The `node_modules` directory contains a very large transitive dependency tree (including `@anthropic-ai/sdk`, `@mistralai/mistralai`, `openai`, `@line/bot-sdk`, `discord.js` SDKs, etc.) pulled in by the `openclaw` devDependency. These are not direct runtime dependencies of the plugin but represent a significant supply chain surface. Running `npm audit` against the lockfile is recommended.

---

## Compliance Considerations

**GDPR (General Data Protection Regulation):**

- **Data minimisation (Article 5(1)(c)):** The `recall` action in `src/tools/memory.ts` fetches all user memories and returns the full dataset to the calling AI agent (Warning #4). This violates the principle of data minimisation — only the requested memory should be returned.
- **Data portability and deletion (Articles 20, 17):** The `forget` action deletes memories by ID. There is no bulk deletion or data export function, but this may be acceptable given this is a plugin rather than the primary data store.
- **Cross-border transfers:** The `baseUrl` is configurable and not restricted to `api.mindyournow.com`. An operator could unknowingly route EU user data to non-EU servers. Consider documenting this constraint.

**General AI/Agent security:**

- The plugin exposes personal productivity data (tasks, calendar, health habits, personal memories) to AI agents. The `preferenceValue: Type.Optional(Type.Unknown())` field in `profile.ts:37` accepts arbitrary JSON as a preference value with no size or type constraints — this should have a size cap to prevent denial-of-service via oversized payloads to the backend.

---

## Summary Statistics

| Category | Count |
|---|---|
| Critical | 0 |
| Warnings | 6 |
| Best Practices | 8 |
| Files reviewed | 15 source files + package manifests |

### Files reviewed

- `/home/eltmon/Projects/myn/openclaw-plugin/index.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/client.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/tasks.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/briefing.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/calendar.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/habits.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/lists.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/memory.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/profile.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/household.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/search.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/timers.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/planning.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/projects.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/myn_a2a_pairing.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/syncOnMismatch.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/src/tools/capabilityHash.ts`
- `/home/eltmon/Projects/myn/openclaw-plugin/scripts/sync-skills.js`
- `/home/eltmon/Projects/myn/openclaw-plugin/package.json`
- `/home/eltmon/Projects/myn/openclaw-plugin/openclaw.plugin.json`
