# Team Sharing

Share AI provenance across your team so that everyone — and every AI agent — has the context behind your code.

## Why Share Provenance

AI coding sessions are local. When a teammate clones the repo, they get the code but lose all the context: why was JWT chosen over session cookies? What alternatives were rejected? What constraints shaped the architecture?

openqed solves this by exporting provenance data as JSONL files that live in your git repo. When teammates pull and import, they get the full context — just like they were in the room when the decisions were made.

## How It Works

```
.openqed/
├── data/              ← committed to git (shared provenance)
│   ├── sessions.jsonl
│   ├── nuggets.jsonl
│   ├── decisions.jsonl
│   └── artifacts.jsonl
└── local/             ← gitignored (machine-specific data)
```

- `.openqed/data/` contains exported JSONL files and is committed to git
- `.openqed/local/` is gitignored and holds machine-specific data
- `openqed init` sets up the `.gitignore` rules automatically

## Export Workflow

Export provenance from your local SQLite database to JSONL:

```bash
# Export default types (nuggets, sessions, decisions, artifacts)
openqed export

# Export everything including events
openqed export --all

# Export specific types
openqed export --types nuggets,decisions

# Preview what would be exported
openqed export --dry-run
```

Files are written to `.openqed/data/` as one JSON record per line:
- `sessions.jsonl` — session metadata (agent, timestamps, summary)
- `nuggets.jsonl` — context nuggets (type, summary, detail, scope, confidence)
- `decisions.jsonl` — architectural decisions with reasoning and alternatives
- `artifacts.jsonl` — files created/modified by sessions
- `events.jsonl` — raw session events (excluded by default, can be large)

## Import Workflow

Import provenance from JSONL files into your local SQLite database:

```bash
# Import all available types
openqed import

# Import specific types
openqed import --types nuggets,decisions

# Preview what would be imported
openqed import --dry-run
```

Import is **idempotent** — duplicate records are skipped automatically. You can safely run `openqed import` multiple times after pulling new changes.

## Recommended Team Workflow

### Initial setup (one team member)

```bash
# 1. Initialize openqed
openqed init

# 2. Extract nuggets from AI sessions
openqed extract
# or for higher quality:
openqed extract --llm

# 3. Export to JSONL
openqed export

# 4. Commit the exported data
git add .openqed/data/
git commit -m "chore: add openqed provenance data"
git push
```

### Teammates joining

```bash
# 1. Clone/pull the repo (gets .openqed/data/*.jsonl)
git pull

# 2. Initialize openqed locally
openqed init

# 3. Import shared provenance
openqed import

# 4. Query context immediately
openqed context src/auth.ts
```

### Ongoing workflow

```bash
# After an AI coding session:
openqed extract          # extract new nuggets
openqed export           # update JSONL files
git add .openqed/data/
git commit -m "chore: update openqed provenance"

# After pulling changes:
openqed import           # import teammates' provenance
```

## Configuration

Export behavior can be configured in `.openqed/config.yml`:

```yaml
version: 1
export:
  nuggets: true       # context nuggets
  sessions: true      # session metadata
  decisions: true     # architectural decisions
  artifacts: true     # file artifacts
  events: false       # raw events (large, off by default)
```

This file is created automatically by `openqed init`. Adjust it to control which types are exported by default.

See [API Reference](api.md#cli-commands) for all command flags.
