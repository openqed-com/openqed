export type WorkspaceType = 'git_repo' | 'folder' | 'url_scope';

export interface Workspace {
  id: string;
  type: WorkspaceType;
  path: string;
  name?: string;
  metadata?: Record<string, unknown>;
}
