import { redact } from '../../src/utils/redact.js';

describe('redact', () => {
  it('redacts OpenAI-style keys (sk-)', () => {
    const input = 'key: sk-abcdefghijklmnopqrstuvwxyz1234567890';
    const result = redact(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('sk-abc');
  });

  it('redacts GitHub personal tokens (ghp_)', () => {
    const input = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn';
    const result = redact(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('ghp_');
  });

  it('redacts AWS access keys (AKIA)', () => {
    const input = 'aws_key: AKIAIOSFODNN7EXAMPLE';
    const result = redact(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('AKIA');
  });

  it('preserves normal text', () => {
    const input = 'This is a normal commit message with no secrets';
    const result = redact(input);
    expect(result).toBe(input);
  });
});
