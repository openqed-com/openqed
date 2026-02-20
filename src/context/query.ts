import type BetterSqlite3 from 'better-sqlite3';
import type { ContextQuery, ContextNugget, ContextResponse } from './types.js';
import { findNuggetsByScope, logContextQuery } from '../store/nuggets.js';
import { searchNuggets, searchSessions } from '../store/fts.js';
import { findSessionsByArtifactPath } from '../store/queries.js';
import { getSession } from '../store/store.js';
import { checkBatchStaleness } from './staleness.js';
import { rankNuggets } from './relevance.js';
import { assembleResponse } from './budget.js';
import { ensureNuggetsExtracted } from '../extraction/scheduler.js';
import { debug } from '../utils/logger.js';

async function lazyExtractForSessions(
  db: BetterSqlite3.Database,
  sessionIds: string[],
  workspaceId: string,
): Promise<void> {
  // We can only do lazy extraction if we have access to adapter/parsed sessions
  // For now, we skip lazy extraction — nuggets must be pre-extracted
  // This is a placeholder for when adapter integration is wired in
  debug(`Lazy extraction requested for ${sessionIds.length} sessions (skipped — use 'openqed extract' first)`);
}

function getNuggetsById(
  db: BetterSqlite3.Database,
  nuggetIds: number[],
): ContextNugget[] {
  if (nuggetIds.length === 0) return [];

  const placeholders = nuggetIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT * FROM context_nuggets WHERE id IN (${placeholders})`,
  ).all(...nuggetIds) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as number,
    sessionId: row.session_id as string,
    eventId: (row.event_id as number) ?? undefined,
    type: row.type as ContextNugget['type'],
    summary: row.summary as string,
    detail: (row.detail as string) ?? undefined,
    scopePath: (row.scope_path as string) ?? undefined,
    scopeSymbol: (row.scope_symbol as string) ?? undefined,
    confidence: (row.confidence as number) ?? 1.0,
    tokenCost: (row.token_cost as number) ?? undefined,
    extractedAt: row.extracted_at as string,
    staleAfter: (row.stale_after as string) ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
  }));
}

function buildSessionLookup(
  db: BetterSqlite3.Database,
  sessionIds: string[],
): Map<string, { agent: string; date: string }> {
  const lookup = new Map<string, { agent: string; date: string }>();
  for (const sid of sessionIds) {
    const session = getSession(db, sid);
    if (session) {
      lookup.set(sid, {
        agent: session.agent,
        date: session.startedAt.toISOString(),
      });
    }
  }
  return lookup;
}

export async function queryContext(
  db: BetterSqlite3.Database,
  query: ContextQuery,
  workspacePath: string,
): Promise<ContextResponse> {
  let allNuggets: ContextNugget[] = [];
  const ftsRanks = new Map<number, number>();
  const seenIds = new Set<number>();

  // Path-based query
  if (query.path) {
    const scopeNuggets = findNuggetsByScope(db, query.workspaceId, {
      scopePath: query.path,
      scopeSymbol: query.symbol,
      types: query.types,
      since: query.since,
    });

    for (const n of scopeNuggets) {
      if (!seenIds.has(n.id)) {
        allNuggets.push(n);
        seenIds.add(n.id);
      }
    }

    // If no nuggets found, try lazy extraction via artifact path
    if (allNuggets.length === 0) {
      const sessions = findSessionsByArtifactPath(db, query.workspaceId, query.path);
      if (sessions.length > 0) {
        await lazyExtractForSessions(
          db,
          sessions.map((s) => s.id),
          query.workspaceId,
        );
        // Re-query after extraction
        const retried = findNuggetsByScope(db, query.workspaceId, {
          scopePath: query.path,
          types: query.types,
          since: query.since,
        });
        for (const n of retried) {
          if (!seenIds.has(n.id)) {
            allNuggets.push(n);
            seenIds.add(n.id);
          }
        }
      }
    }
  }

  // Natural language query (FTS)
  if (query.query) {
    // Search nuggets via FTS
    const ftsNuggetResults = searchNuggets(db, query.query, query.workspaceId);
    const ftsNuggetIds = ftsNuggetResults.map((r) => r.nuggetId);

    if (ftsNuggetIds.length > 0) {
      const ftsNuggets = getNuggetsById(db, ftsNuggetIds);
      for (const n of ftsNuggets) {
        if (!seenIds.has(n.id)) {
          allNuggets.push(n);
          seenIds.add(n.id);
        }
        // Record FTS rank for scoring
        const ftsResult = ftsNuggetResults.find((r) => r.nuggetId === n.id);
        if (ftsResult) {
          ftsRanks.set(n.id, ftsResult.rank);
        }
      }
    }

    // Search sessions via FTS
    const ftsSessionResults = searchSessions(db, query.query, query.workspaceId);
    if (ftsSessionResults.length > 0) {
      const sessionIds = ftsSessionResults.map((r) => r.sessionId);

      // Get nuggets from matched sessions
      for (const sid of sessionIds) {
        const sessionNuggets = findNuggetsByScope(db, query.workspaceId, {
          types: query.types,
          since: query.since,
          limit: 20,
        });
        for (const n of sessionNuggets) {
          if (n.sessionId === sid && !seenIds.has(n.id)) {
            allNuggets.push(n);
            seenIds.add(n.id);
          }
        }
      }
    }
  }

  // Filter by types and since if specified (for FTS results that weren't pre-filtered)
  if (query.types && query.types.length > 0) {
    allNuggets = allNuggets.filter((n) => query.types!.includes(n.type));
  }
  if (query.since) {
    const sinceStr = query.since.toISOString();
    allNuggets = allNuggets.filter((n) => n.extractedAt >= sinceStr);
  }

  // Check staleness
  const stalenessMap = checkBatchStaleness(db, allNuggets, workspacePath);

  // Rank nuggets
  const ranked = rankNuggets(allNuggets, query, stalenessMap, ftsRanks);

  // Build session lookup for response formatting
  const sessionIds = [...new Set(ranked.map((n) => n.sessionId))];
  const sessionLookup = buildSessionLookup(db, sessionIds);

  // Assemble budget-aware response
  const response = assembleResponse(ranked, query, sessionLookup);

  // Log the query
  const queryType = query.path ? (query.query ? 'combined' : 'path') : 'text';
  const queryValue = query.path ?? query.query ?? '';
  logContextQuery(db, {
    queriedAt: new Date().toISOString(),
    queryType,
    queryValue,
    workspaceId: query.workspaceId,
    nuggetsReturned: response.nuggets.length,
    tokenBudget: query.tokenBudget,
  });

  return response;
}
