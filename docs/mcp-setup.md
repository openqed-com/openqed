# MCP Server Setup

openqed includes an MCP (Model Context Protocol) server that gives AI agents direct access to your codebase's provenance. When an agent reads or modifies a file, it can query openqed to understand **why** the code was written the way it was — without you having to explain it.

## Prerequisites

1. openqed installed (`npm install -g openqed-cli`)
2. Repository initialized (`openqed init`)
3. Nuggets extracted (`openqed extract`)

Without extracted nuggets, the MCP tools will return empty results.

## Claude Code Setup

### Project-level (recommended)

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "openqed": {
      "command": "openqed-mcp-server"
    }
  }
}
```

This makes openqed available to Claude Code whenever it's working in this project.

### User-level

Add to `~/.claude/settings.json` to enable openqed across all projects:

```json
{
  "mcpServers": {
    "openqed": {
      "command": "openqed-mcp-server"
    }
  }
}
```

### Alternative: using the CLI subcommand

If `openqed-mcp-server` is not on your PATH, use the CLI subcommand instead:

```json
{
  "mcpServers": {
    "openqed": {
      "command": "openqed",
      "args": ["mcp-server"]
    }
  }
}
```

## Available Tools

Once configured, AI agents get access to three tools:

### `openqed_context`

Query context/provenance for a file or topic. Returns ranked nuggets explaining **why** code is the way it is.

```
"Why is this file structured this way?"
→ openqed_context({ path: "src/store/schema.ts", depth: "standard" })

"What decisions were made about authentication?"
→ openqed_context({ query: "authentication decisions", types: ["decision", "rejection"] })
```

### `openqed_file_history`

Get the AI session history for a specific file — which sessions touched it and when.

```
"When was this file last modified by an AI agent?"
→ openqed_file_history({ path: "src/auth.ts" })
```

### `openqed_decisions`

Get architectural decisions, rejections, and constraints from AI sessions.

```
"What architectural decisions apply to the auth module?"
→ openqed_decisions({ path: "src/auth.ts" })
```

See [API Reference — MCP Tools](api.md#mcp-tools) for full parameter schemas and response formats.

## Troubleshooting

### No nuggets returned

- Run `openqed extract` first — nuggets must be extracted before they can be queried
- Check that sessions exist: `openqed sessions`
- Try `openqed extract --llm` for higher-quality extraction

### Wrong directory

The MCP server uses the current working directory to find the openqed store. Make sure your editor is opened at the project root where `openqed init` was run.

### Store not initialized

If you see an error about the store not being found, run `openqed init` in the project directory.

### Server not starting

- Verify `openqed-mcp-server` is on your PATH: `which openqed-mcp-server`
- If using a local install, use the full path: `./node_modules/.bin/openqed-mcp-server`
- Check stderr output for errors — the MCP server logs to stderr, not stdout
