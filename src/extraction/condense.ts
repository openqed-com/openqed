import type { ParsedSession, SessionEvent } from '../adapters/types.js';
import { estimateTokens } from '../utils/tokens.js';

function condenseTool(event: SessionEvent): string | null {
  const name = event.toolName ?? '';

  // Skip Read calls — they don't tell us about intent
  if (name === 'Read' || name === 'View') return null;

  // Write/Edit: file path + truncated content
  if (name === 'Write' || name === 'Edit') {
    const input = event.toolInput ?? {};
    const filePath = (input.file_path ?? input.path ?? '') as string;
    const content = (input.content ?? input.new_string ?? '') as string;
    if (!filePath) return null;

    const lines = content.split('\n');
    let snippet: string;
    if (lines.length <= 10) {
      snippet = content;
    } else {
      const first5 = lines.slice(0, 5).join('\n');
      const last5 = lines.slice(-5).join('\n');
      snippet = `${first5}\n...(${lines.length - 10} lines omitted)...\n${last5}`;
    }
    return `[${name}] ${filePath}\n${snippet}`;
  }

  // Bash: command + truncated output
  if (name === 'Bash' || name === 'bash') {
    const input = event.toolInput ?? {};
    const command = (input.command ?? '') as string;
    const output = event.toolOutput ?? '';
    const outputLines = output.split('\n').slice(0, 10).join('\n');
    const truncatedOutput = output.split('\n').length > 10
      ? outputLines + '\n...(truncated)'
      : outputLines;
    return `[Bash] $ ${command}\n${truncatedOutput}`;
  }

  // Other tool calls: just tool name and file path if present
  const input = event.toolInput ?? {};
  const filePath = (input.file_path ?? input.path ?? '') as string;
  return filePath ? `[${name}] ${filePath}` : `[${name}]`;
}

export function condenseForExtraction(
  session: ParsedSession,
  targetTokens = 8000,
): string {
  const parts: string[] = [];

  parts.push(`Session: ${session.session.id}`);
  parts.push(`Agent: ${session.session.agent}`);
  parts.push(`Started: ${session.session.startedAt.toISOString()}`);
  if (session.session.endedAt) {
    parts.push(`Ended: ${session.session.endedAt.toISOString()}`);
  }
  parts.push('');

  for (const event of session.events) {
    // Keep ALL user prompts verbatim
    if (event.type === 'user_prompt' && event.content) {
      parts.push(`[User] ${event.content}`);
      parts.push('');
      continue;
    }

    // Tool calls: condensed
    if (event.type === 'tool_call') {
      const condensed = condenseTool(event);
      if (condensed) {
        parts.push(condensed);
        parts.push('');
      }
      continue;
    }

    // Assistant text: only if >50 chars, truncate to 200
    if (event.type === 'assistant_text' && event.content) {
      if (event.content.length > 50) {
        const truncated = event.content.length > 200
          ? event.content.slice(0, 200) + '...'
          : event.content;
        parts.push(`[Assistant] ${truncated}`);
        parts.push('');
      }
      continue;
    }

    // Skip tool_result boilerplate
  }

  let result = parts.join('\n');

  // Truncate if over budget
  const currentTokens = estimateTokens(result);
  if (currentTokens > targetTokens) {
    const charBudget = targetTokens * 4;
    result = result.slice(0, charBudget) + '\n...(truncated)';
  }

  return result;
}
