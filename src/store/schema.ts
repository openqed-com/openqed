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
  {
    version: 2,
    description: 'Context layer: nuggets, queries, FTS5',
    up: `
      CREATE TABLE IF NOT EXISTS context_nuggets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        event_id INTEGER REFERENCES events(id),
        type TEXT NOT NULL,
        summary TEXT NOT NULL,
        detail TEXT,
        scope_path TEXT,
        scope_symbol TEXT,
        confidence REAL DEFAULT 1.0,
        token_cost INTEGER,
        extracted_at TEXT NOT NULL,
        stale_after TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_nuggets_session ON context_nuggets(session_id);
      CREATE INDEX IF NOT EXISTS idx_nuggets_scope_path ON context_nuggets(scope_path);
      CREATE INDEX IF NOT EXISTS idx_nuggets_scope_symbol ON context_nuggets(scope_symbol);
      CREATE INDEX IF NOT EXISTS idx_nuggets_type ON context_nuggets(type);

      CREATE TABLE IF NOT EXISTS context_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queried_at TEXT NOT NULL,
        query_type TEXT NOT NULL,
        query_value TEXT NOT NULL,
        workspace_id TEXT REFERENCES workspaces(id),
        nuggets_returned INTEGER DEFAULT 0,
        token_budget INTEGER,
        agent TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_queries_value ON context_queries(query_value);
      CREATE INDEX IF NOT EXISTS idx_queries_workspace ON context_queries(workspace_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS session_fts USING fts5(
        session_id UNINDEXED,
        workspace_id UNINDEXED,
        content,
        tokenize='porter unicode61'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS nuggets_fts USING fts5(
        nugget_id UNINDEXED,
        session_id UNINDEXED,
        summary,
        detail,
        tokenize='porter unicode61'
      );
    `,
  },
];
