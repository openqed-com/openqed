import type { ContextNugget, ContextQuery, ScoredNugget, StalenessCheck } from './types.js';

// Type priority (higher = more important)
const TYPE_PRIORITY: Record<string, number> = {
  constraint: 1.0,
  caveat: 0.9,
  tuning: 0.8,
  decision: 0.7,
  rejection: 0.6,
  workaround: 0.5,
  intent: 0.4,
  dependency: 0.3,
};

function scopeMatchScore(nugget: ContextNugget, query: ContextQuery): number {
  if (!query.path) return 0.5; // No path filter — neutral

  if (!nugget.scopePath) return 0.2; // Workspace-wide nugget

  if (nugget.scopePath === query.path) return 1.0; // Exact match

  // Directory prefix match
  if (query.path.startsWith(nugget.scopePath + '/') ||
      nugget.scopePath.startsWith(query.path + '/')) {
    return 0.6;
  }

  // Same directory
  const nuggetDir = nugget.scopePath.split('/').slice(0, -1).join('/');
  const queryDir = query.path.split('/').slice(0, -1).join('/');
  if (nuggetDir === queryDir && nuggetDir !== '') return 0.5;

  return 0.1;
}

function recencyScore(nugget: ContextNugget): number {
  const extractedAt = new Date(nugget.extractedAt).getTime();
  const now = Date.now();
  const daysSince = (now - extractedAt) / (1000 * 60 * 60 * 24);

  // Exponential decay with 30-day half-life
  return Math.exp(-0.693 * daysSince / 30);
}

function typePriority(nugget: ContextNugget): number {
  return TYPE_PRIORITY[nugget.type] ?? 0.3;
}

export function scoreNugget(
  nugget: ContextNugget,
  query: ContextQuery,
  staleness: StalenessCheck,
  ftsRank?: number,
): ScoredNugget {
  // Base scoring weights
  const scopeWeight = 0.30;
  const typeWeight = 0.20;
  const recencyWeight = 0.15;
  const confidenceWeight = 0.10;
  const ftsWeight = 0.10;

  let score =
    scopeWeight * scopeMatchScore(nugget, query) +
    typeWeight * typePriority(nugget) +
    recencyWeight * recencyScore(nugget) +
    confidenceWeight * nugget.confidence;

  // FTS relevance boost
  if (ftsRank !== undefined && ftsRank < 0) {
    // bm25() returns negative values; more negative = more relevant
    const normalizedRank = Math.min(1.0, Math.abs(ftsRank) / 10);
    score += ftsWeight * normalizedRank;
    // Extra boost for FTS match
    score += 0.15;
  }

  // Type boosts
  if (nugget.type === 'constraint' || nugget.type === 'caveat') {
    score += 0.2;
  } else if (nugget.type === 'tuning') {
    score += 0.15;
  }

  // Stale penalty
  if (staleness.isStale) {
    score -= 0.3;
  }

  return {
    ...nugget,
    score: Math.max(0, Math.min(1, score)),
    isStale: staleness.isStale,
    staleReason: staleness.staleReason,
    supersededBy: staleness.supersededBy,
  };
}

export function rankNuggets(
  nuggets: ContextNugget[],
  query: ContextQuery,
  stalenessMap: Map<number, StalenessCheck>,
  ftsRanks?: Map<number, number>,
): ScoredNugget[] {
  const scored = nuggets.map((nugget) => {
    const staleness = stalenessMap.get(nugget.id) ?? { nuggetId: nugget.id, isStale: false };
    const ftsRank = ftsRanks?.get(nugget.id);
    return scoreNugget(nugget, query, staleness, ftsRank);
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored;
}
