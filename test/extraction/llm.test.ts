import { parseNuggetsJson, validateNugget } from '../../src/extraction/llm.js';

describe('LLM extraction parsing', () => {
  it('parses a valid JSON array', () => {
    const json = JSON.stringify([
      {
        type: 'decision',
        summary: 'chose JWT over session cookies',
        detail: 'JWT provides stateless auth',
        scope_path: 'src/auth.ts',
        confidence: 0.9,
      },
    ]);

    const result = parseNuggetsJson(json);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('decision');
  });

  it('handles markdown code block wrapping', () => {
    const wrapped = '```json\n[{"type":"intent","summary":"add auth"}]\n```';
    const result = parseNuggetsJson(wrapped);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('intent');
  });

  it('handles code block without language tag', () => {
    const wrapped = '```\n[{"type":"intent","summary":"add auth"}]\n```';
    const result = parseNuggetsJson(wrapped);
    expect(result).toHaveLength(1);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseNuggetsJson('not json')).toThrow();
  });

  it('rejects non-array JSON', () => {
    expect(() => parseNuggetsJson('{"type":"intent"}')).toThrow('Expected JSON array');
  });
});

describe('nugget validation', () => {
  it('validates a complete nugget', () => {
    const result = validateNugget(
      {
        type: 'decision',
        summary: 'chose JWT over session cookies',
        detail: 'JWT provides stateless auth',
        scope_path: 'src/auth.ts',
        confidence: 0.9,
        alternatives: ['session cookies', 'OAuth tokens'],
      },
      'session-001',
    );

    expect(result).not.toBeNull();
    expect(result!.type).toBe('decision');
    expect(result!.sessionId).toBe('session-001');
    expect(result!.summary).toBe('chose JWT over session cookies');
    expect(result!.confidence).toBe(0.9);
    expect(result!.metadata?.alternatives).toEqual(['session cookies', 'OAuth tokens']);
  });

  it('rejects invalid type', () => {
    const result = validateNugget(
      { type: 'invalid', summary: 'test' },
      'session-001',
    );
    expect(result).toBeNull();
  });

  it('rejects missing summary', () => {
    const result = validateNugget(
      { type: 'intent' },
      'session-001',
    );
    expect(result).toBeNull();
  });

  it('rejects short summary', () => {
    const result = validateNugget(
      { type: 'intent', summary: 'ab' },
      'session-001',
    );
    expect(result).toBeNull();
  });

  it('clamps confidence to 0-1', () => {
    const result = validateNugget(
      { type: 'intent', summary: 'test nugget', confidence: 1.5 },
      'session-001',
    );
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1);
  });

  it('defaults confidence to 0.7', () => {
    const result = validateNugget(
      { type: 'intent', summary: 'test nugget' },
      'session-001',
    );
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.7);
  });
});
