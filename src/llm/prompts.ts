import type { Attribution } from '../git/trailers.js';

const COMMIT_MESSAGE_PROMPT = `You are a commit message generator. Write a conventional commit message with a descriptive body.

Rules:
- Use conventional commit format: type(scope): subject
- Types: feat, fix, refactor, test, docs, chore, style, perf, ci, build
- Subject line max 72 characters, imperative mood, no period at end
- ALWAYS include a body paragraph after a blank line
- The body should be 2-4 sentences summarizing WHAT was done and WHY
- Mention key files or modules affected
- Wrap body lines at 72 characters
- If AI session context is provided, use it to understand intent and describe the work
- Output ONLY the commit message (subject + blank line + body), nothing else`;

export function buildCommitPrompt(opts: {
  diffStat: string;
  stagedFiles: string[];
  diff: string;
  userPrompts?: string[];
  agentArtifactPaths?: string[];
  attribution?: Attribution;
}): string {
  const sections: string[] = [COMMIT_MESSAGE_PROMPT];

  // Diff summary
  if (opts.diffStat) {
    sections.push(`## Diff Summary\n\`\`\`\n${opts.diffStat}\n\`\`\``);
  }

  // Staged files
  if (opts.stagedFiles.length > 0) {
    const fileList = opts.stagedFiles.slice(0, 30).join('\n');
    const suffix =
      opts.stagedFiles.length > 30
        ? `\n...and ${opts.stagedFiles.length - 30} more files`
        : '';
    sections.push(`## Staged Files\n\`\`\`\n${fileList}${suffix}\n\`\`\``);
  }

  // Diff content
  if (opts.diff) {
    sections.push(`## Diff\n\`\`\`diff\n${opts.diff}\n\`\`\``);
  }

  // AI session context
  if (opts.userPrompts && opts.userPrompts.length > 0) {
    const prompts = opts.userPrompts
      .slice(0, 5)
      .map((p, i) => {
        const truncated = p.length > 500 ? p.slice(0, 497) + '...' : p;
        return `${i + 1}. ${truncated}`;
      })
      .join('\n');
    sections.push(`## AI Session - User Prompts\n${prompts}`);
  }

  // Agent-modified files
  if (opts.agentArtifactPaths && opts.agentArtifactPaths.length > 0) {
    const files = opts.agentArtifactPaths.slice(0, 20).join('\n');
    const suffix =
      opts.agentArtifactPaths.length > 20
        ? `\n...and ${opts.agentArtifactPaths.length - 20} more files`
        : '';
    sections.push(
      `## Agent-Modified Files\n\`\`\`\n${files}${suffix}\n\`\`\``,
    );
  }

  // Attribution summary
  if (opts.attribution) {
    const total =
      opts.attribution.agentFiles.length + opts.attribution.humanFiles.length;
    if (total > 0) {
      const agentPct = Math.round(
        (opts.attribution.agentFiles.length / total) * 100,
      );
      sections.push(
        `## Attribution\n${agentPct}% AI-assisted, ${100 - agentPct}% human-authored`,
      );
    }
  }

  return sections.join('\n\n');
}
