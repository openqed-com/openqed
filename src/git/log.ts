import { simpleGit } from 'simple-git';

export async function getLastCommitTime(
  repoPath: string,
): Promise<Date | null> {
  try {
    const git = simpleGit(repoPath);
    const result = await git.raw(['log', '-1', '--format=%cI']);
    const trimmed = result.trim();
    if (!trimmed) return null;
    return new Date(trimmed);
  } catch {
    return null;
  }
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  try {
    const git = simpleGit(repoPath);
    const result = await git.raw(['branch', '--show-current']);
    return result.trim() || 'HEAD';
  } catch {
    return 'HEAD';
  }
}
