import path from 'node:path';
import { simpleGit } from 'simple-git';
import { hashWorkspace } from './hash.js';
import type { Workspace } from './types.js';

export async function detectWorkspace(dir: string): Promise<Workspace> {
  const git = simpleGit(dir);

  try {
    const gitRoot = (await git.revparse(['--show-toplevel'])).trim();

    let remoteUrl: string | undefined;
    try {
      remoteUrl = (await git.remote(['get-url', 'origin']))?.trim();
    } catch {
      // No remote configured
    }

    const branchInfo = await git.branch();
    const defaultBranch = branchInfo.current;

    return {
      id: hashWorkspace('git_repo', gitRoot),
      type: 'git_repo',
      path: gitRoot,
      name: path.basename(gitRoot),
      metadata: {
        remote_url: remoteUrl,
        default_branch: defaultBranch,
      },
    };
  } catch {
    // Not a git repo — fall back to folder
    return {
      id: hashWorkspace('folder', dir),
      type: 'folder',
      path: dir,
      name: path.basename(dir),
    };
  }
}
