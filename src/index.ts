import { Command } from 'commander';
import { createInitCommand } from './commands/init.js';
import { createCommitCommand } from './commands/commit.js';
import { createSessionsCommand } from './commands/sessions.js';
import { createContextCommand } from './commands/context.js';
import { createExtractCommand } from './commands/extract.js';
import { createNuggetsCommand } from './commands/nuggets.js';
import { createCoverageCommand } from './commands/coverage.js';
import { createMcpServerCommand } from './commands/mcp-server-cmd.js';
import { createExportCommand } from './commands/export.js';
import { createImportCommand } from './commands/import.js';
import { initStore, closeStore } from './store/index.js';
import { debug } from './utils/logger.js';

const program = new Command();

program
  .name('openqed')
  .version('0.1.0')
  .description('AI session provenance for commits, PRs, and reviews');

program.addCommand(createInitCommand());
program.addCommand(createCommitCommand());
program.addCommand(createSessionsCommand());
program.addCommand(createContextCommand());
program.addCommand(createExtractCommand());
program.addCommand(createNuggetsCommand());
program.addCommand(createCoverageCommand());
program.addCommand(createExportCommand());
program.addCommand(createImportCommand());
program.addCommand(createMcpServerCommand());

program.exitOverride();

async function main(): Promise<void> {
  try {
    // Best-effort store initialization
    try {
      await initStore();
    } catch (err) {
      debug(`Store init failed: ${(err as Error).message}`);
    }

    await program.parseAsync();
  } catch (err) {
    // Filter Commander control-flow "errors" (help, version display)
    if (
      err instanceof Error &&
      'code' in err &&
      ((err as { code: string }).code === 'commander.helpDisplayed' ||
        (err as { code: string }).code === 'commander.version')
    ) {
      return;
    }
    throw err;
  } finally {
    closeStore();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
