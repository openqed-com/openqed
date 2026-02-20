import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type BetterSqlite3 from 'better-sqlite3';
import { findSessionsByArtifactPath } from '../../store/queries.js';
import { detectWorkspace } from '../../workspace/detect.js';
import { estimateTokens, truncateToTokenBudget } from '../../utils/tokens.js';

export function registerFileHistoryTool(
  server: McpServer,
  db: BetterSqlite3.Database,
): void {
  server.tool(
    'openqed_file_history',
    'Get the AI session history for a specific file — which sessions touched it and when.',
    {
      path: z.string().describe('Relative file path to look up'),
      token_budget: z.number().optional().default(1500).describe('Max tokens in response'),
    },
    async (params) => {
      const workspace = await detectWorkspace(process.cwd());
      const sessions = findSessionsByArtifactPath(db, workspace.id, params.path);

      if (sessions.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ path: params.path, sessions: [], message: 'No sessions found for this file.' }),
            },
          ],
        };
      }

      const budget = params.token_budget ?? 1500;
      const entries = [];
      let used = 0;

      for (const session of sessions) {
        const entry = {
          sessionId: session.id,
          agent: session.agent,
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt?.toISOString(),
        };
        const cost = estimateTokens(JSON.stringify(entry));
        if (used + cost > budget) break;
        entries.push(entry);
        used += cost;
      }

      const result = {
        path: params.path,
        sessions: entries,
        total: sessions.length,
        shown: entries.length,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
