import type { ParsedSession } from '../adapters/types.js';
import type { ContextNugget, NuggetType } from '../context/types.js';
import { condenseForExtraction } from './condense.js';
import { buildExtractionPrompt } from './prompts.js';
import { generateText } from '../llm/provider.js';
import { estimateTokens } from '../utils/tokens.js';
import { debug } from '../utils/logger.js';

type NuggetDraft = Omit<ContextNugget, 'id'>;

const VALID_TYPES: Set<string> = new Set([
  'intent', 'decision', 'constraint', 'rejection',
  'tuning', 'dependency', 'workaround', 'caveat',
]);

interface RawNugget {
  type?: string;
  summary?: string;
  detail?: string;
  scope_path?: string;
  scope_symbol?: string;
  confidence?: number;
  alternatives?: string[];
}

function parseNuggetsJson(text: string): RawNugget[] {
  let cleaned = text.trim();

  // Strip markdown code block fencing if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array');
  }
  return parsed;
}

function validateNugget(raw: RawNugget, sessionId: string): NuggetDraft | null {
  if (!raw.type || !VALID_TYPES.has(raw.type)) return null;
  if (!raw.summary || typeof raw.summary !== 'string') return null;
  if (raw.summary.length < 3) return null;

  const summary = raw.summary.slice(0, 200);
  const detail = typeof raw.detail === 'string' ? raw.detail.slice(0, 500) : undefined;
  const confidence = typeof raw.confidence === 'number'
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0.7;

  return {
    sessionId,
    type: raw.type as NuggetType,
    summary,
    detail,
    scopePath: typeof raw.scope_path === 'string' ? raw.scope_path : undefined,
    scopeSymbol: typeof raw.scope_symbol === 'string' ? raw.scope_symbol : undefined,
    confidence,
    tokenCost: estimateTokens(summary + (detail ?? '')),
    extractedAt: new Date().toISOString(),
    metadata: raw.alternatives ? { alternatives: raw.alternatives } : undefined,
  };
}

export async function extractLLMNuggets(
  session: ParsedSession,
  opts: { model?: string } = {},
): Promise<NuggetDraft[]> {
  try {
    const condensed = condenseForExtraction(session);
    const prompt = buildExtractionPrompt({
      condensedSession: condensed,
      sessionId: session.session.id,
      agent: session.session.agent,
      startedAt: session.session.startedAt.toISOString(),
      artifactPaths: session.agentArtifactPaths,
    });

    const result = await generateText(prompt, { model: opts.model });
    if (!result) {
      debug('LLM extraction returned null');
      return [];
    }

    const rawNuggets = parseNuggetsJson(result);
    const validated: NuggetDraft[] = [];

    for (const raw of rawNuggets) {
      const nugget = validateNugget(raw, session.session.id);
      if (nugget) {
        validated.push(nugget);
      }
    }

    debug(`LLM extracted ${validated.length} nuggets from ${rawNuggets.length} raw`);
    return validated;
  } catch (err) {
    debug(`LLM extraction failed: ${(err as Error).message}`);
    return [];
  }
}

// Exported for testing
export { parseNuggetsJson, validateNugget };
