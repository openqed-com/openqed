export type LLMProvider = 'claude-code' | 'none';

export interface CommitMessageResult {
  message: string;
  source: 'llm' | 'offline';
}
