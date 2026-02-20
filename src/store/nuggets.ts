import type BetterSqlite3 from 'better-sqlite3';
import type { ContextNugget, ContextQueryLog } from '../context/types.js';

function rowToNugget(row: Record<string, unknown>): ContextNugget {
  return {
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
  };
}

export function insertNugget(
  db: BetterSqlite3.Database,
  nugget: Omit<ContextNugget, 'id'>,
): number {
  const result = db.prepare(
    `INSERT INTO context_nuggets (session_id, event_id, type, summary, detail, scope_path, scope_symbol, confidence, token_cost, extracted_at, stale_after, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    nugget.sessionId,
    nugget.eventId ?? null,
    nugget.type,
    nugget.summary,
    nugget.detail ?? null,
    nugget.scopePath ?? null,
    nugget.scopeSymbol ?? null,
    nugget.confidence,
    nugget.tokenCost ?? null,
    nugget.extractedAt,
    nugget.staleAfter ?? null,
    nugget.metadata ? JSON.stringify(nugget.metadata) : null,
  );

  const nuggetId = Number(result.lastInsertRowid);

  // Also index in FTS
  db.prepare(
    `INSERT INTO nuggets_fts (nugget_id, session_id, summary, detail)
     VALUES (?, ?, ?, ?)`,
  ).run(nuggetId, nugget.sessionId, nugget.summary, nugget.detail ?? '');

  return nuggetId;
}

export function insertNuggets(
  db: BetterSqlite3.Database,
  nuggets: Omit<ContextNugget, 'id'>[],
): number[] {
  const ids: number[] = [];
  const batchInsert = db.transaction(() => {
    for (const nugget of nuggets) {
      ids.push(insertNugget(db, nugget));
    }
  });
  batchInsert();
  return ids;
}

export function getNuggetsForSession(
  db: BetterSqlite3.Database,
  sessionId: string,
): ContextNugget[] {
  const rows = db
    .prepare('SELECT * FROM context_nuggets WHERE session_id = ? ORDER BY id')
    .all(sessionId) as Record<string, unknown>[];
  return rows.map(rowToNugget);
}

export interface FindNuggetsOptions {
  scopePath?: string;
  scopeSymbol?: string;
  types?: string[];
  since?: Date;
  limit?: number;
}

export function findNuggetsByScope(
  db: BetterSqlite3.Database,
  workspaceId: string,
  opts: FindNuggetsOptions = {},
): ContextNugget[] {
  const conditions = ['s.workspace_id = ?'];
  const params: unknown[] = [workspaceId];

  if (opts.scopePath) {
    // Match exact path OR path prefix (files in directory)
    conditions.push('(cn.scope_path = ? OR cn.scope_path LIKE ? || \'/%\')');
    params.push(opts.scopePath, opts.scopePath);
  }

  if (opts.scopeSymbol) {
    conditions.push('cn.scope_symbol = ?');
    params.push(opts.scopeSymbol);
  }

  if (opts.types && opts.types.length > 0) {
    const placeholders = opts.types.map(() => '?').join(', ');
    conditions.push(`cn.type IN (${placeholders})`);
    params.push(...opts.types);
  }

  if (opts.since) {
    conditions.push('cn.extracted_at >= ?');
    params.push(opts.since.toISOString());
  }

  const limit = opts.limit ?? 100;
  params.push(limit);

  const sql = `
    SELECT cn.*
    FROM context_nuggets cn
    JOIN sessions s ON cn.session_id = s.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY cn.confidence DESC, cn.id DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToNugget);
}

export function findNuggetsByWorkspace(
  db: BetterSqlite3.Database,
  workspaceId: string,
  opts: { types?: string[]; limit?: number } = {},
): ContextNugget[] {
  const conditions = ['s.workspace_id = ?'];
  const params: unknown[] = [workspaceId];

  if (opts.types && opts.types.length > 0) {
    const placeholders = opts.types.map(() => '?').join(', ');
    conditions.push(`cn.type IN (${placeholders})`);
    params.push(...opts.types);
  }

  const limit = opts.limit ?? 100;
  params.push(limit);

  const sql = `
    SELECT cn.*
    FROM context_nuggets cn
    JOIN sessions s ON cn.session_id = s.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY cn.confidence DESC, cn.id DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToNugget);
}

export function getAllNuggetsForExport(
  db: BetterSqlite3.Database,
  workspaceId: string,
): Record<string, unknown>[] {
  const sql = `
    SELECT cn.* FROM context_nuggets cn
    JOIN sessions s ON cn.session_id = s.id
    WHERE s.workspace_id = ?
    ORDER BY cn.extracted_at ASC, cn.id ASC
  `;
  return db.prepare(sql).all(workspaceId) as Record<string, unknown>[];
}

export function hasNuggetsForSession(
  db: BetterSqlite3.Database,
  sessionId: string,
): boolean {
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM context_nuggets WHERE session_id = ?')
    .get(sessionId) as { cnt: number };
  return row.cnt > 0;
}

export function deleteNuggetsForSession(
  db: BetterSqlite3.Database,
  sessionId: string,
): void {
  const deleteAll = db.transaction(() => {
    // Delete from FTS first (need nugget IDs)
    const nuggetIds = db
      .prepare('SELECT id FROM context_nuggets WHERE session_id = ?')
      .all(sessionId) as { id: number }[];

    for (const { id } of nuggetIds) {
      db.prepare('DELETE FROM nuggets_fts WHERE nugget_id = ?').run(id);
    }

    db.prepare('DELETE FROM context_nuggets WHERE session_id = ?').run(sessionId);
  });
  deleteAll();
}

export function logContextQuery(
  db: BetterSqlite3.Database,
  query: ContextQueryLog,
): number {
  const result = db.prepare(
    `INSERT INTO context_queries (queried_at, query_type, query_value, workspace_id, nuggets_returned, token_budget, agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    query.queriedAt,
    query.queryType,
    query.queryValue,
    query.workspaceId ?? null,
    query.nuggetsReturned,
    query.tokenBudget ?? null,
    query.agent ?? null,
  );
  return Number(result.lastInsertRowid);
}

export function getQueryGaps(
  db: BetterSqlite3.Database,
  workspaceId: string,
): Array<{ path: string; queryCount: number; nuggetCount: number }> {
  const sql = `
    SELECT
      cq.query_value as path,
      COUNT(DISTINCT cq.id) as query_count,
      COALESCE(
        (SELECT COUNT(*) FROM context_nuggets cn WHERE cn.scope_path = cq.query_value),
        0
      ) as nugget_count
    FROM context_queries cq
    WHERE cq.workspace_id = ? AND cq.query_type = 'path'
    GROUP BY cq.query_value
    HAVING query_count > nugget_count
    ORDER BY query_count DESC
    LIMIT 20
  `;

  const rows = db.prepare(sql).all(workspaceId) as Array<{
    path: string;
    query_count: number;
    nugget_count: number;
  }>;

  return rows.map((r) => ({
    path: r.path,
    queryCount: r.query_count,
    nuggetCount: r.nugget_count,
  }));
}
