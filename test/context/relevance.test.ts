import { scoreNugget, rankNuggets } from '../../src/context/relevance.js';
import type { ContextNugget, ContextQuery, StalenessCheck } from '../../src/context/types.js';

function makeNugget(overrides: Partial<ContextNugget> = {}): ContextNugget {
  return {
    id: 1,
    sessionId: 's1',
    type: 'intent',
    summary: 'test nugget',
    confidence: 0.8,
    extractedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeQuery(overrides: Partial<ContextQuery> = {}): ContextQuery {
  return {
    tokenBudget: 2000,
    depth: 'standard',
    workspaceId: 'ws_test',
    ...overrides,
  };
}

const freshCheck: StalenessCheck = { nuggetId: 1, isStale: false };
const staleCheck: StalenessCheck = { nuggetId: 1, isStale: true, staleReason: 'file_changed' };

describe('relevance scoring', () => {
  it('scores exact path match higher than directory match', () => {
    const nugget = makeNugget({ scopePath: 'src/auth.ts' });
    const query = makeQuery({ path: 'src/auth.ts' });

    const exactScore = scoreNugget(nugget, query, freshCheck);

    const dirNugget = makeNugget({ scopePath: 'src/utils/helper.ts' });
    const dirScore = scoreNugget(dirNugget, query, freshCheck);

    expect(exactScore.score).toBeGreaterThan(dirScore.score);
  });

  it('scores directory prefix higher than workspace-wide', () => {
    const query = makeQuery({ path: 'src/store/schema.ts' });

    const dirNugget = makeNugget({ scopePath: 'src/store/store.ts' });
    const dirScore = scoreNugget(dirNugget, query, freshCheck);

    const wideNugget = makeNugget({ scopePath: undefined });
    const wideScore = scoreNugget(wideNugget, query, freshCheck);

    expect(dirScore.score).toBeGreaterThan(wideScore.score);
  });

  it('prioritizes constraint over intent', () => {
    const query = makeQuery({ path: 'src/auth.ts' });

    const constraint = makeNugget({ id: 1, type: 'constraint', scopePath: 'src/auth.ts' });
    const intent = makeNugget({ id: 2, type: 'intent', scopePath: 'src/auth.ts' });

    const constraintScore = scoreNugget(constraint, query, freshCheck);
    const intentScore = scoreNugget(intent, query, { nuggetId: 2, isStale: false });

    expect(constraintScore.score).toBeGreaterThan(intentScore.score);
  });

  it('applies recency decay', () => {
    const query = makeQuery();
    const recent = makeNugget({
      id: 1,
      extractedAt: new Date().toISOString(),
    });
    const old = makeNugget({
      id: 2,
      extractedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
    });

    const recentScore = scoreNugget(recent, query, freshCheck);
    const oldScore = scoreNugget(old, query, { nuggetId: 2, isStale: false });

    expect(recentScore.score).toBeGreaterThan(oldScore.score);
  });

  it('penalizes stale nuggets', () => {
    const query = makeQuery({ path: 'src/auth.ts' });
    const nugget = makeNugget({ scopePath: 'src/auth.ts' });

    const freshScore = scoreNugget(nugget, query, freshCheck);
    const staleScore = scoreNugget(nugget, query, staleCheck);

    expect(freshScore.score).toBeGreaterThan(staleScore.score);
    expect(staleScore.isStale).toBe(true);
    expect(staleScore.staleReason).toBe('file_changed');
  });

  it('boosts FTS rank', () => {
    const query = makeQuery({ query: 'authentication' });
    const nugget = makeNugget();

    const noFts = scoreNugget(nugget, query, freshCheck);
    const withFts = scoreNugget(nugget, query, freshCheck, -5.0);

    expect(withFts.score).toBeGreaterThan(noFts.score);
  });

  it('ranks nuggets in correct order', () => {
    const query = makeQuery({ path: 'src/auth.ts' });

    const nuggets = [
      makeNugget({ id: 1, type: 'intent', scopePath: 'src/auth.ts' }),
      makeNugget({ id: 2, type: 'constraint', scopePath: 'src/auth.ts' }),
      makeNugget({ id: 3, type: 'intent', scopePath: 'src/other.ts' }),
    ];

    const stalenessMap = new Map<number, StalenessCheck>([
      [1, { nuggetId: 1, isStale: false }],
      [2, { nuggetId: 2, isStale: false }],
      [3, { nuggetId: 3, isStale: false }],
    ]);

    const ranked = rankNuggets(nuggets, query, stalenessMap);

    // Constraint on exact path should be first
    expect(ranked[0].id).toBe(2);
    // Intent on exact path should be second
    expect(ranked[1].id).toBe(1);
    // Intent on other path should be last
    expect(ranked[2].id).toBe(3);
  });
});
