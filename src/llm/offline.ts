import path from 'node:path';
import type { ParsedSession } from '../adapters/types.js';

function inferChangeType(
  stagedFiles: string[],
  diffStat: string,
): string {
  const lower = stagedFiles.map((f) => f.toLowerCase());

  if (lower.some((f) => f.includes('.test.') || f.includes('.spec.') || f.startsWith('test/'))) {
    return 'test';
  }
  if (lower.every((f) => f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.rst'))) {
    return 'docs';
  }
  if (lower.every((f) =>
    f.includes('eslint') ||
    f.includes('prettier') ||
    f.includes('tsconfig') ||
    f.includes('.github/') ||
    f.includes('Dockerfile') ||
    f === 'package.json' ||
    f === 'package-lock.json',
  )) {
    return 'chore';
  }

  // Check diffstat for mostly deletions → refactor
  const deletionMatch = diffStat.match(/(\d+) deletions?/);
  const insertionMatch = diffStat.match(/(\d+) insertions?/);
  if (deletionMatch && insertionMatch) {
    const del = parseInt(deletionMatch[1], 10);
    const ins = parseInt(insertionMatch[1], 10);
    if (del > ins * 2) return 'refactor';
  }

  // New files → feat
  const hasNew = stagedFiles.some((f) => !f.includes('/'));
  if (stagedFiles.length <= 3 && !hasNew) return 'fix';

  return 'feat';
}

function inferScope(stagedFiles: string[]): string | null {
  if (stagedFiles.length === 0) return null;
  if (stagedFiles.length === 1) {
    const dir = path.dirname(stagedFiles[0]);
    return dir === '.' ? null : path.basename(dir);
  }

  // Find common parent directory
  const dirs = stagedFiles.map((f) => path.dirname(f));
  const parts0 = dirs[0].split('/');
  let commonDepth = 0;
  for (let i = 0; i < parts0.length; i++) {
    if (dirs.every((d) => d.split('/')[i] === parts0[i])) {
      commonDepth = i + 1;
    } else {
      break;
    }
  }

  if (commonDepth === 0) return null;
  const commonDir = parts0.slice(0, commonDepth).join('/');
  return commonDir === '.' ? null : path.basename(commonDir);
}

function cleanPromptForSubject(prompt: string): string {
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
  if (subject.length > 50) {
    subject = subject.slice(0, 47) + '...';
  }

  return subject;
}

function describeFromFiles(stagedFiles: string[]): string {
  if (stagedFiles.length === 1) {
    return `update ${path.basename(stagedFiles[0])}`;
  }
  return `update ${stagedFiles.length} files`;
}

function buildBody(
  session: ParsedSession | null,
  stagedFiles: string[],
  diffStat: string,
): string {
  const lines: string[] = [];

  if (session && session.userPrompts.length > 0) {
    const prompt = session.userPrompts[0];
    const cleaned = prompt.length > 200 ? prompt.slice(0, 197) + '...' : prompt;
    lines.push(cleaned);
  }

  if (stagedFiles.length <= 10) {
    lines.push(`Files: ${stagedFiles.join(', ')}`);
  } else {
    lines.push(
      `Files: ${stagedFiles.slice(0, 8).join(', ')} and ${stagedFiles.length - 8} more`,
    );
  }

  if (diffStat) {
    lines.push(diffStat.trim());
  }

  return lines.join('\n');
}

export function generateOfflineCommitMessage(
  session: ParsedSession | null,
  stagedFiles: string[],
  diffStat: string,
): string {
  const type = inferChangeType(stagedFiles, diffStat);
  const scope = inferScope(stagedFiles);

  let subject: string;
  if (session && session.userPrompts.length > 0) {
    subject = cleanPromptForSubject(session.userPrompts[0]);
  } else {
    subject = describeFromFiles(stagedFiles);
  }

  const prefix = scope ? `${type}(${scope})` : type;
  let subjectLine = `${prefix}: ${subject}`;

  // Truncate to 72 chars
  if (subjectLine.length > 72) {
    subjectLine = subjectLine.slice(0, 69) + '...';
  }

  const body = buildBody(session, stagedFiles, diffStat);
  return `${subjectLine}\n\n${body}`;
}
