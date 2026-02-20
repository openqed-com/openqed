import { formatTrailers } from '../../src/git/trailers.js';

describe('formatTrailers', () => {
  it('includes session ID when provided', () => {
    const result = formatTrailers('session-123', {
      agentFiles: ['a.ts'],
      humanFiles: [],
    });
    expect(result).toContain('openqed-Session: session-123');
  });

  it('omits session ID when null', () => {
    const result = formatTrailers(null, {
      agentFiles: ['a.ts'],
      humanFiles: [],
    });
    expect(result).not.toContain('openqed-Session');
  });

  it('includes Co-authored-by with OpenQED branding', () => {
    const result = formatTrailers('s1', {
      agentFiles: ['a.ts'],
      humanFiles: ['b.ts'],
    }, 'claude-code');
    expect(result).toContain('Co-authored-by: OpenQED (Claude Code) <noreply@openqed.com>');
  });

  it('omits Co-authored-by when no agent files', () => {
    const result = formatTrailers('s1', {
      agentFiles: [],
      humanFiles: ['b.ts'],
    });
    expect(result).not.toContain('Co-authored-by');
  });

  it('calculates attribution percentages', () => {
    const result = formatTrailers('s1', {
      agentFiles: ['a.ts', 'b.ts'],
      humanFiles: ['c.ts', 'd.ts'],
    });
    expect(result).toContain('50% agent');
    expect(result).toContain('50% human');
  });
});
