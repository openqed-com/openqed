# How Context Works

This document explains the internals of openqed's context system — how provenance is extracted from AI sessions, stored as nuggets, and queried.

## Pipeline Overview

```
AI Sessions          Extract            Store             Query              Response
(~/.claude/    →   openqed extract  →   SQLite DB    →  openqed context  →  Ranked nuggets
 projects/)        (heuristic/LLM)     (nuggets,        (CLI or MCP)       (budget-aware)
                                        FTS indexes)
```

1. **Sessions** — AI coding tools (Claude Code, etc.) write session logs to disk
2. **Extract** — `openqed extract` processes sessions into structured nuggets
3. **Store** — Nuggets are stored in SQLite with FTS5 full-text indexes
4. **Query** — CLI or MCP server finds, filters, scores, and packs nuggets into a response
5. **Response** — Token-budget-aware output with relevance ranking

## Nugget Types

A **nugget** is a single piece of provenance — one reason why code is the way it is. There are 8 types, listed here in priority order (highest relevance first):

| Priority | Type | Description | Example |
|----------|------|-------------|---------|
| 1.0 | `constraint` | A requirement or limitation that shaped the code | "must support Node 18+" |
| 0.9 | `caveat` | An important warning about behavior or limitations | "rate limiter does not apply to websocket connections" |
| 0.8 | `tuning` | Human edited AI-generated output | "human-edited AI output in src/auth.ts" |
| 0.7 | `decision` | A deliberate choice between alternatives | "chose Redis over Memcached for caching" |
| 0.6 | `rejection` | Something explicitly considered and rejected | "considered GraphQL but rejected due to complexity" |
| 0.5 | `workaround` | A hack or temporary fix | "workaround for SQLite FTS5 tokenizer bug" |
| 0.4 | `intent` | What the user/agent was trying to accomplish | "add JWT authentication to login" |
| 0.3 | `dependency` | A dependency added/removed and why | "added zod for runtime schema validation" |

Constraints and caveats rank highest because they describe things that **must not** be violated — critical context for any agent modifying the code.

## Heuristic vs LLM Extraction

Nuggets are extracted from sessions via two methods:

### Heuristic Extraction (default)

Fast, offline, no API calls. Extracts by pattern-matching on session data:

- **Intent from first prompt** — cleans and truncates the user's initial request (confidence: 0.6)
- **Per-file intents** — cross-references file mentions in prompts with session artifacts (confidence: 0.5)
- **Tuning nuggets** — identifies files with mixed human+AI authorship (confidence: 0.65)
- **File scope nuggets** — tracks created, modified, and deleted files (confidence: 0.7)

Heuristic extraction produces mostly `intent` and `tuning` type nuggets. It cannot reliably detect decisions, constraints, or rejections.

### LLM Extraction (`--llm`)

Higher quality, requires Claude Code CLI, costs API tokens. Sends a condensed session transcript to an LLM with a structured extraction prompt. Produces all 8 nugget types with richer summaries and detail text.

The LLM is asked to return a JSON array of nuggets, each with:
- `type` — one of the 8 types
- `summary` — max 120 characters
- `detail` — 1-3 sentences of elaboration (optional)
- `scope_path` / `scope_symbol` — file or symbol scope (optional)
- `confidence` — 0.0-1.0
- `alternatives` — alternatives considered, for decisions/rejections (optional)

Use heuristic extraction for fast iteration; use LLM extraction when you want high-quality provenance for important codebases.

## Query Pipeline

When you run `openqed context src/auth.ts`, the query goes through these steps:

### Step 1: Find Candidates

Two sources of candidates, depending on the query:

- **Scope-based** — if a file path is provided, find nuggets scoped to that file, its parent directories, or the whole workspace
- **FTS search** — if a natural language query is provided, search the FTS5 full-text index over nugget summaries/details and session content (BM25 ranking, Porter stemming)

When both path and query are provided, candidates from both sources are merged.

### Step 2: Check Staleness

Each candidate nugget is checked for three staleness conditions:

1. **File changed** — the file's current SHA256 hash differs from the hash recorded when the session ran
2. **Superseded** — a newer nugget exists with the same scope path and type
3. **Expired** — the nugget's `staleAfter` date has passed

Stale nuggets are still returned, but with a `stale: true` flag and a relevance score penalty.

### Step 3: Score and Rank

Each nugget gets a relevance score from 0 to 1, computed as a weighted sum:

| Signal | Weight | How it's computed |
|--------|--------|-------------------|
| Scope match | 0.30 | Exact file = 1.0, directory prefix = 0.6, same dir = 0.5, workspace-wide = 0.2 |
| Type priority | 0.20 | constraint = 1.0 down to dependency = 0.3 (see table above) |
| Recency | 0.15 | Exponential decay with 30-day half-life |
| Confidence | 0.10 | The nugget's extraction confidence score |
| FTS relevance | 0.10 | BM25 rank from full-text search (when query text provided) |

**Boosts and penalties** applied after the weighted sum:

| Modifier | Value | Condition |
|----------|-------|-----------|
| Constraint/caveat boost | +0.20 | Nugget type is `constraint` or `caveat` |
| Tuning boost | +0.15 | Nugget type is `tuning` |
| FTS match bonus | +0.15 | Nugget matched an FTS query |
| Stale penalty | -0.30 | Nugget is stale |

The final score is clamped to [0, 1]. Nuggets are sorted by descending score.

### Step 4: Pack into Token Budget

Responses respect a token budget (default: 2000 tokens, estimated at ~4 characters per token). Packing uses 3 passes:

1. **Summaries** — include as many nugget summaries as fit within the budget
2. **Details** — add `detail` text to the top nuggets (skipped at `summary` depth)
3. **Source prompts** — add original user prompts (only at `deep` depth)

If nuggets overflow the budget, the response includes `budget.truncated: true` and a `moreContextHint` describing what was omitted.

### Depth Levels

| Level | Includes | Best for |
|-------|----------|----------|
| `summary` | Summary only | Quick agent lookups, scanning many files |
| `standard` | Summary + detail for top nuggets | General use (default) |
| `deep` | Summary + detail + source prompts | Deep investigation of specific decisions |

## Database

Nuggets are stored in SQLite at `~/.openqed/store.db`. Two FTS5 virtual tables provide full-text search:

- `session_fts` — indexes condensed session content
- `nuggets_fts` — indexes nugget summaries and details

Both use Porter stemming with unicode61 tokenizer, so "authentication" matches "auth", "authenticating", etc.

See [API Reference — Database Schema](api.md#database-schema) for the full table definitions.
