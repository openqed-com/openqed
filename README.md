# openqed

Track why your code was written — not just what changed.

openqed extracts provenance from AI coding sessions (Claude Code, Cursor, etc.) and makes it queryable via CLI and MCP server. When an AI agent or teammate asks "why is this code like this?", openqed has the answer.

## What It Looks Like

```
$ openqed context src/auth.ts

Context for src/auth.ts (3 nuggets, 312 tokens)

  [decision] chose JWT over session cookies for stateless auth
    JWT provides stateless authentication which is better for horizontal scaling
    src/auth.ts | claude-code | 2025-01-15

  [constraint] must support Node 18 and above
    workspace | claude-code | 2025-01-15

  [tuning] human-edited AI output in src/auth.ts
    src/auth.ts | claude-code | 2025-01-15
```

Every piece of context — a **nugget** — is one reason why code is the way it is: a decision made, a constraint imposed, an alternative rejected, a workaround applied.

## Features

**Context & Provenance**
- Extract context nuggets from AI sessions — decisions, constraints, rejections, workarounds, and more
- Query by file path, symbol name, or natural language
- 8 nugget types with weighted relevance scoring and staleness detection
- Token-budget-aware responses with summary, standard, and deep depth levels

**AI Agent Integration**
- MCP server with 3 tools: query context, file history, and architectural decisions
- Works with Claude Code, Cursor, Kiro, and any MCP-compatible editor
- Agents automatically get provenance when reading or modifying code

**Commit Attribution**
- Smart commit messages generated from diffs and session context
- Git trailers linking commits to AI sessions (`openqed-Session`, `openqed-Attribution`)
- Optional `prepare-commit-msg` hook for seamless workflow

**Team Sharing**
- Export/import provenance as JSONL files committed to git
- Teammates clone the repo and import — no central server needed
- See [Team Sharing Guide](docs/team-sharing.md) for the full workflow

## Requirements

- Node.js >= 20
- Git repository
- [Claude Code](https://claude.ai/claude-code) (for session detection and LLM-powered features)

## Quick Start

```bash
# 1. Install
npm install -g openqed-cli

# 2. Initialize in your repo
cd your-project
openqed init

# 3. Extract nuggets from existing AI sessions
openqed extract

# 4. Query context for any file
openqed context src/auth.ts
openqed context --query "why did we choose this approach"

# 5. (Optional) Set up MCP server for AI agent integration
# See docs/mcp-setup.md for full instructions
```

## How It Works

openqed reads AI coding session logs (e.g. from `~/.claude/projects/`) to find sessions relevant to your workspace. It extracts structured **context nuggets** from those sessions — either via fast heuristic pattern-matching or higher-quality LLM extraction. When you or an AI agent queries a file, openqed finds relevant nuggets, checks for staleness, scores them by relevance, and returns a token-budget-aware response. See [How Context Works](docs/how-context-works.md) for the full pipeline.

## CLI Commands

| Command | Description |
|---------|-------------|
| `openqed init` | Initialize openqed in the current git repository |
| `openqed commit` | Generate an AI-attributed commit message for staged changes |
| `openqed sessions` | List AI coding sessions detected in the workspace |
| `openqed sessions inspect <id>` | Show detailed session information |
| `openqed extract` | Extract context nuggets from AI sessions |
| `openqed context <path>` | Query context for a file or topic |
| `openqed nuggets` | Browse and inspect extracted nuggets |
| `openqed coverage` | Show nugget coverage across files |
| `openqed export` | Export provenance data as JSONL |
| `openqed import` | Import provenance data from JSONL |
| `openqed mcp-server` | Start the MCP server |

See [API Reference](docs/api.md) for all flags and options.

## MCP Tools

| Tool | Description |
|------|-------------|
| `openqed_context` | Query context/provenance for a file or topic — returns ranked nuggets |
| `openqed_file_history` | Get AI session history for a specific file |
| `openqed_decisions` | Get architectural decisions, rejections, and constraints |

See [MCP Setup Guide](docs/mcp-setup.md) for configuration and [API Reference](docs/api.md#mcp-tools) for schemas.

## Export & Import

Share provenance across your team by exporting to JSONL and committing to git:

```bash
openqed export          # writes to .openqed/data/*.jsonl
git add .openqed/data/
git commit -m "chore: export openqed provenance"

# Teammates after pulling:
openqed init
openqed import          # reads from .openqed/data/*.jsonl
```

Import is idempotent — duplicates are skipped. See [Team Sharing Guide](docs/team-sharing.md) for the recommended workflow.

## Development

```bash
git clone https://github.com/your-org/openqed.git
cd openqed
npm install
npm run build        # Build with tsup
npm run dev          # Watch mode
npm run typecheck    # Type checking
npm run test         # Run tests (watch mode)
npm run test:run     # Run tests once
```

## License

MIT
