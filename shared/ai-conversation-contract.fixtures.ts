import type { AiRunEvent } from './ai-conversation-contract.ts';

export const aiRunEventFixtures: readonly AiRunEvent[] = [
  { type: 'thinking', conversationId: 'conversation-1', runId: 'run-1', text: 'Planning the response.' },
  { type: 'delta', conversationId: 'conversation-1', runId: 'run-1', text: '<main />' },
  {
    type: 'completed',
    conversationId: 'conversation-1',
    runId: 'run-1',
    usage: { input: 3, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 8 },
    durationMs: 42,
  },
  { type: 'aborted', conversationId: 'conversation-1', runId: 'run-1' },
  {
    type: 'failed',
    conversationId: 'conversation-1',
    runId: 'run-1',
    code: 'UPSTREAM_FAILURE',
    message: 'The AI provider request failed.',
    retryable: true,
    requestId: 'request-1',
  },
];
