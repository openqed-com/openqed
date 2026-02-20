const EXTRACTION_SYSTEM = `You are a context extraction engine for a code provenance system. Your job is to extract structured "context nuggets" from AI coding session transcripts.

Each nugget captures a single piece of provenance — WHY code is the way it is.

## Nugget Types

- **intent**: What the user or agent was trying to accomplish
- **decision**: A deliberate choice between alternatives (e.g., "chose Redis over Memcached")
- **constraint**: A requirement or limitation that shaped the code (e.g., "must support Node 18+")
- **rejection**: Something that was explicitly considered and rejected
- **tuning**: A case where the human edited AI-generated output
- **dependency**: A dependency added or removed and why
- **workaround**: A hack or temporary fix for an underlying issue
- **caveat**: An important warning about the code's behavior or limitations

## Output Format

Return a JSON array of nugget objects. Each object has:
- type: one of the types above
- summary: a concise 1-sentence summary (max 120 chars)
- detail: optional longer explanation (1-3 sentences)
- scope_path: optional file path this nugget applies to
- scope_symbol: optional function/class/variable name
- confidence: 0.0-1.0 how confident you are this is accurate
- alternatives: optional array of alternatives that were considered (for decisions/rejections)

Output ONLY the JSON array. No explanation, no markdown fences.`;

export function buildExtractionPrompt(opts: {
  condensedSession: string;
  sessionId: string;
  agent: string;
  startedAt: string;
  artifactPaths?: string[];
}): string {
  const sections: string[] = [EXTRACTION_SYSTEM];

  sections.push(`## Session Metadata
- Session ID: ${opts.sessionId}
- Agent: ${opts.agent}
- Started: ${opts.startedAt}`);

  if (opts.artifactPaths && opts.artifactPaths.length > 0) {
    const files = opts.artifactPaths.slice(0, 30).join('\n');
    const suffix = opts.artifactPaths.length > 30
      ? `\n...and ${opts.artifactPaths.length - 30} more files`
      : '';
    sections.push(`## Files Modified\n${files}${suffix}`);
  }

  sections.push(`## Session Transcript\n${opts.condensedSession}`);

  return sections.join('\n\n');
}
