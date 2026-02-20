import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MIGRATIONS } from '../../src/store/schema.js';
import { upsertWorkspace, upsertSession, insertArtifact } from '../../src/store/store.js';
import { insertNugget, getAllNuggetsForExport } from '../../src/store/nuggets.js';
import { getAllSessionsForExport, getAllArtifactsForExport, getAllDecisionsForExport } from '../../src/store/queries.js';
import { exportWorkspace } from '../../src/export/exporter.js';
import { importWorkspace } from '../../src/export/importer.js';
import type { Workspace } from '../../src/workspace/types.js';
import type { AgentSession } from '../../src/adapters/types.js';
import type { ExportConfig } from '../../src/export/config.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec(migration.up);
  }
  return db;
}

const workspace: Workspace = {
  id: 'ws_roundtrip',
  type: 'git_repo',
  path: '/tmp/roundtrip',
  name: 'roundtrip-test',
};

function makeSession(id: string, startedAt: string): AgentSession {
  return {
    id,
    workspace,
    agent: 'claude-code',
    startedAt: new Date(startedAt),
    endedAt: new Date(new Date(startedAt).getTime() + 30 * 60 * 1000),
    totalTokens: 1500,
    costUsd: 0.05,
  };
}

const fullConfig: ExportConfig = {
  nuggets: true,
  sessions: true,
  decisions: true,
  artifacts: true,
  events: false,
};

describe('export/import roundtrip', () => {
  let sourceDb: ReturnType<typeof Database>;
  let targetDb: ReturnType<typeof Database>;
  let tmpDir: string;

  beforeEach(() => {
    sourceDb = createTestDb();
    targetDb = createTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oqed-roundtrip-'));

    // Seed source DB
    upsertWorkspace(sourceDb, workspace);
    upsertSession(sourceDb, makeSession('s1', '2025-01-15T10:00:00Z'));
    upsertSession(sourceDb, makeSession('s2', '2025-01-16T10:00:00Z'));

    insertNugget(sourceDb, {
      sessionId: 's1',
      type: 'intent',
      summary: 'build export feature',
      detail: 'need JSONL interchange format',
      scopePath: 'src/export/exporter.ts',
      confidence: 0.95,
      extractedAt: '2025-01-15T10:15:00Z',
    });

    insertNugget(sourceDb, {
      sessionId: 's2',
      type: 'decision',
      summary: 'chose JSONL over CSV',
      detail: 'supports nested data better',
      confidence: 0.9,
      extractedAt: '2025-01-16T10:10:00Z',
    });

    insertArtifact(sourceDb, 's1', {
      type: 'file',
      path: 'src/export/exporter.ts',
      changeType: 'create',
      author: 'agent',
    });

    insertArtifact(sourceDb, 's2', {
      type: 'file',
      path: 'src/export/importer.ts',
      changeType: 'create',
      author: 'agent',
    });

    // Insert a decision
    sourceDb.prepare(
      'INSERT INTO decisions (session_id, description, reasoning, alternatives) VALUES (?, ?, ?, ?)',
    ).run('s1', 'use atomic writes', 'prevent corruption', 'direct write');
  });

  afterEach(() => {
    sourceDb.close();
    targetDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('roundtrips all data through JSONL', () => {
    // Export from source
    const exportSummary = exportWorkspace(sourceDb, workspace.id, tmpDir, fullConfig);
    expect(exportSummary.sessions).toBe(2);
    expect(exportSummary.nuggets).toBe(2);
    expect(exportSummary.artifacts).toBe(2);
    expect(exportSummary.decisions).toBe(1);

    // Import into clean target
    upsertWorkspace(targetDb, workspace);
    const importSummary = importWorkspace(targetDb, tmpDir, fullConfig);
    expect(importSummary.sessions.inserted).toBe(2);
    expect(importSummary.nuggets.inserted).toBe(2);
    expect(importSummary.artifacts.inserted).toBe(2);
    expect(importSummary.decisions.inserted).toBe(1);

    // Verify sessions match
    const sourceSessions = getAllSessionsForExport(sourceDb, workspace.id);
    const targetSessions = getAllSessionsForExport(targetDb, workspace.id);
    expect(targetSessions).toHaveLength(sourceSessions.length);
    expect((targetSessions[0] as any).id).toBe((sourceSessions[0] as any).id);
    expect((targetSessions[1] as any).id).toBe((sourceSessions[1] as any).id);

    // Verify nuggets match
    const sourceNuggets = getAllNuggetsForExport(sourceDb, workspace.id);
    const targetNuggets = getAllNuggetsForExport(targetDb, workspace.id);
    expect(targetNuggets).toHaveLength(sourceNuggets.length);
    expect((targetNuggets[0] as any).summary).toBe((sourceNuggets[0] as any).summary);
    expect((targetNuggets[0] as any).type).toBe((sourceNuggets[0] as any).type);

    // Verify artifacts match
    const sourceArtifacts = getAllArtifactsForExport(sourceDb, workspace.id);
    const targetArtifacts = getAllArtifactsForExport(targetDb, workspace.id);
    expect(targetArtifacts).toHaveLength(sourceArtifacts.length);

    // Verify decisions match
    const sourceDecisions = getAllDecisionsForExport(sourceDb, workspace.id);
    const targetDecisions = getAllDecisionsForExport(targetDb, workspace.id);
    expect(targetDecisions).toHaveLength(sourceDecisions.length);
    expect((targetDecisions[0] as any).description).toBe((sourceDecisions[0] as any).description);
  });

  it('import is idempotent — running twice inserts nothing new', () => {
    exportWorkspace(sourceDb, workspace.id, tmpDir, fullConfig);

    upsertWorkspace(targetDb, workspace);

    const first = importWorkspace(targetDb, tmpDir, fullConfig);
    expect(first.sessions.inserted).toBe(2);
    expect(first.nuggets.inserted).toBe(2);

    const second = importWorkspace(targetDb, tmpDir, fullConfig);
    expect(second.sessions.inserted).toBe(0);
    expect(second.sessions.skipped).toBe(2);
    expect(second.nuggets.inserted).toBe(0);
    expect(second.nuggets.skipped).toBe(2);
    expect(second.decisions.inserted).toBe(0);
    expect(second.decisions.skipped).toBe(1);
    expect(second.artifacts.inserted).toBe(0);
    expect(second.artifacts.skipped).toBe(2);
  });

  it('export is idempotent — re-exporting produces identical files', () => {
    exportWorkspace(sourceDb, workspace.id, tmpDir, fullConfig);

    const files = ['sessions.jsonl', 'nuggets.jsonl', 'decisions.jsonl', 'artifacts.jsonl'];
    const firstContents = files.map((f) =>
      fs.readFileSync(path.join(tmpDir, '.openqed/data', f), 'utf-8'),
    );

    exportWorkspace(sourceDb, workspace.id, tmpDir, fullConfig);

    const secondContents = files.map((f) =>
      fs.readFileSync(path.join(tmpDir, '.openqed/data', f), 'utf-8'),
    );

    for (let i = 0; i < files.length; i++) {
      expect(secondContents[i]).toBe(firstContents[i]);
    }
  });
});
