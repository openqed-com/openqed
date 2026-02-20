import type {
  ContextQuery,
  ContextResponse,
  ContextResponseNugget,
  ScoredNugget,
} from './types.js';
import { estimateTokens } from '../utils/tokens.js';

function nuggetToResponse(
  nugget: ScoredNugget,
  sessionAgent: string,
  sessionDate: string,
): ContextResponseNugget {
  return {
    type: nugget.type,
    summary: nugget.summary,
    scope: nugget.scopePath ?? nugget.scopeSymbol ?? 'workspace',
    confidence: nugget.confidence,
    sessionDate,
    sessionAgent,
    stale: nugget.isStale || undefined,
    staleReason: nugget.staleReason,
  };
}

function nuggetWithDetail(
  nugget: ScoredNugget,
  sessionAgent: string,
  sessionDate: string,
): ContextResponseNugget {
  const resp = nuggetToResponse(nugget, sessionAgent, sessionDate);
  resp.detail = nugget.detail;
  if (nugget.metadata?.alternatives) {
    resp.alternatives = nugget.metadata.alternatives as string[];
  }
  return resp;
}

export function assembleResponse(
  nuggets: ScoredNugget[],
  query: ContextQuery,
  sessionLookup?: Map<string, { agent: string; date: string }>,
): ContextResponse {
  const budget = query.tokenBudget;
  let used = 0;
  const responseNuggets: ContextResponseNugget[] = [];
  const overflow: ScoredNugget[] = [];

  const getSessionInfo = (sessionId: string) =>
    sessionLookup?.get(sessionId) ?? { agent: 'unknown', date: 'unknown' };

  // Pass 1: Include summaries for as many nuggets as fit
  for (const nugget of nuggets) {
    const summary = nugget.summary;
    const cost = estimateTokens(
      `${nugget.type}: ${summary} [${nugget.scopePath ?? 'workspace'}]`,
    );

    if (used + cost <= budget) {
      const { agent, date } = getSessionInfo(nugget.sessionId);
      responseNuggets.push(nuggetToResponse(nugget, agent, date));
      used += cost;
    } else {
      overflow.push(nugget);
    }
  }

  // Pass 2: Add detail to top nuggets (if depth != 'summary')
  if (query.depth !== 'summary') {
    for (let i = 0; i < responseNuggets.length && i < nuggets.length; i++) {
      const nugget = nuggets[i];
      if (!nugget.detail) continue;

      const detailCost = estimateTokens(nugget.detail);
      if (used + detailCost <= budget) {
        responseNuggets[i].detail = nugget.detail;
        if (nugget.metadata?.alternatives) {
          responseNuggets[i].alternatives = nugget.metadata.alternatives as string[];
        }
        used += detailCost;
      }
    }
  }

  // Pass 3: Add source prompts (if depth == 'deep')
  // This would require loading event data, which we skip for now
  // but the budget tracking still works

  // Generate moreContextHint from overflow
  let moreContextHint: string | undefined;
  if (overflow.length > 0) {
    const types = [...new Set(overflow.map((n) => n.type))];
    moreContextHint = `${overflow.length} more nuggets available (types: ${types.join(', ')}). Increase token budget to see more.`;
  }

  return {
    query: {
      path: query.path,
      symbol: query.symbol,
      text: query.query,
      depth: query.depth,
    },
    budget: {
      requested: budget,
      used,
      available: budget - used,
      truncated: overflow.length > 0,
    },
    nuggets: responseNuggets,
    moreContextHint,
  };
}
