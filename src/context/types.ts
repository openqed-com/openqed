export type NuggetType =
  | 'intent'
  | 'decision'
  | 'constraint'
  | 'rejection'
  | 'tuning'
  | 'dependency'
  | 'workaround'
  | 'caveat';

export interface ContextNugget {
  id: number;
  sessionId: string;
  eventId?: number;
  type: NuggetType;
  summary: string;
  detail?: string;
  scopePath?: string;
  scopeSymbol?: string;
  confidence: number;
  tokenCost?: number;
  extractedAt: string;
  staleAfter?: string;
  metadata?: Record<string, unknown>;
}

export interface ScoredNugget extends ContextNugget {
  score: number;
  isStale: boolean;
  staleReason?: string;
  supersededBy?: number;
}

export interface ContextQuery {
  path?: string;
  symbol?: string;
  query?: string;
  lineRange?: { start: number; end: number };
  tokenBudget: number;
  types?: NuggetType[];
  since?: Date;
  depth: 'summary' | 'standard' | 'deep';
  workspaceId: string;
}

export interface ContextBudget {
  requested: number;
  used: number;
  available: number;
  truncated: boolean;
}

export interface ContextResponseNugget {
  type: NuggetType;
  summary: string;
  detail?: string;
  scope: string;
  confidence: number;
  sessionDate: string;
  sessionAgent: string;
  sourcePrompt?: string;
  alternatives?: string[];
  stale?: boolean;
  staleReason?: string;
}

export interface ContextResponse {
  query: {
    path?: string;
    symbol?: string;
    text?: string;
    depth: string;
  };
  budget: ContextBudget;
  nuggets: ContextResponseNugget[];
  moreContextHint?: string;
}

export interface ContextQueryLog {
  queriedAt: string;
  queryType: string;
  queryValue: string;
  workspaceId?: string;
  nuggetsReturned: number;
  tokenBudget?: number;
  agent?: string;
}

export interface StalenessCheck {
  nuggetId: number;
  isStale: boolean;
  staleReason?: string;
  supersededBy?: number;
}
