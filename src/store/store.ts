import type BetterSqlite3 from 'better-sqlite3';
import type { Workspace } from '../workspace/types.js';
import type {
  AgentSession,
  SessionEvent,
  Artifact,
} from '../adapters/types.js';

function rowToWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: row.id as string,
    type: row.type as Workspace['type'],
    path: row.path as string,
    name: (row.name as string) ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
  };
}

function rowToAgentSession(
  row: Record<string, unknown>,
  workspace: Workspace,
): AgentSession {
  return {
    id: row.id as string,
    workspace,
    agent: row.agent as AgentSession['agent'],
    startedAt: new Date(row.started_at as string),
    endedAt: row.ended_at ? new Date(row.ended_at as string) : undefined,
    totalTokens: (row.total_tokens as number) ?? undefined,
    costUsd: (row.cost_usd as number) ?? undefined,
    rawPath: (row.raw_path as string) ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
  };
}

export function upsertWorkspace(
  db: BetterSqlite3.Database,
  workspace: Workspace,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO workspaces (id, type, path, name, metadata, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    workspace.id,
    workspace.type,
    workspace.path,
    workspace.name ?? null,
    workspace.metadata ? JSON.stringify(workspace.metadata) : null,
  );
}

export function upsertSession(
  db: BetterSqlite3.Database,
  session: AgentSession,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO sessions (id, workspace_id, agent, started_at, ended_at, total_tokens, cost_usd, summary, raw_path, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    session.workspace.id,
    session.agent,
    session.startedAt.toISOString(),
    session.endedAt?.toISOString() ?? null,
    session.totalTokens ?? null,
    session.costUsd ?? null,
    null,
    session.rawPath ?? null,
    session.metadata ? JSON.stringify(session.metadata) : null,
  );
}

export function insertEvent(
  db: BetterSqlite3.Database,
  sessionId: string,
  event: SessionEvent,
): number {
  const result = db.prepare(
    `INSERT INTO events (session_id, type, timestamp, content, tool_name, tool_input, tool_output)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    event.type,
    event.timestamp.toISOString(),
    event.content ?? null,
    event.toolName ?? null,
    event.toolInput ? JSON.stringify(event.toolInput) : null,
    event.toolOutput ?? null,
  );
  return Number(result.lastInsertRowid);
}

export function insertEvents(
  db: BetterSqlite3.Database,
  sessionId: string,
  events: SessionEvent[],
): void {
  const insertAll = db.transaction(() => {
    for (const event of events) {
      insertEvent(db, sessionId, event);
    }
  });
  insertAll();
}

export function insertArtifact(
  db: BetterSqlite3.Database,
  sessionId: string,
  artifact: Artifact,
  eventId?: number,
): number {
  const result = db.prepare(
    `INSERT INTO artifacts (session_id, event_id, type, path, uri, change_type, author, size_bytes, content_hash, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    eventId ?? null,
    artifact.type,
    artifact.path ?? null,
    artifact.uri ?? null,
    artifact.changeType,
    artifact.author,
    artifact.sizeBytes ?? null,
    artifact.contentHash ?? null,
    artifact.metadata ? JSON.stringify(artifact.metadata) : null,
  );
  return Number(result.lastInsertRowid);
}

export function getSession(
  db: BetterSqlite3.Database,
  sessionId: string,
): AgentSession | null {
  const row = db
    .prepare(
      `SELECT s.*, w.id as w_id, w.type as w_type, w.path as w_path, w.name as w_name, w.metadata as w_metadata
       FROM sessions s
       JOIN workspaces w ON s.workspace_id = w.id
       WHERE s.id = ?`,
    )
    .get(sessionId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const workspace = rowToWorkspace({
    id: row.w_id,
    type: row.w_type,
    path: row.w_path,
    name: row.w_name,
    metadata: row.w_metadata,
  });

  return rowToAgentSession(row, workspace);
}

export function getSessionArtifacts(
  db: BetterSqlite3.Database,
  sessionId: string,
): Artifact[] {
  const rows = db
    .prepare('SELECT * FROM artifacts WHERE session_id = ?')
    .all(sessionId) as Record<string, unknown>[];

  return rows.map((row) => ({
    type: row.type as Artifact['type'],
    path: (row.path as string) ?? undefined,
    uri: (row.uri as string) ?? undefined,
    changeType: row.change_type as Artifact['changeType'],
    author: row.author as Artifact['author'],
    sizeBytes: (row.size_bytes as number) ?? undefined,
    contentHash: (row.content_hash as string) ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
  }));
}

export function insertOutputLink(
  db: BetterSqlite3.Database,
  sessionId: string,
  outputType: string,
  outputRef: string,
  autoLinked = true,
): number {
  const result = db.prepare(
    `INSERT INTO output_links (session_id, output_type, output_ref, auto_linked)
     VALUES (?, ?, ?, ?)`,
  ).run(sessionId, outputType, outputRef, autoLinked ? 1 : 0);
  return Number(result.lastInsertRowid);
}
