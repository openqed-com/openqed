export interface Migration {
  version: number;
  description: string;
  up: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema',
    up: `
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        name TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        agent TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        total_tokens INTEGER,
        cost_usd REAL,
        summary TEXT,
        raw_path TEXT,
        metadata TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        content TEXT,
        tool_name TEXT,
        tool_input TEXT,
        tool_output TEXT,
        parent_id INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_id INTEGER,
        type TEXT NOT NULL,
        path TEXT,
        uri TEXT,
        change_type TEXT NOT NULL,
        author TEXT NOT NULL,
        size_bytes INTEGER,
        content_hash TEXT,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (event_id) REFERENCES events(id)
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        description TEXT NOT NULL,
        reasoning TEXT,
        alternatives TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS output_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        output_type TEXT NOT NULL,
        output_ref TEXT NOT NULL,
        linked_at TEXT NOT NULL DEFAULT (datetime('now')),
        auto_linked INTEGER NOT NULL DEFAULT 1,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_path ON artifacts(path);
      CREATE INDEX IF NOT EXISTS idx_output_links_session ON output_links(session_id);
      CREATE INDEX IF NOT EXISTS idx_output_links_ref ON output_links(output_ref);
    `,
  },
];
