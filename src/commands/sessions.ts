import { Command } from 'commander';
import chalk from 'chalk';
import { detectWorkspace } from '../workspace/detect.js';
import { getDefaultAdapter } from '../adapters/registry.js';

function parseDuration(str: string): Date {
  const match = str.match(/^(\d+)([dhwm])$/);
  if (!match) {
    throw new Error(
      `Invalid duration "${str}". Use format: 3d, 1w, 24h, 2m (d=days, h=hours, w=weeks, m=months)`,
    );
  }

  const num = parseInt(match[1], 10);
  const unit = match[2];
  const now = Date.now();

  const ms: Record<string, number> = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    m: 30 * 24 * 60 * 60 * 1000,
  };

  return new Date(now - num * ms[unit]);
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

async function runSessionsList(options: { since?: string }): Promise<void> {
  const workspace = await detectWorkspace(process.cwd());
  const adapter = getDefaultAdapter();

  let sessions;
  if (options.since) {
    const since = parseDuration(options.since);
    sessions = await adapter.findSessionsInRange(workspace, since, new Date());
  } else {
    sessions = await adapter.findSessions(workspace);
  }

  if (sessions.length === 0) {
    console.log(chalk.yellow('No sessions found.'));
    return;
  }

  // Table header
  console.log(
    chalk.bold(
      `${'ID'.padEnd(20)} ${'Started'.padEnd(22)} ${'Agent'.padEnd(14)} First Prompt`,
    ),
  );
  console.log('─'.repeat(80));

  for (const session of sessions) {
    const id = truncate(session.id, 18);
    const started = session.startedAt.toISOString().replace('T', ' ').slice(0, 19);
    const agent = session.agent;
    const firstPrompt = (session.metadata?.firstPrompt as string) ?? '';

    console.log(
      `${id.padEnd(20)} ${started.padEnd(22)} ${agent.padEnd(14)} ${truncate(firstPrompt, 40)}`,
    );
  }

  console.log(`\n${sessions.length} session(s) found.`);
}

async function runSessionInspect(sessionId: string): Promise<void> {
  const workspace = await detectWorkspace(process.cwd());
  const adapter = getDefaultAdapter();

  const sessions = await adapter.findSessions(workspace);

  // Find by exact match or prefix
  const session = sessions.find(
    (s) => s.id === sessionId || s.id.startsWith(sessionId),
  );

  if (!session) {
    console.error(chalk.red(`Session not found: ${sessionId}`));
    process.exitCode = 1;
    return;
  }

  const parsed = await adapter.parseSession(session);

  // Display session metadata
  console.log(chalk.bold('Session: ') + parsed.session.id);
  console.log(chalk.bold('Agent: ') + parsed.session.agent);
  console.log(chalk.bold('Started: ') + parsed.session.startedAt.toISOString());
  if (parsed.session.endedAt) {
    console.log(chalk.bold('Ended: ') + parsed.session.endedAt.toISOString());
  }
  if (parsed.session.totalTokens) {
    console.log(chalk.bold('Tokens: ') + parsed.session.totalTokens.toLocaleString());
  }

  // User prompts
  if (parsed.userPrompts.length > 0) {
    console.log(chalk.bold('\nUser Prompts:'));
    for (const prompt of parsed.userPrompts) {
      console.log('  ' + chalk.cyan('> ') + truncate(prompt, 100));
    }
  }

  // Artifacts
  if (parsed.artifacts.length > 0) {
    console.log(chalk.bold('\nArtifacts:'));
    for (const artifact of parsed.artifacts) {
      const icon = artifact.changeType === 'create' ? '+' : artifact.changeType === 'modify' ? '~' : ' ';
      const color = artifact.changeType === 'create' ? chalk.green : artifact.changeType === 'modify' ? chalk.yellow : chalk.gray;
      console.log('  ' + color(`${icon} ${artifact.path ?? artifact.uri ?? '(unknown)'}`));
    }
  }

  // Event summary
  const eventCounts: Record<string, number> = {};
  for (const event of parsed.events) {
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
  }
  console.log(chalk.bold('\nEvent Summary:'));
  for (const [type, count] of Object.entries(eventCounts)) {
    console.log(`  ${type}: ${count}`);
  }
}

export function createSessionsCommand(): Command {
  const cmd = new Command('sessions')
    .description('List and inspect AI coding sessions')
    .option('--since <duration>', 'Show sessions from duration ago (e.g. 3d, 1w, 24h)')
    .action(runSessionsList);

  cmd
    .command('inspect <id>')
    .description('Inspect a specific session')
    .action(runSessionInspect);

  return cmd;
}
