import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type BetterSqlite3 from 'better-sqlite3';
import { findNuggetsByWorkspace, findNuggetsByScope } from '../../store/nuggets.js';
import { detectWorkspace } from '../../workspace/detect.js';
import { estimateTokens } from '../../utils/tokens.js';

const DECISION_TYPES = ['decision', 'rejection', 'constraint'];

export function registerDecisionsTool(
  server: McpServer,
  db: BetterSqlite3.Database,
): void {
  server.tool(
    'openqed_decisions',
    'Get architectural decisions, rejections, and constraints from AI sessions.',
    {
      path: z.string().optional().describe('Optional file path to scope the query'),
      token_budget: z.number().optional().default(2000).describe('Max tokens in response'),
    },
    async (params) => {
      const workspace = await detectWorkspace(process.cwd());
      const budget = params.token_budget ?? 2000;

      let nuggets;
      if (params.path) {
        nuggets = findNuggetsByScope(db, workspace.id, {
          scopePath: params.path,
          types: DECISION_TYPES,
          limit: 50,
        });
      } else {
        nuggets = findNuggetsByWorkspace(db, workspace.id, {
          types: DECISION_TYPES,
          limit: 50,
        });
      }

      // Budget-aware output
      const entries = [];
      let used = 0;

      for (const nugget of nuggets) {
        const entry = {
          id: nugget.id,
          type: nugget.type,
          summary: nugget.summary,
          detail: nugget.detail,
          scope: nugget.scopePath ?? nugget.scopeSymbol ?? 'workspace',
          confidence: nugget.confidence,
          alternatives: nugget.metadata?.alternatives,
        };
        const cost = estimateTokens(JSON.stringify(entry));
        if (used + cost > budget) break;
        entries.push(entry);
        used += cost;
      }

      const result = {
        decisions: entries,
        total: nuggets.length,
        shown: entries.length,
        scope: params.path ?? 'workspace',
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
