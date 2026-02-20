const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{20,}\b/g,
  /\bghp_[a-zA-Z0-9]{36,}\b/g,
  /\bghs_[a-zA-Z0-9]{36,}\b/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
];

export function redact(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}
