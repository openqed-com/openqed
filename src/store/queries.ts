import type BetterSqlite3 from 'better-sqlite3';
import type { AgentSession } from '../adapters/types.js';
import type { Workspace } from '../workspace/types.js';

export interface SessionQueryOptions {
  since?: Date;
  until?: Date;
  agent?: string;
  limit?: number;
}

function rowToWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: row.w_id as string,
    type: row.w_type as Workspace['type'],
    path: row.w_path as string,
    name: (row.w_name as string) ?? undefined,
    metadata: row.w_metadata ? JSON.parse(row.w_metadata as string) : undefined,
  };
}

function rowToSession(row: Record<string, unknown>): AgentSession {
  const workspace = rowToWorkspace(row);
  return {
    id: row.s_id as string,
    workspace,
    agent: row.s_agent as AgentSession['agent'],
    startedAt: new Date(row.s_started_at as string),
    endedAt: row.s_ended_at ? new Date(row.s_ended_at as string) : undefined,
    totalTokens: (row.s_total_tokens as number) ?? undefined,
    costUsd: (row.s_cost_usd as number) ?? undefined,
    rawPath: (row.s_raw_path as string) ?? undefined,
    metadata: row.s_metadata ? JSON.parse(row.s_metadata as string) : undefined,
  };
}

export function findSessionsByWorkspace(
  db: BetterSqlite3.Database,
  workspaceId: string,
  opts: SessionQueryOptions = {},
): AgentSession[] {
  const conditions = ['s.workspace_id = ?'];
  const params: unknown[] = [workspaceId];

  if (opts.since) {
    conditions.push('s.started_at >= ?');
    params.push(opts.since.toISOString());
  }
  if (opts.until) {
    conditions.push('s.started_at <= ?');
    params.push(opts.until.toISOString());
  }
  if (opts.agent) {
    conditions.push('s.agent = ?');
    params.push(opts.agent);
  }

  const limit = opts.limit ?? 100;
  params.push(limit);

  const sql = `
    SELECT
      s.id as s_id, s.agent as s_agent, s.started_at as s_started_at,
      s.ended_at as s_ended_at, s.total_tokens as s_total_tokens,
      s.cost_usd as s_cost_usd, s.raw_path as s_raw_path, s.metadata as s_metadata,
      w.id as w_id, w.type as w_type, w.path as w_path, w.name as w_name, w.metadata as w_metadata
    FROM sessions s
    JOIN workspaces w ON s.workspace_id = w.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY s.started_at DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToSession);
}

export function findSessionsByArtifactPath(
  db: BetterSqlite3.Database,
  workspaceId: string,
  relPath: string,
): AgentSession[] {
  const sql = `
    SELECT DISTINCT
      s.id as s_id, s.agent as s_agent, s.started_at as s_started_at,
      s.ended_at as s_ended_at, s.total_tokens as s_total_tokens,
      s.cost_usd as s_cost_usd, s.raw_path as s_raw_path, s.metadata as s_metadata,
      w.id as w_id, w.type as w_type, w.path as w_path, w.name as w_name, w.metadata as w_metadata
    FROM sessions s
    JOIN workspaces w ON s.workspace_id = w.id
    JOIN artifacts a ON a.session_id = s.id
    WHERE s.workspace_id = ? AND a.path = ?
    ORDER BY s.started_at DESC
  `;

  const rows = db.prepare(sql).all(workspaceId, relPath) as Record<string, unknown>[];
  return rows.map(rowToSession);
}

export function getRecentSessions(
  db: BetterSqlite3.Database,
  workspaceId: string,
  limit = 10,
): AgentSession[] {
  return findSessionsByWorkspace(db, workspaceId, { limit });
}
