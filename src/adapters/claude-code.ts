import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type {
  AgentAdapter,
  AgentSession,
  ParsedSession,
  SessionEvent,
  Artifact,
} from './types.js';
import type { Workspace } from '../workspace/types.js';
import { getProjectDir } from '../utils/paths.js';
import { debug, warn } from '../utils/logger.js';

// --- Internal JSONL types (not exported) ---

interface SessionIndexEntry {
  sessionId: string;
  fullPath: string;
  created: string;
  modified: string;
  summary?: string;
  gitBranch?: string;
  firstPrompt?: string;
  messageCount?: number;
  isSidechain?: boolean;
}

interface SessionIndexFile {
  sessions: SessionIndexEntry[];
}

interface JsonlUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface JsonlContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | JsonlContentBlock[];
  tool_use_id?: string;
}

interface JsonlMessage {
  role?: string;
  content?: string | JsonlContentBlock[];
  model?: string;
  usage?: JsonlUsage;
}

interface JsonlLine {
  type?: string;
  sessionId?: string;
  timestamp?: string;
  message?: JsonlMessage;
  isSidechain?: boolean;
}

// --- Session discovery ---

async function discoverSessionsFromIndex(
  projectDir: string,
  workspace: Workspace,
): Promise<AgentSession[] | null> {
  const indexPath = path.join(projectDir, 'sessions-index.json');

  let raw: string;
  try {
    raw = await fs.readFile(indexPath, 'utf-8');
  } catch {
    return null;
  }

  let index: SessionIndexFile;
  try {
    index = JSON.parse(raw) as SessionIndexFile;
  } catch {
    warn(`Failed to parse sessions-index.json in ${projectDir}`);
    return null;
  }

  if (!index.sessions || !Array.isArray(index.sessions)) {
    return null;
  }

  const sessions: AgentSession[] = index.sessions
    .filter((e) => !e.isSidechain)
    .map((entry) => ({
      id: entry.sessionId,
      workspace,
      agent: 'claude-code' as const,
      startedAt: new Date(entry.created),
      endedAt: new Date(entry.modified),
      rawPath: entry.fullPath,
      metadata: {
        gitBranch: entry.gitBranch,
        firstPrompt: entry.firstPrompt,
        summary: entry.summary,
        messageCount: entry.messageCount,
      },
    }));

  sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return sessions;
}

async function discoverSessionsFromFiles(
  projectDir: string,
  workspace: Workspace,
): Promise<AgentSession[]> {
  let files: string[];
  try {
    const entries = await fs.readdir(projectDir);
    files = entries.filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }

  const sessions: AgentSession[] = [];

  for (const file of files) {
    const filePath = path.join(projectDir, file);
    try {
      const stat = await fs.stat(filePath);

      // Read first user line for metadata
      let sessionId = path.basename(file, '.jsonl');
      let firstTimestamp: Date | undefined;

      const rl = createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (line.includes('"file-history-snapshot"')) continue;
        try {
          const parsed = JSON.parse(line) as JsonlLine;
          if (parsed.message?.role === 'user') {
            if (parsed.sessionId) sessionId = parsed.sessionId;
            if (parsed.timestamp) firstTimestamp = new Date(parsed.timestamp);
            rl.close();
            break;
          }
        } catch {
          // Skip malformed lines
        }
      }

      sessions.push({
        id: sessionId,
        workspace,
        agent: 'claude-code',
        startedAt: firstTimestamp ?? stat.birthtime,
        endedAt: stat.mtime,
        rawPath: filePath,
      });
    } catch {
      debug(`Failed to process session file: ${file}`);
    }
  }

  sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return sessions;
}

// --- JSONL streaming parser ---

function relativize(absPath: string, workspacePath: string): string {
  if (absPath.startsWith(workspacePath)) {
    return path.relative(workspacePath, absPath);
  }
  return absPath;
}

const SKIP_TYPES = ['"type":"progress"', '"type":"file-history-snapshot"', '"type":"queue-operation"'];

const TOOL_TO_CHANGE_TYPE: Record<string, 'create' | 'modify' | 'read'> = {
  Write: 'create',
  Edit: 'modify',
  Read: 'read',
};

