import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/store/schema.js';

describe('schema migrations', () => {
  it('applies migration to in-memory DB', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const migration of MIGRATIONS) {
      db.exec(migration.up);
    }

    // Verify tables exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('workspaces');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('artifacts');
    expect(tableNames).toContain('decisions');
    expect(tableNames).toContain('output_links');
    expect(tableNames).toContain('context_nuggets');
    expect(tableNames).toContain('context_queries');

    // FTS5 virtual tables
    const ftsCheck = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('session_fts', 'nuggets_fts')",
      )
      .all() as { name: string }[];
    const ftsNames = ftsCheck.map((t) => t.name);
    expect(ftsNames).toContain('session_fts');
    expect(ftsNames).toContain('nuggets_fts');

    db.close();
  });

  it('is idempotent (can run migrations twice)', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const migration of MIGRATIONS) {
      db.exec(migration.up);
    }
    // Run again
    for (const migration of MIGRATIONS) {
      db.exec(migration.up);
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    expect(tables.length).toBeGreaterThan(0);
    db.close();
  });

  it('enforces foreign key constraints', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const migration of MIGRATIONS) {
      db.exec(migration.up);
    }

    // Inserting a session without a workspace should fail
    expect(() => {
      db.prepare(
        'INSERT INTO sessions (id, workspace_id, agent, started_at) VALUES (?, ?, ?, ?)',
      ).run('s1', 'nonexistent', 'claude-code', new Date().toISOString());
    }).toThrow();

    db.close();
  });
});
