import type BetterSqlite3 from 'better-sqlite3';

export function indexSessionContent(
  db: BetterSqlite3.Database,
  sessionId: string,
  workspaceId: string,
  content: string,
): void {
  db.prepare(
    `INSERT INTO session_fts (session_id, workspace_id, content)
     VALUES (?, ?, ?)`,
  ).run(sessionId, workspaceId, content);
}

export function indexNugget(
  db: BetterSqlite3.Database,
  nuggetId: number,
  sessionId: string,
  summary: string,
  detail?: string,
): void {
  db.prepare(
    `INSERT INTO nuggets_fts (nugget_id, session_id, summary, detail)
     VALUES (?, ?, ?, ?)`,
  ).run(nuggetId, sessionId, summary, detail ?? '');
}

export function removeSessionIndex(
  db: BetterSqlite3.Database,
  sessionId: string,
): void {
  const removeAll = db.transaction(() => {
    db.prepare('DELETE FROM session_fts WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM nuggets_fts WHERE session_id = ?').run(sessionId);
  });
  removeAll();
}

export function searchSessions(
  db: BetterSqlite3.Database,
  query: string,
  workspaceId: string,
  limit = 20,
): Array<{ sessionId: string; rank: number }> {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const sql = `
    SELECT session_id, rank
    FROM session_fts
    WHERE session_fts MATCH ?
      AND workspace_id = ?
    ORDER BY rank
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(ftsQuery, workspaceId, limit) as Array<{
    session_id: string;
    rank: number;
  }>;

  return rows.map((r) => ({ sessionId: r.session_id, rank: r.rank }));
}

export function searchNuggets(
  db: BetterSqlite3.Database,
  query: string,
  workspaceId: string,
  limit = 20,
): Array<{ nuggetId: number; sessionId: string; rank: number }> {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  // JOIN sessions to scope by workspace
  const sql = `
    SELECT nf.nugget_id, nf.session_id, nf.rank
    FROM nuggets_fts nf
    JOIN sessions s ON nf.session_id = s.id
    WHERE nuggets_fts MATCH ?
      AND s.workspace_id = ?
    ORDER BY nf.rank
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(ftsQuery, workspaceId, limit) as Array<{
    nugget_id: number;
    session_id: string;
    rank: number;
  }>;

  return rows.map((r) => ({
    nuggetId: r.nugget_id,
    sessionId: r.session_id,
    rank: r.rank,
  }));
}

export function buildFtsQuery(userQuery: string): string {
  const trimmed = userQuery.trim();
  if (!trimmed) return '';

  // Handle quoted phrases — pass through
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed;
  }

  // Split on whitespace and FTS5-special characters (hyphens, etc.)
  // FTS5 treats - as NOT, + as required, * as prefix — strip them from tokens
  const words = trimmed
    .split(/[\s\-_/\\]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((w) => w.length > 0);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];

  return words.join(' OR ');
}
