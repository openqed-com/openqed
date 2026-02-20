import { assembleResponse } from '../../src/context/budget.js';
import type { ContextQuery, ScoredNugget } from '../../src/context/types.js';

function makeQuery(overrides: Partial<ContextQuery> = {}): ContextQuery {
  return {
    tokenBudget: 2000,
    depth: 'standard',
    workspaceId: 'ws_test',
    ...overrides,
  };
}

function makeScoredNugget(overrides: Partial<ScoredNugget> = {}): ScoredNugget {
  return {
    id: 1,
    sessionId: 's1',
    type: 'intent',
    summary: 'test nugget summary for budget calculation',
    confidence: 0.8,
    extractedAt: new Date().toISOString(),
    score: 0.8,
    isStale: false,
    ...overrides,
  };
}

const sessionLookup = new Map([
  ['s1', { agent: 'claude-code', date: '2025-01-15T10:00:00Z' }],
  ['s2', { agent: 'claude-code', date: '2025-01-16T10:00:00Z' }],
]);

describe('budget assembly', () => {
  it('packs summaries within budget', () => {
    const nuggets = [
      makeScoredNugget({ id: 1, summary: 'first nugget' }),
      makeScoredNugget({ id: 2, summary: 'second nugget' }),
    ];

    const response = assembleResponse(nuggets, makeQuery(), sessionLookup);
    expect(response.nuggets).toHaveLength(2);
    expect(response.budget.used).toBeGreaterThan(0);
    expect(response.budget.used).toBeLessThanOrEqual(2000);
    expect(response.budget.truncated).toBe(false);
  });

  it('adds detail in standard mode', () => {
    const nuggets = [
      makeScoredNugget({
        id: 1,
        summary: 'chose JWT',
        detail: 'JWT provides stateless authentication which is better for scaling',
      }),
    ];

    const response = assembleResponse(nuggets, makeQuery({ depth: 'standard' }), sessionLookup);
    expect(response.nuggets[0].detail).toBeDefined();
    expect(response.nuggets[0].detail).toContain('JWT');
  });

  it('excludes detail in summary mode', () => {
    const nuggets = [
      makeScoredNugget({
        id: 1,
        summary: 'chose JWT',
        detail: 'JWT provides stateless authentication',
      }),
    ];

    const response = assembleResponse(nuggets, makeQuery({ depth: 'summary' }), sessionLookup);
    expect(response.nuggets[0].detail).toBeUndefined();
  });

  it('sets truncated flag when budget exceeded', () => {
    // Create many nuggets to overflow a tiny budget
    const nuggets = Array.from({ length: 50 }, (_, i) =>
      makeScoredNugget({ id: i + 1, summary: `nugget number ${i + 1} with a long description` }),
    );

    const response = assembleResponse(nuggets, makeQuery({ tokenBudget: 100 }), sessionLookup);
    expect(response.budget.truncated).toBe(true);
    expect(response.nuggets.length).toBeLessThan(50);
  });

  it('generates moreContextHint for overflow', () => {
    const nuggets = Array.from({ length: 50 }, (_, i) =>
      makeScoredNugget({ id: i + 1, summary: `nugget ${i + 1} with enough text to use tokens` }),
    );

    const response = assembleResponse(nuggets, makeQuery({ tokenBudget: 100 }), sessionLookup);
    expect(response.moreContextHint).toBeDefined();
    expect(response.moreContextHint).toContain('more nuggets');
  });

  it('handles empty nuggets list', () => {
    const response = assembleResponse([], makeQuery(), sessionLookup);
    expect(response.nuggets).toHaveLength(0);
    expect(response.budget.used).toBe(0);
    expect(response.budget.truncated).toBe(false);
    expect(response.moreContextHint).toBeUndefined();
  });

  it('handles zero budget', () => {
    const nuggets = [makeScoredNugget()];
    const response = assembleResponse(nuggets, makeQuery({ tokenBudget: 0 }), sessionLookup);
    expect(response.nuggets).toHaveLength(0);
    expect(response.budget.truncated).toBe(true);
  });
});
