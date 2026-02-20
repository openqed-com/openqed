# openqed

AI session provenance for commits, PRs, and reviews.

openqed tracks which parts of your code were written by AI coding agents (Claude Code, etc.) and automatically generates attributed commit messages with provenance metadata.

## Features

- **Automatic attribution** — detects which staged files were AI-generated vs human-written
- **Smart commit messages** — generates conventional commit messages using LLM or offline heuristics
- **Session inspection** — browse and inspect AI coding sessions in your project
- **Git trailers** — adds `openqed-Session`, `openqed-Attribution`, and `Co-authored-by` metadata
- **Git hook integration** — optional `prepare-commit-msg` hook for seamless workflow

## Requirements

- Node.js >= 20
- Git repository
- [Claude Code](https://claude.ai/claude-code) (for session detection and LLM-powered commit messages)

## Install

```bash
npm install -g openqed-cli
```

Or install locally in your project:

```bash
npm install --save-dev openqed-cli
```

### Development (from source)

```bash
git clone https://github.com/your-org/openqed.git
cd openqed
npm install
npm run build
```

## Quick Start

### 1. Initialize in your repo

```bash
cd your-project
openqed init
```

This creates a `.openqed/` directory (gitignored), and optionally installs a `prepare-commit-msg` git hook.

### 2. Generate a commit message

Stage some files, then:

```bash
# Preview the generated message (no commit)
openqed commit --dry-run

# Auto-commit with the generated message
openqed commit --auto

# Open in $EDITOR for review before committing
openqed commit

# Use offline heuristics (no LLM call)
openqed commit --offline
```

### 3. Browse AI sessions

```bash
# List all detected sessions
openqed sessions

# List sessions from the last 3 days
openqed sessions --since 3d

# Inspect a specific session
openqed sessions inspect <session-id>
```

## Testing It Out

The quickest way to test openqed end-to-end:

```bash
# 1. Build
npm run build

# 2. In any git repo with staged changes:
git add <some-files>

# 3. Preview what openqed would generate
node /path/to/openqed/dist/index.js commit --dry-run --offline

# 4. Or link it globally for convenience
npm link
openqed commit --dry-run --offline
```

If you have Claude Code installed and have used it in the repo, openqed will automatically find the relevant session and include attribution data in the commit message.

## Commands

### `openqed init [--force]`

Initialize openqed in the current git repository.

| Flag | Description |
|------|-------------|
| `--force` | Overwrite an existing `prepare-commit-msg` hook |

### `openqed commit [options]`

Generate an AI-attributed commit message for staged changes.

| Flag | Description |
|------|-------------|
| `--auto` | Commit automatically without opening an editor |
| `--dry-run` | Print the message to stdout without committing |
| `--hook <file>` | Write message to a file (used by the git hook) |
| `--model <model>` | Specify which LLM model to use |
| `--offline` | Use offline heuristic generation (no LLM) |

### `openqed sessions [options]`

List AI coding sessions detected in the current workspace.

| Flag | Description |
|------|-------------|
| `--since <duration>` | Filter sessions (e.g. `3d`, `1w`, `24h`, `2m`) |

### `openqed sessions inspect <id>`

Show detailed information about a session: user prompts, artifacts created/modified, and event summary.

## How It Works

1. **Session detection** — openqed reads Claude Code session logs from `~/.claude/projects/` to find sessions relevant to your workspace
2. **File attribution** — staged files are cross-referenced with session artifacts to determine which were AI-generated
3. **Message generation** — a commit message is generated via LLM (using Claude Code) or offline heuristics based on the diff, file names, and session context
4. **Trailers** — provenance metadata is appended as git trailers:

```
feat(auth): add JWT token validation

openqed-Session: session-abc123
openqed-Attribution: 75% agent (src/auth.ts, src/middleware.ts, src/types.ts), 25% human (config.json)
Co-authored-by: Claude Code <noreply@anthropic.com>
```

## Development

```bash
npm run build        # Build with tsup
npm run dev          # Watch mode
npm run typecheck    # Type checking
npm run test         # Run tests (watch mode)
npm run test:run     # Run tests once
```

## License

MIT
