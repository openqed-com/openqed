import type { AgentType, AgentAdapter } from './types.js';
import { claudeCodeAdapter } from './claude-code.js';

const adapters = new Map<AgentType, AgentAdapter>([
  ['claude-code', claudeCodeAdapter],
]);

export function getAdapter(agentType: AgentType): AgentAdapter | undefined {
  return adapters.get(agentType);
}

export function getDefaultAdapter(): AgentAdapter {
  return claudeCodeAdapter;
}

export function getAllAdapters(): AgentAdapter[] {
  return Array.from(adapters.values());
}
