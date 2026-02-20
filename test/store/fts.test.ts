import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/store/schema.js';
import { upsertWorkspace, upsertSession } from '../../src/store/store.js';
import {
  indexSessionContent,
  indexNugget,
  removeSessionIndex,
  searchSessions,
  searchNuggets,
  buildFtsQuery,
} from '../../src/store/fts.js';
import type { Workspace } from '../../src/workspace/types.js';
import type { AgentSession } from '../../src/adapters/types.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec(migration.up);
  }
  return db;
}

const workspace: Workspace = {
  id: 'ws_fts_test001',
  type: 'git_repo',
  path: '/tmp/fts-test',
  name: 'fts-test',
};

function makeSession(id: string): AgentSession {
  return {
    id,
    workspace,
    agent: 'claude-code',
    startedAt: new Date('2025-01-15T10:00:00Z'),
  };
}

describe('FTS operations', () => {
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
    upsertWorkspace(db, workspace);
    upsertSession(db, makeSession('s1'));
    upsertSession(db, makeSession('s2'));
  });

  afterEach(() => {
    db.close();
  });

  it('indexes and searches session content', () => {
    indexSessionContent(db, 's1', workspace.id, 'implemented JWT authentication for the API');
    indexSessionContent(db, 's2', workspace.id, 'added Redis caching layer for performance');

    const results = searchSessions(db, 'JWT authentication', workspace.id);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].sessionId).toBe('s1');
  });

  it('searches nuggets by keyword', () => {
    indexNugget(db, 1, 's1', 'chose JWT over session cookies', 'JWT provides stateless auth');
    indexNugget(db, 2, 's1', 'added Redis for caching', 'Redis provides fast lookups');

    const results = searchNuggets(db, 'JWT', workspace.id);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].nuggetId).toBe(1);
  });

  it('ranks more relevant results higher', () => {
    indexSessionContent(db, 's1', workspace.id, 'JWT JWT JWT authentication tokens JWT');
    indexSessionContent(db, 's2', workspace.id, 'some code that mentions JWT once');

    const results = searchSessions(db, 'JWT', workspace.id);
    expect(results.length).toBe(2);
    // s1 has more JWT mentions, should rank higher (more negative rank = more relevant)
    expect(results[0].sessionId).toBe('s1');
  });

  it('scopes session search to workspace', () => {
    const otherWorkspace: Workspace = {
      id: 'ws_other_test1',
      type: 'git_repo',
      path: '/tmp/other',
      name: 'other',
    };
    upsertWorkspace(db, otherWorkspace);
    upsertSession(db, { ...makeSession('s3'), workspace: otherWorkspace });

    indexSessionContent(db, 's1', workspace.id, 'authentication with JWT tokens');
    indexSessionContent(db, 's3', otherWorkspace.id, 'authentication with JWT tokens');

    const results = searchSessions(db, 'JWT', workspace.id);
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe('s1');
  });

  it('removes session index', () => {
    indexSessionContent(db, 's1', workspace.id, 'JWT authentication');
    indexNugget(db, 1, 's1', 'chose JWT', 'detail');

    removeSessionIndex(db, 's1');

    const sessionResults = searchSessions(db, 'JWT', workspace.id);
    expect(sessionResults).toHaveLength(0);

    const nuggetResults = searchNuggets(db, 'JWT', workspace.id);
    expect(nuggetResults).toHaveLength(0);
  });

  describe('buildFtsQuery', () => {
    it('returns single word as-is', () => {
      expect(buildFtsQuery('JWT')).toBe('JWT');
    });

    it('OR-joins multiple words', () => {
      expect(buildFtsQuery('JWT authentication')).toBe('JWT OR authentication');
    });

    it('passes quoted phrases through', () => {
      expect(buildFtsQuery('"JWT authentication"')).toBe('"JWT authentication"');
    });

    it('returns empty for empty input', () => {
      expect(buildFtsQuery('')).toBe('');
      expect(buildFtsQuery('   ')).toBe('');
    });

    it('sanitizes hyphens and special characters', () => {
      expect(buildFtsQuery('full-text search')).toBe('full OR text OR search');
      expect(buildFtsQuery('context_layer')).toBe('context OR layer');
    });
  });
});
