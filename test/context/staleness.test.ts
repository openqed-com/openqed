import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MIGRATIONS } from '../../src/store/schema.js';
import { upsertWorkspace, upsertSession, insertArtifact } from '../../src/store/store.js';
import { insertNugget } from '../../src/store/nuggets.js';
import { checkStaleness, checkBatchStaleness } from '../../src/context/staleness.js';
import type { Workspace } from '../../src/workspace/types.js';
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
  id: 'ws_stale_test1',
  type: 'git_repo',
  path: '/tmp/stale-test',
  name: 'stale-test',
};

describe('staleness checks', () => {
  let db: ReturnType<typeof Database>;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    upsertWorkspace(db, workspace);
    upsertSession(db, {
      id: 's1',
      workspace,
      agent: 'claude-code',
      startedAt: new Date('2025-01-15T10:00:00Z'),
    });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staleness-'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects file hash change as stale', () => {
    // Create a temp file and insert artifact with different hash
    const filePath = path.join(tmpDir, 'src', 'auth.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'new content');

    insertArtifact(db, 's1', {
      type: 'file',
      path: 'src/auth.ts',
      changeType: 'modify',
      author: 'agent',
      contentHash: 'different_hash_val',
    });

    const nuggetId = insertNugget(db, {
      sessionId: 's1',
      type: 'intent',
      summary: 'modified auth',
      scopePath: 'src/auth.ts',
      confidence: 0.8,
      extractedAt: new Date().toISOString(),
    });

    const nugget: ContextNugget = {
      id: nuggetId,
      sessionId: 's1',
      type: 'intent',
      summary: 'modified auth',
      scopePath: 'src/auth.ts',
      confidence: 0.8,
      extractedAt: new Date().toISOString(),
    };

    const result = checkStaleness(db, nugget, tmpDir);
    expect(result.isStale).toBe(true);
    expect(result.staleReason).toBe('file_changed');
  });

  it('detects superseded nugget as stale', () => {
    const id1 = insertNugget(db, {
      sessionId: 's1',
      type: 'intent',
      summary: 'old intent',
      scopePath: 'src/auth.ts',
      confidence: 0.8,
      extractedAt: new Date().toISOString(),
    });

    // Insert a newer session + nugget for same scope
    upsertSession(db, {
      id: 's2',
      workspace,
      agent: 'claude-code',
      startedAt: new Date('2025-01-16T10:00:00Z'),
    });
    insertNugget(db, {
      sessionId: 's2',
      type: 'intent',
      summary: 'new intent',
      scopePath: 'src/auth.ts',
      confidence: 0.9,
      extractedAt: new Date().toISOString(),
    });

    const nugget: ContextNugget = {
      id: id1,
      sessionId: 's1',
      type: 'intent',
      summary: 'old intent',
      scopePath: 'src/auth.ts',
      confidence: 0.8,
      extractedAt: new Date().toISOString(),
    };

    const result = checkStaleness(db, nugget, tmpDir);
    expect(result.isStale).toBe(true);
    expect(result.staleReason).toBe('superseded');
    expect(result.supersededBy).toBeDefined();
  });

  it('detects expired nugget as stale', () => {
    const nuggetId = insertNugget(db, {
      sessionId: 's1',
      type: 'workaround',
      summary: 'temp fix',
      confidence: 0.8,
      extractedAt: new Date().toISOString(),
      staleAfter: '2024-01-01T00:00:00Z',
    });

    const nugget: ContextNugget = {
      id: nuggetId,
      sessionId: 's1',
      type: 'workaround',
      summary: 'temp fix',
      confidence: 0.8,
      extractedAt: new Date().toISOString(),
      staleAfter: '2024-01-01T00:00:00Z',
    };

    const result = checkStaleness(db, nugget, tmpDir);
    expect(result.isStale).toBe(true);
    expect(result.staleReason).toBe('expired');
  });

  it('reports fresh nugget as not stale', () => {
    const nuggetId = insertNugget(db, {
      sessionId: 's1',
      type: 'decision',
      summary: 'chose JWT',
      confidence: 0.9,
      extractedAt: new Date().toISOString(),
    });

    const nugget: ContextNugget = {
      id: nuggetId,
      sessionId: 's1',
      type: 'decision',
      summary: 'chose JWT',
      confidence: 0.9,
      extractedAt: new Date().toISOString(),
    };

    const result = checkStaleness(db, nugget, tmpDir);
    expect(result.isStale).toBe(false);
    expect(result.staleReason).toBeUndefined();
  });

  it('batch checks staleness', () => {
    const id1 = insertNugget(db, {
      sessionId: 's1',
      type: 'decision',
      summary: 'fresh one',
      confidence: 0.9,
      extractedAt: new Date().toISOString(),
    });
    const id2 = insertNugget(db, {
      sessionId: 's1',
      type: 'workaround',
      summary: 'expired one',
      confidence: 0.8,
      extractedAt: new Date().toISOString(),
      staleAfter: '2024-01-01T00:00:00Z',
    });

    const nuggets: ContextNugget[] = [
      { id: id1, sessionId: 's1', type: 'decision', summary: 'fresh one', confidence: 0.9, extractedAt: new Date().toISOString() },
      { id: id2, sessionId: 's1', type: 'workaround', summary: 'expired one', confidence: 0.8, extractedAt: new Date().toISOString(), staleAfter: '2024-01-01T00:00:00Z' },
    ];

    const results = checkBatchStaleness(db, nuggets, tmpDir);
    expect(results.size).toBe(2);
    expect(results.get(id1)!.isStale).toBe(false);
    expect(results.get(id2)!.isStale).toBe(true);
  });
});
