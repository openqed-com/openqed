# openqed API Reference

openqed is an AI session provenance system. It records, extracts, and retrieves context about **why** code was written the way it was — drawing from AI coding session history.

Two interfaces: **CLI** (human developers) and **MCP Server** (AI agents in Claude Code, Cursor, Kiro, etc.).

---

## Table of Contents

- [Core Concepts](#core-concepts)
- [Setup](#setup)
- [CLI Commands](#cli-commands)
  - [init](#init)
  - [commit](#commit)
  - [sessions](#sessions)
  - [extract](#extract)
  - [context](#context)
  - [nuggets](#nuggets)
  - [coverage](#coverage)
  - [mcp-server](#mcp-server)
- [MCP Tools](#mcp-tools)
  - [openqed_context](#openqed_context)
  - [openqed_file_history](#openqed_file_history)
  - [openqed_decisions](#openqed_decisions)
- [Data Model](#data-model)
  - [Nugget Types](#nugget-types)
  - [ContextResponse](#contextresponse)
  - [Relevance Scoring](#relevance-scoring)
  - [Staleness Detection](#staleness-detection)
  - [Token Budget](#token-budget)
- [Programmatic API](#programmatic-api)
  - [queryContext](#querycontext)
  - [ensureNuggetsExtracted](#ensurenuggetsextracted)
  - [Store Functions](#store-functions)
  - [FTS Search](#fts-search)
- [Database Schema](#database-schema)

---

## Core Concepts

### Context Nuggets

A **nugget** is a single piece of provenance — one reason why code is the way it is. Each nugget has:

- A **type** (intent, decision, constraint, rejection, tuning, dependency, workaround, caveat)
- A **summary** (1 sentence, max 120 chars)
- An optional **detail** (1-3 sentences of elaboration)
- An optional **scope** (file path and/or symbol name it applies to)
- A **confidence** score (0.0-1.0)
- A link back to the **session** it was extracted from

### Extraction

Nuggets are extracted from AI coding sessions via two methods:

1. **Heuristic** (always available, offline) — pattern-matching on user prompts, file mentions, artifact metadata. Fast but lower quality.
2. **LLM** (optional, requires Claude Code CLI) — sends a condensed session transcript to an LLM for structured extraction. Higher quality, costs API tokens.

Extraction is explicit: run `openqed extract` to process sessions.

### Querying

Context is queried via file path, natural language, or both. The engine:

1. Finds candidate nuggets (scope match + FTS5 full-text search)
2. Checks staleness (file changed? superseded? expired?)
3. Scores and ranks by relevance
4. Packs into a token-budget-aware response

---

## Setup

```bash
# Install
npm install -g openqed-cli

# Initialize in a git repo
openqed init

# Extract nuggets from existing AI sessions
openqed extract
```

### MCP Server Setup (Claude Code)

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "openqed": {
      "command": "openqed-mcp-server"
    }
  }
}
```

---

## CLI Commands

### `init`

Initialize openqed in the current git repository.

```
openqed init [--force]
```

| Flag | Description |
|------|-------------|
| `--force` | Overwrite existing git hooks |

Creates `~/.openqed/` (global store), `.openqed/` (local config), adds `.openqed/` to `.gitignore`, and installs the `prepare-commit-msg` git hook.

---

### `commit`

Generate an AI-attributed commit message from staged changes.

```
openqed commit [--auto] [--dry-run] [--offline] [--model <model>] [--hook <file>]
```

| Flag | Description |
|------|-------------|
| `--auto` | Commit automatically without opening editor |
| `--dry-run` | Print the message without committing |
| `--offline` | Use heuristic generation (no LLM call) |
| `--model <model>` | LLM model to use |
| `--hook <file>` | Write message to file (git hook mode) |

Matches staged files against recent AI sessions to produce context-aware conventional commits with attribution trailers.

---

### `sessions`

List and inspect AI coding sessions discovered in the current workspace.

```
openqed sessions [--since <duration>]
openqed sessions inspect <id>
```

| Flag | Description |
|------|-------------|
| `--since <duration>` | Filter by recency: `3d`, `1w`, `24h`, `2m` |

`inspect` shows full session detail: prompts, artifacts, event summary.

---

### `extract`

Extract context nuggets from AI sessions. This must be run before `context` or `nuggets` commands will return results.

```
openqed extract [--all] [--session <id>] [--force] [--dry-run] [--llm]
```

| Flag | Description |
|------|-------------|
| `--all` | Process all sessions (default behavior) |
| `--session <id>` | Extract from a single session (prefix match supported) |
| `--force` | Re-extract even if nuggets already exist for a session |
| `--dry-run` | Show what would be extracted without writing to DB |
| `--llm` | Use LLM for higher-quality extraction (requires Claude Code CLI) |

**Output:**

```
Extraction Results:
  Extracted: 12
  Skipped:   3
  Failed:    0
```

By default uses heuristic extraction. Pass `--llm` for LLM-powered extraction which produces richer nuggets with decision/constraint/rejection types.

---

### `context`

Query context for a file or topic. The primary retrieval command.

```
openqed context <path> [options]
openqed context --query <text> [options]
openqed context <path> --query <text> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `<path>` | File path to query (positional) | — |
| `--symbol <name>` | Specific function/class/variable | — |
| `--query <text>` | Natural language query | — |
| `--budget <n>` | Token budget for response | `2000` |
| `--type <types>` | Filter by nugget types (comma-separated) | all |
| `--depth <level>` | `summary`, `standard`, or `deep` | `standard` |
| `--since <date>` | Only nuggets extracted after this date | — |
| `--json` | Output as JSON (machine-readable) | — |

At least one of `<path>` or `--query` is required.

**Three query modes:**

1. **Path-based** — `openqed context src/auth.ts`
   Finds nuggets scoped to the file, its directory, or workspace-wide.

2. **Natural language** — `openqed context --query "why does auth use JWT?"`
   FTS5 full-text search across session content and nugget summaries.

3. **Combined** — `openqed context src/auth.ts --query "JWT"`
   Intersects path scope with FTS results for highest precision.

**Example output:**

```
Context for src/auth.ts (3 nuggets, 312 tokens)

  [decision] chose JWT over session cookies for stateless auth
    JWT provides stateless authentication which is better for horizontal scaling
    src/auth.ts | claude-code | 2025-01-15

  [constraint] must support Node 18 and above
    workspace | claude-code | 2025-01-15

  [tuning] human-edited AI output in src/auth.ts
    src/auth.ts | claude-code | 2025-01-15
```

**JSON output** (`--json`):

```json
{
  "query": { "path": "src/auth.ts", "depth": "standard" },
  "budget": { "requested": 2000, "used": 312, "available": 1688, "truncated": false },
  "nuggets": [
    {
      "type": "decision",
      "summary": "chose JWT over session cookies for stateless auth",
      "detail": "JWT provides stateless authentication...",
      "scope": "src/auth.ts",
      "confidence": 0.9,
      "sessionDate": "2025-01-15T10:00:00.000Z",
      "sessionAgent": "claude-code"
    }
  ],
  "moreContextHint": null
}
```

---

### `nuggets`

Browse and inspect extracted nuggets.

```
openqed nuggets [--file <path>] [--type <types>] [--stale] [--json] [--limit <n>]
openqed nuggets inspect <id>
```

| Flag | Description | Default |
|------|-------------|---------|
| `--file <path>` | Filter by file path | — |
| `--type <types>` | Filter by type (comma-separated) | all |
| `--stale` | Show only stale nuggets | — |
| `--json` | Output as JSON | — |
| `--limit <n>` | Max nuggets to display | `50` |

**Table output:**

```
ID     Type         Scope                          Summary
──────────────────────────────────────────────────────────────────────────────────────────
1      decision     src/auth.ts                    chose JWT over session cookies
2      constraint   (workspace)                    must support Node 18 and above
3      intent       src/cache.ts                   added Redis caching for performance

3 nugget(s) found.
```

**Inspect** shows full detail for a single nugget:

```
openqed nuggets inspect 1

ID:         1
Type:       decision
Summary:    chose JWT over session cookies
Detail:     JWT provides stateless authentication
Scope Path: src/auth.ts
Confidence: 0.9
Session:    abc123-def456
Extracted:  2025-01-15T10:30:00.000Z
```

---

### `coverage`

Show nugget coverage across files in the workspace.

```
openqed coverage [--gaps]
```

| Flag | Description |
|------|-------------|
| `--gaps` | Show files with many queries but few nuggets |

**Default output** — bar chart:

```
Nugget coverage by file:

  src/auth.ts                                ██████████████████████████████ 8
  src/store/schema.ts                        ████████████████████ 5
  src/commands/commit.ts                     ████████ 2

3 file(s) with context nuggets.
```

**Gaps mode** — identifies under-documented files:

```
openqed coverage --gaps

Files with high queries but low nugget coverage:

Path                                               Queries    Nuggets
──────────────────────────────────────────────────────────────────────────
src/config.ts                                      12         0
src/middleware/rate-limit.ts                        8          1
```

---

### `mcp-server`

Start the MCP server for AI agent integration.

```
openqed mcp-server
```

Runs a stdio-based MCP server that exposes three tools. Typically not called directly — instead configured in your editor's MCP settings (see [Setup](#mcp-server-setup-claude-code)).

---

## MCP Tools

These tools are available to AI agents when the MCP server is running.

### `openqed_context`

Query context/provenance for a file or topic. Returns ranked nuggets explaining WHY code is the way it is.

**Input schema:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | no | — | File path to query context for |
| `symbol` | string | no | — | Specific symbol (function, class) to query |
| `query` | string | no | — | Natural language query (e.g., "why does auth use JWT?") |
| `token_budget` | number | no | `2000` | Max tokens in response |
| `types` | string[] | no | all | Filter by nugget types |
| `depth` | enum | no | `standard` | One of: `summary`, `standard`, `deep` |

**Returns:** JSON `ContextResponse` (see [ContextResponse](#contextresponse)).

**Example agent usage:**

```
"Why is this file structured this way?"
→ openqed_context({ path: "src/store/schema.ts", depth: "standard" })

"What decisions were made about authentication?"
→ openqed_context({ query: "authentication decisions", types: ["decision", "rejection"] })
```

---

### `openqed_file_history`

Get the AI session history for a specific file — which sessions touched it and when.

**Input schema:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | **yes** | — | Relative file path to look up |
| `token_budget` | number | no | `1500` | Max tokens in response |

**Returns:**

```json
{
  "path": "src/auth.ts",
  "sessions": [
    {
      "sessionId": "abc123-def456",
      "agent": "claude-code",
      "startedAt": "2025-01-15T10:00:00.000Z",
      "endedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "total": 5,
  "shown": 5
}
```

---

### `openqed_decisions`

Get architectural decisions, rejections, and constraints from AI sessions.

**Input schema:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | no | — | File path to scope the query |
| `token_budget` | number | no | `2000` | Max tokens in response |

**Returns:**

```json
{
  "decisions": [
    {
      "id": 1,
      "type": "decision",
      "summary": "chose JWT over session cookies",
      "detail": "JWT provides stateless authentication",
      "scope": "src/auth.ts",
      "confidence": 0.9,
      "alternatives": ["session cookies", "OAuth tokens"]
    }
  ],
  "total": 3,
  "shown": 3,
  "scope": "workspace"
}
```

Filters to nugget types: `decision`, `rejection`, `constraint`.

---

## Data Model

### Nugget Types

| Type | Description | Example |
|------|-------------|---------|
| `intent` | What the user/agent was trying to accomplish | "add JWT authentication to login" |
| `decision` | A deliberate choice between alternatives | "chose Redis over Memcached for caching" |
| `constraint` | A requirement or limitation that shaped the code | "must support Node 18+" |
| `rejection` | Something explicitly considered and rejected | "considered GraphQL but rejected due to complexity" |
| `tuning` | Human edited AI-generated output | "human-edited AI output in src/auth.ts" |
| `dependency` | A dependency added/removed and why | "added zod for runtime schema validation" |
| `workaround` | A hack or temporary fix | "workaround for SQLite FTS5 tokenizer bug" |
| `caveat` | An important warning about behavior/limitations | "rate limiter does not apply to websocket connections" |

**Priority order** (highest to lowest in relevance scoring):
constraint > caveat > tuning > decision > rejection > workaround > intent > dependency

---

### ContextResponse

The standard response format returned by `queryContext()` and the `openqed_context` MCP tool.

```typescript
interface ContextResponse {
  query: {
    path?: string;       // File path queried
    symbol?: string;     // Symbol queried
    text?: string;       // Natural language query text
    depth: string;       // Depth level used
  };
  budget: {
    requested: number;   // Token budget requested
    used: number;        // Tokens actually used
    available: number;   // Remaining budget
    truncated: boolean;  // true if nuggets were dropped due to budget
  };
  nuggets: Array<{
    type: NuggetType;       // Nugget category
    summary: string;        // 1-sentence summary
    detail?: string;        // Extended explanation (omitted in 'summary' depth)
    scope: string;          // File path, symbol, or "workspace"
    confidence: number;     // 0.0-1.0
    sessionDate: string;    // ISO date of the source session
    sessionAgent: string;   // Agent that created the session
    sourcePrompt?: string;  // Original user prompt (only in 'deep' depth)
    alternatives?: string[];// Alternatives considered (for decisions/rejections)
    stale?: boolean;        // true if nugget may be outdated
    staleReason?: string;   // "file_changed" | "superseded" | "expired"
  }>;
  moreContextHint?: string; // Hint about additional nuggets beyond budget
}
```

---

### Relevance Scoring

Nuggets are ranked by a weighted score combining multiple signals:

| Signal | Weight | Description |
|--------|--------|-------------|
| Scope match | 0.30 | Exact file > directory prefix > workspace-wide |
| Type priority | 0.20 | Constraint/caveat ranked highest |
| Recency | 0.15 | Exponential decay, 30-day half-life |
| Confidence | 0.10 | Extraction confidence score |
| FTS relevance | 0.10 | BM25 rank from full-text search (when query text provided) |

**Boosts and penalties:**
- `+0.20` for `constraint` and `caveat` types
- `+0.15` for `tuning` type
- `+0.15` for nuggets that matched an FTS query
- `-0.30` for stale nuggets

Final score is clamped to `[0, 1]`.

---

### Staleness Detection

Three checks determine if a nugget is stale:

1. **File changed** — The file's current SHA256 hash differs from the artifact hash recorded when the session ran.
2. **Superseded** — A newer nugget exists with the same `scopePath` and `type`.
3. **Expired** — The nugget's `staleAfter` date has passed.

Stale nuggets are still returned but with a `-0.30` score penalty and `stale: true` / `staleReason` in the response.

---

### Token Budget

All responses respect a token budget (default: 2000). Tokens are estimated at ~4 characters per token.

**3-pass packing:**

1. **Summaries** — Include as many nugget summaries as fit within budget.
2. **Details** — Add `detail` text to top nuggets (skipped in `summary` depth).
3. **Source prompts** — Add original user prompts (only in `deep` depth).

If nuggets overflow the budget, `budget.truncated` is `true` and `moreContextHint` describes what was omitted.

**Depth levels:**

| Level | Includes |
|-------|----------|
| `summary` | Summary only — most compact |
| `standard` | Summary + detail for top nuggets |
| `deep` | Summary + detail + source prompts |

---

## Programmatic API

For use in custom integrations, scripts, or extensions.

### `queryContext`

```typescript
import { queryContext } from 'openqed-cli/context/query.js';

const response = await queryContext(db, {
  path: 'src/auth.ts',           // optional
  symbol: 'authenticateUser',    // optional
  query: 'why JWT?',             // optional
  tokenBudget: 2000,             // required
  depth: 'standard',             // required: 'summary' | 'standard' | 'deep'
  workspaceId: 'ws_abc123',      // required
  types: ['decision'],           // optional: filter nugget types
  since: new Date('2025-01-01'), // optional: only newer nuggets
}, '/path/to/workspace');
```

Returns a `ContextResponse`.

---

### `ensureNuggetsExtracted`

```typescript
import { ensureNuggetsExtracted } from 'openqed-cli/extraction/scheduler.js';

const nuggets = await ensureNuggetsExtracted(db, parsedSession, {
  force: false,  // re-extract even if already done
  llm: false,    // use LLM extraction (requires Claude Code CLI)
});
```

Returns `ContextNugget[]`. Idempotent — skips sessions that already have nuggets unless `force: true`.

---

### `extractBatch`

```typescript
import { extractBatch } from 'openqed-cli/extraction/scheduler.js';

const result = await extractBatch(db, parsedSessions, {
  force: false,
  llm: false,
  dryRun: false,
});
// result: { extracted: 12, skipped: 3, failed: 0 }
```

---

### Store Functions

```typescript
import {
  insertNugget,
  insertNuggets,
  getNuggetsForSession,
  findNuggetsByScope,
  findNuggetsByWorkspace,
  hasNuggetsForSession,
  deleteNuggetsForSession,
  logContextQuery,
  getQueryGaps,
} from 'openqed-cli/store/nuggets.js';

// Insert a single nugget
const id = insertNugget(db, {
  sessionId: 'abc123',
  type: 'decision',
  summary: 'chose JWT over cookies',
  detail: 'JWT provides stateless auth',
  scopePath: 'src/auth.ts',
  confidence: 0.9,
  extractedAt: new Date().toISOString(),
});

// Find nuggets by scope (exact path + prefix match)
const nuggets = findNuggetsByScope(db, workspaceId, {
  scopePath: 'src/store',      // matches src/store/* files
  types: ['decision', 'constraint'],
  since: new Date('2025-01-01'),
  limit: 50,
});

// Find coverage gaps
const gaps = getQueryGaps(db, workspaceId);
// [{ path: 'src/config.ts', queryCount: 12, nuggetCount: 0 }]
```

---

### FTS Search

```typescript
import {
  indexSessionContent,
  searchSessions,
  searchNuggets,
  buildFtsQuery,
} from 'openqed-cli/store/fts.js';

// Index session content for search
indexSessionContent(db, sessionId, workspaceId, condensedText);

// Search sessions by keyword
const sessions = searchSessions(db, 'JWT authentication', workspaceId, 20);
// [{ sessionId: 'abc123', rank: -3.5 }]

// Search nuggets by keyword
const nuggets = searchNuggets(db, 'Redis caching', workspaceId, 20);
// [{ nuggetId: 42, sessionId: 'abc123', rank: -2.1 }]

// Build FTS5 query from natural language
buildFtsQuery('JWT authentication');    // → 'JWT OR authentication'
buildFtsQuery('"exact phrase"');        // → '"exact phrase"'
```

FTS5 uses Porter stemming: "authentication" matches "auth", "authenticating", etc. BM25 ranking is used — more negative `rank` values indicate higher relevance.

---

## Database Schema

openqed stores everything in SQLite at `~/.openqed/store.db`.

### `context_nuggets`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment ID |
| `session_id` | TEXT | FK to `sessions(id)` |
| `event_id` | INTEGER | FK to `events(id)`, optional |
| `type` | TEXT | Nugget type |
| `summary` | TEXT | 1-sentence summary |
| `detail` | TEXT | Extended explanation |
| `scope_path` | TEXT | File path scope |
| `scope_symbol` | TEXT | Symbol scope (function/class) |
| `confidence` | REAL | 0.0-1.0 |
| `token_cost` | INTEGER | Estimated token cost |
| `extracted_at` | TEXT | ISO timestamp |
| `stale_after` | TEXT | Expiry date (ISO) |
| `metadata` | TEXT | JSON blob |

Indexes: `session_id`, `scope_path`, `scope_symbol`, `type`.

### `context_queries`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment ID |
| `queried_at` | TEXT | ISO timestamp |
| `query_type` | TEXT | `path`, `text`, or `combined` |
| `query_value` | TEXT | The path or query text |
| `workspace_id` | TEXT | FK to `workspaces(id)` |
| `nuggets_returned` | INTEGER | Count of nuggets in response |
| `token_budget` | INTEGER | Budget used for query |
| `agent` | TEXT | Agent that made the query |

### `session_fts` (FTS5 virtual table)

Full-text index over condensed session content. Columns: `session_id`, `workspace_id`, `content`.

### `nuggets_fts` (FTS5 virtual table)

Full-text index over nugget text. Columns: `nugget_id`, `session_id`, `summary`, `detail`.

Both FTS tables use Porter stemming with unicode61 tokenizer.

---

## Typical Workflow

```bash
# 1. Initialize openqed in your repo
openqed init

# 2. Do some AI-assisted coding (Claude Code, Cursor, etc.)
# ...sessions are recorded automatically by your AI tool...

# 3. Extract nuggets from sessions
openqed extract

# 4. Query context
openqed context src/auth.ts
openqed context --query "why did we choose this approach"
openqed context src/store/schema.ts --query "migration" --json

# 5. Browse nuggets
openqed nuggets
openqed nuggets --type decision,constraint
openqed nuggets inspect 42

# 6. Check coverage
openqed coverage
openqed coverage --gaps

# 7. Commit with provenance
openqed commit
```

For AI agents, the MCP server provides the same capabilities automatically — agents can ask "why is this file like this?" and get compact, budget-aware answers drawn from session history.
