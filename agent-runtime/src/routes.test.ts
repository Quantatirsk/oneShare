import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { PiRuntimeConfig } from './config.js';
import { ModelCatalog } from './model-catalog.js';
import { registerRoutes } from './routes.js';

const config: PiRuntimeConfig = {
  host: '127.0.0.1', port: 8001, providerId: 'test-provider', providerBaseUrl: 'https://example.test/v1', providerApiKey: 'test-key',
  defaultModel: 'model-a', temperature: 0.6, requestTimeoutMs: 1_000, maxRetries: 0, maxConcurrency: 1,
  modelCatalogTtlMs: 60_000, modelCatalogRefreshTimeoutMs: 1_000, sessionTtlMs: 60_000, maxActiveSessions: 4, workDir: process.cwd(),
};

async function catalog(): Promise<ModelCatalog> {
  const result = new ModelCatalog(config, { fetch: async () => new Response(JSON.stringify({ data: [{ id: 'model-a', name: 'Model A' }] })) });
  await result.start();
  return result;
}

function conversations() {
  const released: string[] = [];
  return {
    released,
    create: async () => ({ conversationId: 'conversation-1', model: 'model-a' }),
    async *run() {
      yield { type: 'thinking' as const, text: 'I will answer.' };
      yield { type: 'delta' as const, text: 'hello' };
      yield { type: 'completed' as const, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 }, durationMs: 1 };
      yield { type: 'delta' as const, text: 'late event' };
    },
    abort: async () => undefined,
    release: async (conversationId: string) => { released.push(conversationId); },
  };
}

test('conversation routes expose model catalog, SSE run, cancellation, and release', async (context) => {
  const app = Fastify();
  const fake = conversations();
  await registerRoutes(app, { catalog: await catalog(), conversations: fake as any, acquire: () => () => undefined });
  context.after(() => app.close());

  const models = await app.inject({ method: 'GET', url: '/api/ai/models' });
  assert.deepEqual(models.json().data.models, [{ id: 'model-a', name: 'Model A' }]);
  const created = await app.inject({ method: 'POST', url: '/api/ai/conversations', payload: { model: 'model-a', messages: [{ role: 'user', content: 'hello' }] } });
  assert.equal(created.statusCode, 201);
  const run = await app.inject({ method: 'POST', url: '/api/ai/conversations/conversation-1/runs', payload: { runId: 'run-1', kind: 'initial' } });
  assert.equal(run.statusCode, 200);
  assert.match(run.payload, /event: thinking/);
  assert.match(run.payload, /event: delta/);
  assert.match(run.payload, /event: completed/);
  assert.match(run.payload, /"conversationId":"conversation-1"/);
  assert.match(run.payload, /"runId":"run-1"/);
  assert.equal((run.payload.match(/event: (completed|aborted|failed)/g) || []).length, 1);
  assert.doesNotMatch(run.payload, /late event/);
  const cancelled = await app.inject({ method: 'DELETE', url: '/api/ai/conversations/conversation-1/runs/run-1' });
  assert.equal(cancelled.statusCode, 202);
  const released = await app.inject({ method: 'DELETE', url: '/api/ai/conversations/conversation-1' });
  assert.equal(released.statusCode, 204);
  assert.deepEqual(fake.released, ['conversation-1']);
  const legacy = await app.inject({ method: 'POST', url: '/api/ai/generate' });
  assert.equal(legacy.statusCode, 404);
});
