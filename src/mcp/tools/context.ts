import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type BetterSqlite3 from 'better-sqlite3';
import { queryContext } from '../../context/query.js';
import { detectWorkspace } from '../../workspace/detect.js';
import type { ContextQuery, NuggetType } from '../../context/types.js';

export function registerContextTool(
  server: McpServer,
  db: BetterSqlite3.Database,
): void {
  server.tool(
    'openqed_context',
    'Query context/provenance for a file or topic. Returns ranked nuggets explaining WHY code is the way it is.',
    {
      path: z.string().optional().describe('File path to query context for'),
      symbol: z.string().optional().describe('Specific symbol (function, class) to query'),
      query: z.string().optional().describe('Natural language query (e.g., "why does auth use JWT?")'),
      token_budget: z.number().optional().default(2000).describe('Max tokens in response'),
      types: z.array(z.string()).optional().describe('Filter by nugget types'),
      depth: z.enum(['summary', 'standard', 'deep']).optional().default('standard'),
    },
    async (params) => {
      const workspace = await detectWorkspace(process.cwd());

      const contextQuery: ContextQuery = {
        path: params.path,
        symbol: params.symbol,
        query: params.query,
        tokenBudget: params.token_budget ?? 2000,
        types: params.types as NuggetType[] | undefined,
        depth: params.depth ?? 'standard',
        workspaceId: workspace.id,
      };

      const response = await queryContext(db, contextQuery, workspace.path);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );
}
