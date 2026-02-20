import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initStore } from '../store/index.js';
import { registerContextTool } from './tools/context.js';
import { registerFileHistoryTool } from './tools/file-history.js';
import { registerDecisionsTool } from './tools/decisions.js';

export async function startMcpServer(): Promise<void> {
  const db = await initStore();

  const server = new McpServer({
    name: 'openqed',
    version: '0.1.0',
  });

  registerContextTool(server, db);
  registerFileHistoryTool(server, db);
  registerDecisionsTool(server, db);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error('openqed MCP server running on stdio');
}
