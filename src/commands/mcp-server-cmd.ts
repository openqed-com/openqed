import { Command } from 'commander';
import { startMcpServer } from '../mcp/server.js';

async function runMcpServer(): Promise<void> {
  await startMcpServer();
}

export function createMcpServerCommand(): Command {
  return new Command('mcp-server')
    .description('Start the MCP server for Claude Code / Cursor integration')
    .action(runMcpServer);
}
