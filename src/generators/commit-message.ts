import type { Workspace } from '../workspace/types.js';
import type { ParsedSession } from '../adapters/types.js';
import type { CommitMessageResult } from '../llm/types.js';
import type { Attribution } from '../git/trailers.js';
import { getDefaultAdapter } from '../adapters/registry.js';
import { getStagedFiles, getStagedDiff, getStagedDiffStat } from '../git/diff.js';
import { getLastCommitTime } from '../git/log.js';
import { formatTrailers } from '../git/trailers.js';
import { generateText } from '../llm/provider.js';
import { generateOfflineCommitMessage } from '../llm/offline.js';
import { buildCommitPrompt } from '../llm/prompts.js';
import { debug } from '../utils/logger.js';

export interface CommitMessageOptions {
  model?: string;
  timeoutMs?: number;
  offline?: boolean;
}

async function findRelevantSession(
  workspace: Workspace,
  stagedFiles: string[],
  lastCommitTime: Date | null,
): Promise<ParsedSession | null> {
  const adapter = getDefaultAdapter();

  // Search window: from (lastCommitTime - 30min) to now
  const now = new Date();
  const since = lastCommitTime
    ? new Date(lastCommitTime.getTime() - 30 * 60 * 1000)
    : new Date(now.getTime() - 24 * 60 * 60 * 1000); // fallback: 24h ago

  const candidates = await adapter.findSessionsInRange(workspace, since, now);
  debug(`Found ${candidates.length} session candidates in time window`);

  if (candidates.length === 0) return null;

  // Check each candidate (most recent first) for overlap with staged files
  for (const candidate of candidates) {
    try {
      const parsed = await adapter.parseSession(candidate);
      const overlap = parsed.agentArtifactPaths.filter((p) =>
        stagedFiles.includes(p),
      );
      if (overlap.length > 0) {
        debug(`Session ${candidate.id} has ${overlap.length} overlapping files`);
        return parsed;
      }
    } catch (err) {
      debug(`Failed to parse session ${candidate.id}: ${(err as Error).message}`);
    }
  }

  // Fallback: return most recent session parsed
  try {
    return await adapter.parseSession(candidates[0]);
  } catch {
    return null;
  }
}

function computeAttribution(
  parsedSession: ParsedSession | null,
  stagedFiles: string[],
): Attribution {
  if (!parsedSession) {
    return { agentFiles: [], humanFiles: [...stagedFiles] };
  }

  const agentPaths = new Set(parsedSession.agentArtifactPaths);
  const agentFiles: string[] = [];
  const humanFiles: string[] = [];

  for (const file of stagedFiles) {
    if (agentPaths.has(file)) {
      agentFiles.push(file);
    } else {
      humanFiles.push(file);
    }
  }

  return { agentFiles, humanFiles };
}

export async function generateCommitMessage(
  workspace: Workspace,
  opts: CommitMessageOptions = {},
): Promise<CommitMessageResult & { trailers: string; sessionId: string | null }> {
  // 1. Get staged files
  const stagedFiles = await getStagedFiles(workspace.path);
  if (stagedFiles.length === 0) {
    throw new Error('No staged files. Stage changes with `git add` first.');
  }

  // 2. Get diff info (parallel)
  const [diff, diffStat, lastCommitTime] = await Promise.all([
    getStagedDiff(workspace.path),
    getStagedDiffStat(workspace.path),
    getLastCommitTime(workspace.path),
  ]);

  // 3. Find relevant session
  const parsedSession = await findRelevantSession(
    workspace,
    stagedFiles,
    lastCommitTime,
  );

  // 4. Compute attribution
  const attribution = computeAttribution(parsedSession, stagedFiles);
  debug(
    `Attribution: ${attribution.agentFiles.length} agent, ${attribution.humanFiles.length} human`,
  );

  // 5. Generate commit message
  let message: string;
  let source: 'llm' | 'offline';

  if (opts.offline) {
    message = generateOfflineCommitMessage(parsedSession, stagedFiles, diffStat);
    source = 'offline';
  } else {
    const prompt = buildCommitPrompt({
      diffStat,
      stagedFiles,
      diff,
      userPrompts: parsedSession?.userPrompts,
      agentArtifactPaths: parsedSession?.agentArtifactPaths,
      attribution,
    });

    const llmResult = await generateText(prompt, {
      model: opts.model,
      timeoutMs: opts.timeoutMs,
    });

    if (llmResult) {
      message = llmResult.trim();
      source = 'llm';
    } else {
      debug('LLM failed, falling back to offline generation');
      message = generateOfflineCommitMessage(parsedSession, stagedFiles, diffStat);
      source = 'offline';
    }
  }

  // 6. Format trailers
  const sessionId = parsedSession?.session.id ?? null;
  const agent = parsedSession?.session.agent;
  const trailers = formatTrailers(sessionId, attribution, agent);

  return { message, source, trailers, sessionId };
}
