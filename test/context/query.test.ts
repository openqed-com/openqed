import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/store/schema.js';
import { upsertWorkspace, upsertSession, insertArtifact } from '../../src/store/store.js';
import { insertNuggets } from '../../src/store/nuggets.js';
import { indexSessionContent } from '../../src/store/fts.js';
import { queryContext } from '../../src/context/query.js';
import type { Workspace } from '../../src/workspace/types.js';
import type { ContextQuery } from '../../src/context/types.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec(migration.up);
  }
  return db;
}

const workspace: Workspace = {
  id: 'ws_query_test1',
  type: 'git_repo',
  path: '/tmp/query-test',
  name: 'query-test',
};

describe('context query engine', () => {
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
    upsertWorkspace(db, workspace);

    // Set up sessions
    upsertSession(db, {
      id: 's1',
      workspace,
      agent: 'claude-code',
      startedAt: new Date('2025-01-15T10:00:00Z'),
    });
    upsertSession(db, {
      id: 's2',
      workspace,
      agent: 'claude-code',
      startedAt: new Date('2025-01-16T10:00:00Z'),
    });

    // Insert artifacts
    insertArtifact(db, 's1', {
      type: 'file',
      path: 'src/auth.ts',
      changeType: 'create',
      author: 'agent',
    });

    // Insert nuggets
    insertNuggets(db, [
      {
        sessionId: 's1',
        type: 'decision',
        summary: 'chose JWT over session cookies for authentication',
        detail: 'JWT provides stateless auth',
        scopePath: 'src/auth.ts',
        confidence: 0.9,
        extractedAt: new Date().toISOString(),
      },
      {
        sessionId: 's1',
        type: 'constraint',
        summary: 'must support Node 18 and above',
        confidence: 0.85,
        extractedAt: new Date().toISOString(),
      },
      {
        sessionId: 's2',
        type: 'intent',
        summary: 'added Redis caching for performance',
        detail: 'Redis chosen for fast key-value lookups',
        scopePath: 'src/cache.ts',
        confidence: 0.8,
        extractedAt: new Date().toISOString(),
      },
    ]);

    // Index session content for FTS
    indexSessionContent(db, 's1', workspace.id, 'implemented JWT authentication for login endpoint');
    indexSessionContent(db, 's2', workspace.id, 'added Redis caching layer for API performance');
  });

  afterEach(() => {
    db.close();
  });

  it('handles path-based query', async () => {
    const query: ContextQuery = {
      path: 'src/auth.ts',
      tokenBudget: 2000,
      depth: 'standard',
      workspaceId: workspace.id,
    };

    const response = await queryContext(db, query, '/tmp/query-test');
    expect(response.nuggets.length).toBeGreaterThan(0);
    // Should include the JWT decision for auth.ts
    const jwtNugget = response.nuggets.find((n) => n.summary.includes('JWT'));
    expect(jwtNugget).toBeDefined();
  });

  it('handles natural language FTS query', async () => {
    const query: ContextQuery = {
      query: 'JWT authentication',
      tokenBudget: 2000,
      depth: 'standard',
      workspaceId: workspace.id,
    };

    const response = await queryContext(db, query, '/tmp/query-test');
    expect(response.nuggets.length).toBeGreaterThan(0);
  });

  it('handles combined path + query', async () => {
    const query: ContextQuery = {
      path: 'src/auth.ts',
      query: 'JWT',
      tokenBudget: 2000,
      depth: 'standard',
      workspaceId: workspace.id,
    };

    const response = await queryContext(db, query, '/tmp/query-test');
    expect(response.nuggets.length).toBeGreaterThan(0);
  });

  it('logs the query', async () => {
    const query: ContextQuery = {
      path: 'src/auth.ts',
      tokenBudget: 2000,
      depth: 'standard',
      workspaceId: workspace.id,
    };

    await queryContext(db, query, '/tmp/query-test');

    const row = db
      .prepare('SELECT COUNT(*) as cnt FROM context_queries WHERE workspace_id = ?')
      .get(workspace.id) as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });

  it('respects token budget', async () => {
    const query: ContextQuery = {
      query: 'JWT',
      tokenBudget: 50,
      depth: 'standard',
      workspaceId: workspace.id,
    };

    const response = await queryContext(db, query, '/tmp/query-test');
    expect(response.budget.used).toBeLessThanOrEqual(50);
  });

  it('filters by type', async () => {
    const query: ContextQuery = {
      tokenBudget: 2000,
      depth: 'standard',
      workspaceId: workspace.id,
      types: ['decision'],
      query: 'JWT authentication Redis',
    };

    const response = await queryContext(db, query, '/tmp/query-test');
    for (const nugget of response.nuggets) {
      expect(nugget.type).toBe('decision');
    }
  });

  it('returns empty response for no matches', async () => {
    const query: ContextQuery = {
      path: 'src/nonexistent.ts',
      tokenBudget: 2000,
      depth: 'standard',
      workspaceId: workspace.id,
    };

    const response = await queryContext(db, query, '/tmp/query-test');
    expect(response.nuggets).toHaveLength(0);
  });
});
