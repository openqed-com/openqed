import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/store/schema.js';
import {
  upsertWorkspace,
  upsertSession,
  insertArtifact,
  getSession,
  getSessionArtifacts,
  insertOutputLink,
} from '../../src/store/store.js';
import type { Workspace } from '../../src/workspace/types.js';
import type { AgentSession, Artifact } from '../../src/adapters/types.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec(migration.up);
  }
  return db;
}

const testWorkspace: Workspace = {
  id: 'ws_test123456',
  type: 'git_repo',
  path: '/tmp/test-repo',
  name: 'test-repo',
  metadata: { remote_url: 'https://github.com/test/repo' },
};

function makeSession(id = 'session-001'): AgentSession {
  return {
    id,
    workspace: testWorkspace,
    agent: 'claude-code',
    startedAt: new Date('2025-01-15T10:00:00Z'),
    endedAt: new Date('2025-01-15T10:30:00Z'),
    totalTokens: 1500,
    rawPath: '/path/to/session.jsonl',
  };
}

describe('store CRUD', () => {
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
    upsertWorkspace(db, testWorkspace);
  });

  afterEach(() => {
    db.close();
  });

  it('upserts workspace', () => {
    const row = db
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(testWorkspace.id) as Record<string, unknown>;
    expect(row.path).toBe('/tmp/test-repo');
    expect(row.type).toBe('git_repo');
  });

  it('upserts session', () => {
    const session = makeSession();
    upsertSession(db, session);
    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get('session-001') as Record<string, unknown>;
    expect(row.agent).toBe('claude-code');
    expect(row.workspace_id).toBe(testWorkspace.id);
  });

  it('gets session with workspace join', () => {
    const session = makeSession();
    upsertSession(db, session);
    const retrieved = getSession(db, 'session-001');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('session-001');
    expect(retrieved!.workspace.id).toBe(testWorkspace.id);
    expect(retrieved!.workspace.path).toBe('/tmp/test-repo');
    expect(retrieved!.agent).toBe('claude-code');
  });

  it('returns null for missing session', () => {
    const retrieved = getSession(db, 'nonexistent');
    expect(retrieved).toBeNull();
  });

  it('inserts and gets artifacts', () => {
    upsertSession(db, makeSession());

    const artifact: Artifact = {
      type: 'file',
      path: 'src/hello.ts',
      changeType: 'create',
      author: 'agent',
      sizeBytes: 100,
    };

    const id = insertArtifact(db, 'session-001', artifact);
    expect(id).toBeGreaterThan(0);

    const artifacts = getSessionArtifacts(db, 'session-001');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].path).toBe('src/hello.ts');
    expect(artifacts[0].changeType).toBe('create');
    expect(artifacts[0].author).toBe('agent');
  });

  it('inserts output link', () => {
    upsertSession(db, makeSession());

    const id = insertOutputLink(db, 'session-001', 'commit', 'abc123');
    expect(id).toBeGreaterThan(0);

    const row = db
      .prepare('SELECT * FROM output_links WHERE id = ?')
      .get(id) as Record<string, unknown>;
    expect(row.output_type).toBe('commit');
    expect(row.output_ref).toBe('abc123');
    expect(row.auto_linked).toBe(1);
  });
});
