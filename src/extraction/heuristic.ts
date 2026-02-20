import type { ParsedSession } from '../adapters/types.js';
import type { ContextNugget } from '../context/types.js';
import { estimateTokens } from '../utils/tokens.js';

type NuggetDraft = Omit<ContextNugget, 'id'>;

function cleanPromptToIntent(prompt: string): string {
  let subject = prompt.trim().split('\n')[0];

  // Strip common prefixes
  subject = subject.replace(
    /^(please\s+|can\s+you\s+|could\s+you\s+|i\s+want\s+to\s+|i\s+need\s+to\s+|let'?s\s+)/i,
    '',
  );

  // Lowercase first char
  subject = subject.charAt(0).toLowerCase() + subject.slice(1);

  // Remove trailing punctuation
  subject = subject.replace(/[.!?]+$/, '');

  // Truncate
  if (subject.length > 120) {
    subject = subject.slice(0, 117) + '...';
  }

  return subject;
}

function extractFileMentions(text: string): string[] {
  // Match file-like paths (e.g., src/foo.ts, ./bar/baz.js, package.json)
  const pattern = /(?:^|\s)((?:\.\/|\.\.\/|src\/|test\/|lib\/)?[\w./-]+\.(?:ts|js|tsx|jsx|json|md|css|html|py|rs|go|yaml|yml|toml|sql))/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const filePath = match[1].replace(/^\.\//, '');
    if (!matches.includes(filePath)) {
      matches.push(filePath);
    }
  }
  return matches;
}

export function extractHeuristicNuggets(session: ParsedSession): NuggetDraft[] {
  const nuggets: NuggetDraft[] = [];
  const now = new Date().toISOString();
  const sessionId = session.session.id;

  // 1. Intent from first prompt
  if (session.userPrompts.length > 0) {
    const firstPrompt = session.userPrompts[0];
    const intent = cleanPromptToIntent(firstPrompt);
    if (intent.length > 3) {
      nuggets.push({
        sessionId,
        type: 'intent',
        summary: intent,
        detail: firstPrompt.length > 200 ? firstPrompt.slice(0, 200) : firstPrompt,
        confidence: 0.6,
        tokenCost: estimateTokens(intent),
        extractedAt: now,
      });
    }
  }

  // 2. Per-file intents from prompt mentions cross-referenced with artifacts
  const artifactPaths = new Set(session.agentArtifactPaths);
  for (const prompt of session.userPrompts) {
    const mentions = extractFileMentions(prompt);
    for (const filePath of mentions) {
      if (artifactPaths.has(filePath)) {
        const intent = cleanPromptToIntent(prompt);
        nuggets.push({
          sessionId,
          type: 'intent',
          summary: intent,
          scopePath: filePath,
          confidence: 0.5,
          tokenCost: estimateTokens(intent),
          extractedAt: now,
        });
      }
    }
  }

  // 3. Tuning nuggets from mixed-author artifacts
  for (const artifact of session.artifacts) {
    if (artifact.author === 'mixed' && artifact.path) {
      nuggets.push({
        sessionId,
        type: 'tuning',
        summary: `human-edited AI output in ${artifact.path}`,
        scopePath: artifact.path,
        confidence: 0.65,
        tokenCost: estimateTokens(`human-edited AI output in ${artifact.path}`),
        extractedAt: now,
      });
    }
  }

  // 4. File scope nuggets from non-read artifacts
  for (const artifact of session.artifacts) {
    if (artifact.changeType !== 'read' && artifact.path) {
      const changeVerb =
        artifact.changeType === 'create'
          ? 'created'
          : artifact.changeType === 'modify'
            ? 'modified'
            : artifact.changeType === 'delete'
              ? 'deleted'
              : 'touched';
      nuggets.push({
        sessionId,
        type: 'intent',
        summary: `${changeVerb} ${artifact.path}`,
        scopePath: artifact.path,
        confidence: 0.7,
        tokenCost: estimateTokens(`${changeVerb} ${artifact.path}`),
        extractedAt: now,
      });
    }
  }

  return nuggets;
}
