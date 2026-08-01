import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { PiRuntimeConfig } from './config.js';
import { PiConversationModule } from './pi-conversation-module.js';

const config: PiRuntimeConfig = {
  host: '127.0.0.1', port: 8001, providerId: 'test-provider', providerBaseUrl: 'https://example.test/v1', providerApiKey: 'test-key',
  defaultModel: 'model-a', temperature: 0.6, requestTimeoutMs: 1_000, maxRetries: 0, maxConcurrency: 1,
  modelCatalogTtlMs: 60_000, modelCatalogRefreshTimeoutMs: 1_000, sessionTtlMs: 60_000, maxActiveSessions: 4, workDir: process.cwd(),
};

test('one conversation reuses its Pi session for the initial run and follow-up', async () => {
  const prompts: string[] = [];
  const listeners = new Set<(event: any) => void>();
  const session = {
    subscribe(listener: (event: any) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async prompt(prompt: string) {
      prompts.push(prompt);
      for (const listener of listeners) listener({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: `${prompt}!` } });
      for (const listener of listeners) listener({ type: 'message_end', message: { role: 'assistant', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 } } });
    },
    async abort() {},
    dispose() {},
  } as unknown as AgentSession;
  let sessionsCreated = 0;
  const catalog = { getSnapshot: () => ({ models: [{ id: 'model-a', name: 'Model A' }] }) } as any;
  const conversations = new PiConversationModule(config, catalog, async () => {
    sessionsCreated += 1;
    return { session, prompt: 'initial prompt' };
  });

  const { conversationId } = await conversations.create({ model: 'model-a', messages: [{ role: 'user', content: 'hello' }] });
  const initial = await collect(conversations.run({ conversationId, runId: 'run-1', kind: 'initial' }, new AbortController().signal));
  const followUp = await collect(conversations.run({ conversationId, runId: 'run-2', kind: 'user', content: 'fix it' }, new AbortController().signal));

  assert.equal(sessionsCreated, 1);
  assert.equal(initial.at(-1)?.type, 'completed');
  assert.equal(followUp.at(-1)?.type, 'completed');
  assert.deepEqual(prompts, ['initial prompt', 'fix it']);
});

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const event of events) values.push(event);
  return values;
}
