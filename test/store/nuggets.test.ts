import Database from 'better-sqlite3';
import { MIGRATIONS } from '../../src/store/schema.js';
import { upsertWorkspace, upsertSession } from '../../src/store/store.js';
import {
  insertNugget,
  insertNuggets,
  getNuggetsForSession,
  findNuggetsByScope,
  findNuggetsByWorkspace,
  hasNuggetsForSession,
  deleteNuggetsForSession,
  logContextQuery,
  getQueryGaps,
} from '../../src/store/nuggets.js';
import type { Workspace } from '../../src/workspace/types.js';
import type { AgentSession } from '../../src/adapters/types.js';
import type { ContextNugget } from '../../src/context/types.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec(migration.up);
  }
  return db;
}

const workspace: Workspace = {
  id: 'ws_nugget_test1',
  type: 'git_repo',
  path: '/tmp/nugget-test',
  name: 'nugget-test',
};

function makeSession(id: string): AgentSession {
  return {
    id,
    workspace,
    agent: 'claude-code',
    startedAt: new Date('2025-01-15T10:00:00Z'),
    endedAt: new Date('2025-01-15T10:30:00Z'),
  };
}

function makeDraft(
  sessionId: string,
  overrides: Partial<Omit<ContextNugget, 'id'>> = {},
): Omit<ContextNugget, 'id'> {
  return {
    sessionId,
    type: 'intent',
    summary: 'test nugget summary',
    confidence: 0.8,
    extractedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('store nuggets', () => {
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

  it('inserts and retrieves a nugget', () => {
    const id = insertNugget(db, makeDraft('s1'));
    expect(id).toBeGreaterThan(0);

    const nuggets = getNuggetsForSession(db, 's1');
    expect(nuggets).toHaveLength(1);
    expect(nuggets[0].summary).toBe('test nugget summary');
    expect(nuggets[0].type).toBe('intent');
    expect(nuggets[0].confidence).toBe(0.8);
  });

  it('batch inserts nuggets', () => {
    const drafts = [
      makeDraft('s1', { summary: 'first' }),
      makeDraft('s1', { summary: 'second', type: 'decision' }),
      makeDraft('s1', { summary: 'third', type: 'constraint' }),
    ];
    const ids = insertNuggets(db, drafts);
    expect(ids).toHaveLength(3);

    const nuggets = getNuggetsForSession(db, 's1');
    expect(nuggets).toHaveLength(3);
  });

  it('finds nuggets by exact scope path', () => {
    insertNuggets(db, [
      makeDraft('s1', { scopePath: 'src/foo.ts' }),
      makeDraft('s1', { scopePath: 'src/bar.ts' }),
      makeDraft('s1', { scopePath: 'src/foo.ts', type: 'decision' }),
    ]);

    const nuggets = findNuggetsByScope(db, workspace.id, {
      scopePath: 'src/foo.ts',
    });
    expect(nuggets).toHaveLength(2);
    expect(nuggets.every((n) => n.scopePath === 'src/foo.ts')).toBe(true);
  });

  it('finds nuggets by scope path prefix', () => {
    insertNuggets(db, [
      makeDraft('s1', { scopePath: 'src/store/schema.ts' }),
      makeDraft('s1', { scopePath: 'src/store/store.ts' }),
      makeDraft('s1', { scopePath: 'src/utils/logger.ts' }),
    ]);

    const nuggets = findNuggetsByScope(db, workspace.id, {
      scopePath: 'src/store',
    });
    expect(nuggets).toHaveLength(2);
  });

  it('finds nuggets with null scope (workspace-wide)', () => {
    insertNuggets(db, [
      makeDraft('s1', { scopePath: undefined }),
      makeDraft('s1', { scopePath: 'src/foo.ts' }),
    ]);

    const all = findNuggetsByWorkspace(db, workspace.id);
    expect(all).toHaveLength(2);
  });

  it('filters nuggets by type', () => {
    insertNuggets(db, [
      makeDraft('s1', { type: 'intent' }),
      makeDraft('s1', { type: 'decision' }),
      makeDraft('s1', { type: 'constraint' }),
    ]);

    const nuggets = findNuggetsByWorkspace(db, workspace.id, {
      types: ['decision', 'constraint'],
    });
    expect(nuggets).toHaveLength(2);
    expect(nuggets.every((n) => n.type === 'decision' || n.type === 'constraint')).toBe(true);
  });

  it('filters nuggets by since date', () => {
    const old = new Date('2024-01-01T00:00:00Z').toISOString();
    const recent = new Date('2025-06-01T00:00:00Z').toISOString();

    insertNuggets(db, [
      makeDraft('s1', { extractedAt: old }),
      makeDraft('s1', { extractedAt: recent }),
    ]);

    const nuggets = findNuggetsByScope(db, workspace.id, {
      since: new Date('2025-01-01T00:00:00Z'),
    });
    expect(nuggets).toHaveLength(1);
  });

  it('hasNuggetsForSession returns true/false', () => {
    expect(hasNuggetsForSession(db, 's1')).toBe(false);

    insertNugget(db, makeDraft('s1'));
    expect(hasNuggetsForSession(db, 's1')).toBe(true);
  });

  it('deletes nuggets for session', () => {
    insertNuggets(db, [
      makeDraft('s1', { summary: 'keep' }),
      makeDraft('s1', { summary: 'delete-me' }),
    ]);
    insertNugget(db, makeDraft('s2', { summary: 'other-session' }));

    expect(getNuggetsForSession(db, 's1')).toHaveLength(2);

    deleteNuggetsForSession(db, 's1');

    expect(getNuggetsForSession(db, 's1')).toHaveLength(0);
    expect(getNuggetsForSession(db, 's2')).toHaveLength(1);

    // Also check FTS was cleaned
    const ftsRows = db
      .prepare("SELECT COUNT(*) as cnt FROM nuggets_fts WHERE session_id = ?")
      .get('s1') as { cnt: number };
    expect(ftsRows.cnt).toBe(0);
  });

  it('logs context queries', () => {
    const id = logContextQuery(db, {
      queriedAt: new Date().toISOString(),
      queryType: 'path',
      queryValue: 'src/foo.ts',
      workspaceId: workspace.id,
      nuggetsReturned: 3,
      tokenBudget: 2000,
    });
    expect(id).toBeGreaterThan(0);
  });

  it('finds query gaps', () => {
    // Log queries for a path with no nuggets
    logContextQuery(db, {
      queriedAt: new Date().toISOString(),
      queryType: 'path',
      queryValue: 'src/missing.ts',
      workspaceId: workspace.id,
      nuggetsReturned: 0,
    });
    logContextQuery(db, {
      queriedAt: new Date().toISOString(),
      queryType: 'path',
      queryValue: 'src/missing.ts',
      workspaceId: workspace.id,
      nuggetsReturned: 0,
    });

    const gaps = getQueryGaps(db, workspace.id);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].path).toBe('src/missing.ts');
    expect(gaps[0].queryCount).toBe(2);
    expect(gaps[0].nuggetCount).toBe(0);
  });
});
