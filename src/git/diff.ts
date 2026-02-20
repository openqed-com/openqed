import { simpleGit } from 'simple-git';

export async function getStagedFiles(repoPath: string): Promise<string[]> {
  const git = simpleGit(repoPath);
  const result = await git.raw(['diff', '--cached', '--name-only']);
  return result
    .split('\n')
    .map((f: string) => f.trim())
    .filter(Boolean);
}

export async function getStagedDiffStat(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  return (await git.raw(['diff', '--cached', '--stat'])).trim();
}

export async function getStagedDiff(
  repoPath: string,
  maxLength = 8000,
): Promise<string> {
  const git = simpleGit(repoPath);
  const diff = await git.raw(['diff', '--cached']);
  if (diff.length > maxLength) {
    return diff.slice(0, maxLength) + '\n[...diff truncated...]';
  }
  return diff;
}
