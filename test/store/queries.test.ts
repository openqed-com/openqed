import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/store/schema.js';
import { upsertWorkspace, upsertSession } from '../../src/store/store.js';
import {
  findSessionsByWorkspace,
  getRecentSessions,
} from '../../src/store/queries.js';
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
  id: 'ws_query_test01',
  type: 'git_repo',
  path: '/tmp/query-test',
  name: 'query-test',
};

function makeSession(
  id: string,
  startedAt: string,
  agent = 'claude-code' as const,
): AgentSession {
  return {
    id,
    workspace,
    agent,
    startedAt: new Date(startedAt),
    endedAt: new Date(startedAt),
  };
}

describe('store queries', () => {
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
    upsertWorkspace(db, workspace);
    upsertSession(db, makeSession('s1', '2025-01-10T10:00:00Z'));
    upsertSession(db, makeSession('s2', '2025-01-12T10:00:00Z'));
    upsertSession(db, makeSession('s3', '2025-01-15T10:00:00Z'));
  });

  afterEach(() => {
    db.close();
  });

  it('finds sessions by workspace', () => {
    const sessions = findSessionsByWorkspace(db, workspace.id);
    expect(sessions).toHaveLength(3);
    // Should be ordered by started_at DESC
    expect(sessions[0].id).toBe('s3');
    expect(sessions[1].id).toBe('s2');
    expect(sessions[2].id).toBe('s1');
  });

  it('filters by time range', () => {
    const sessions = findSessionsByWorkspace(db, workspace.id, {
      since: new Date('2025-01-11T00:00:00Z'),
      until: new Date('2025-01-13T00:00:00Z'),
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('s2');
  });

  it('respects limit', () => {
    const sessions = findSessionsByWorkspace(db, workspace.id, { limit: 2 });
    expect(sessions).toHaveLength(2);
  });

  it('getRecentSessions returns limited results', () => {
    const sessions = getRecentSessions(db, workspace.id, 1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('s3');
  });
});
