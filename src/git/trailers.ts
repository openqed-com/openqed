export interface Attribution {
  agentFiles: string[];
  humanFiles: string[];
}

function formatFileList(files: string[], max = 5): string {
  if (files.length === 0) return '';
  const shown = files.slice(0, max);
  const remaining = files.length - shown.length;
  const list = shown.join(', ');
  return remaining > 0 ? `${list} +${remaining} more` : list;
}

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  'kiro-cli': 'Kiro',
  cowork: 'Cowork',
  'claude-web': 'Claude Web',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
};

export function formatTrailers(
  sessionId: string | null,
  attribution: Attribution,
  agent?: string,
): string {
  const lines: string[] = [];

  if (sessionId) {
    lines.push(`openqed-Session: ${sessionId}`);
  }

  const total = attribution.agentFiles.length + attribution.humanFiles.length;
  if (total > 0) {
    const agentPct = Math.round(
      (attribution.agentFiles.length / total) * 100,
    );
    const humanPct = 100 - agentPct;
    const parts: string[] = [];
    if (attribution.agentFiles.length > 0) {
      parts.push(
        `${agentPct}% agent (${formatFileList(attribution.agentFiles)})`,
      );
    }
    if (attribution.humanFiles.length > 0) {
      parts.push(
        `${humanPct}% human (${formatFileList(attribution.humanFiles)})`,
      );
    }
    lines.push(`openqed-Attribution: ${parts.join(', ')}`);
  }

  if (attribution.agentFiles.length > 0) {
    const displayName = agent
      ? AGENT_DISPLAY_NAMES[agent] ?? agent
      : 'AI';
    lines.push(
      `Co-authored-by: OpenQED (${displayName}) <noreply@openqed.com>`,
    );
  }

  return lines.join('\n');
}
