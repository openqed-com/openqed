import type { Workspace } from '../workspace/types.js';

export type AgentType =
  | 'claude-code'
  | 'kiro-cli'
  | 'cowork'
  | 'claude-web'
  | 'chatgpt'
  | 'gemini';

export interface AgentSession {
  id: string;
  workspace: Workspace;
  agent: AgentType;
  startedAt: Date;
  endedAt?: Date;
  totalTokens?: number;
  costUsd?: number;
  rawPath?: string;
  metadata?: Record<string, unknown>;
}

export type SessionEventType =
  | 'user_prompt'
  | 'assistant_text'
  | 'tool_call'
  | 'tool_result';

export interface SessionEvent {
  type: SessionEventType;
  timestamp: Date;
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
}

export type ArtifactType = 'file' | 'document' | 'image' | 'url' | 'data';

export type ChangeType = 'create' | 'modify' | 'delete' | 'read' | 'download';

export interface Artifact {
  type: ArtifactType;
  path?: string;
  uri?: string;
  changeType: ChangeType;
  author: 'agent' | 'human' | 'mixed';
  sizeBytes?: number;
  contentHash?: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedSession {
  session: AgentSession;
  events: SessionEvent[];
  artifacts: Artifact[];
  userPrompts: string[];
  agentArtifactPaths: string[];
}

export interface AgentAdapter {
  agentType: AgentType;
  detectWorkspace(dir: string): Promise<boolean>;
  findSessions(workspace: Workspace): Promise<AgentSession[]>;
  parseSession(session: AgentSession): Promise<ParsedSession>;
  findLatestSession(workspace: Workspace): Promise<AgentSession | null>;
  findSessionsInRange(
    workspace: Workspace,
    since: Date,
    until: Date,
  ): Promise<AgentSession[]>;
}