async function parseJsonlFile(
  filePath: string,
  workspace: Workspace,
  sessionId: string,
): Promise<ParsedSession> {
  const events: SessionEvent[] = [];
  const userPrompts: string[] = [];
  const artifactMap = new Map<string, Artifact>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let firstTimestamp: Date | undefined;
  let lastTimestamp: Date | undefined;

  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    // Fast rejection
    if (SKIP_TYPES.some((t) => line.includes(t))) continue;

    let parsed: JsonlLine;
    try {
      parsed = JSON.parse(line) as JsonlLine;
    } catch {
      continue;
    }

    if (parsed.isSidechain) continue;

    const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date();
    if (!firstTimestamp) firstTimestamp = timestamp;
    lastTimestamp = timestamp;

    const msg = parsed.message;
    if (!msg) continue;

    // Token tracking
    if (msg.usage) {
      totalInputTokens += msg.usage.input_tokens ?? 0;
      totalOutputTokens += msg.usage.output_tokens ?? 0;
    }

    if (msg.role === 'user') {
      handleUserMessage(msg, timestamp, events, userPrompts);
    } else if (msg.role === 'assistant') {
      handleAssistantMessage(msg, timestamp, events, artifactMap, workspace.path);
    }
  }

  const artifacts = Array.from(artifactMap.values());
  const agentArtifactPaths = artifacts
    .filter((a) => a.path && a.changeType !== 'read')
    .map((a) => a.path!);

  const session: AgentSession = {
    id: sessionId,
    workspace,
    agent: 'claude-code',
    startedAt: firstTimestamp ?? new Date(),
    endedAt: lastTimestamp,
    totalTokens: totalInputTokens + totalOutputTokens,
    rawPath: filePath,
  };

  return { session, events, artifacts, userPrompts, agentArtifactPaths };
}

function handleUserMessage(
  msg: JsonlMessage,
  timestamp: Date,
  events: SessionEvent[],
  userPrompts: string[],
): void {
  if (typeof msg.content === 'string') {
    if (msg.content.startsWith('<local-command-') || msg.content.startsWith('<command-name>')) {
      return;
    }
    userPrompts.push(msg.content);
    events.push({ type: 'user_prompt', timestamp, content: msg.content });
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === 'tool_result') {
        events.push({
          type: 'tool_result',
          timestamp,
          content: typeof block.content === 'string' ? block.content : undefined,
          toolName: block.tool_use_id,
        });
      }
    }
  }
}

function handleAssistantMessage(
  msg: JsonlMessage,
  timestamp: Date,
  events: SessionEvent[],
  artifactMap: Map<string, Artifact>,
  workspacePath: string,
): void {
  if (!Array.isArray(msg.content)) return;

  for (const block of msg.content) {
    if (block.type === 'thinking') continue;

    if (block.type === 'text' && block.text) {
      events.push({ type: 'assistant_text', timestamp, content: block.text });
    }

    if (block.type === 'tool_use' && block.name) {
      events.push({
        type: 'tool_call',
        timestamp,
        toolName: block.name,
        toolInput: block.input as Record<string, unknown> | undefined,
      });

      // Map tool calls to artifacts
      const changeType = TOOL_TO_CHANGE_TYPE[block.name];
      if (changeType && block.input) {
        const filePath = (block.input as Record<string, string>).file_path;
        if (filePath) {
          const relPath = relativize(filePath, workspacePath);
          artifactMap.set(relPath, {
            type: 'file',
            path: relPath,
            changeType,
            author: 'agent',
          });
        }
      }
    }
  }
}

// --- Exported adapter ---

export const claudeCodeAdapter: AgentAdapter = {
  agentType: 'claude-code',

  async detectWorkspace(dir: string): Promise<boolean> {
    const projectDir = getProjectDir(dir);
    try {
      await fs.access(projectDir);
      return true;
    } catch {
      return false;
    }
  },

  async findSessions(workspace: Workspace): Promise<AgentSession[]> {
    const projectDir = getProjectDir(workspace.path);
    debug(`Looking for sessions in ${projectDir}`);

    // Try index first
    const indexed = await discoverSessionsFromIndex(projectDir, workspace);
    if (indexed !== null) {
      debug(`Found ${indexed.length} sessions from index`);
      return indexed;
    }

    // Fallback to file scanning
    debug('No sessions-index.json, falling back to file scan');
    const sessions = await discoverSessionsFromFiles(projectDir, workspace);
    debug(`Found ${sessions.length} sessions from files`);
    return sessions;
  },

  async parseSession(session: AgentSession): Promise<ParsedSession> {
    if (!session.rawPath) {
      throw new Error(`Session ${session.id} has no rawPath`);
    }
    return parseJsonlFile(session.rawPath, session.workspace, session.id);
  },

  async findLatestSession(
    workspace: Workspace,
  ): Promise<AgentSession | null> {
    const sessions = await this.findSessions(workspace);
    return sessions.length > 0 ? sessions[0] : null;
  },

  async findSessionsInRange(
    workspace: Workspace,
    since: Date,
    until: Date,
  ): Promise<AgentSession[]> {
    const sessions = await this.findSessions(workspace);
    return sessions.filter((s) => {
      const end = s.endedAt ?? s.startedAt;
      return end >= since && s.startedAt <= until;
    });
  },
};
