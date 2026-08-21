import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelCatalog, ModelCatalogUnavailableError } from './model-catalog.js';
import type { PiRuntimeConfig } from './config.js';

const config: PiRuntimeConfig = {
  host: '127.0.0.1',
  port: 8001,
  providerId: 'test-provider',
  providerBaseUrl: 'https://example.test/v1',
  providerApiKey: 'test-key',
  defaultModel: 'model-b',
  temperature: 0.6,
  maxTokens: 0,
  requestTimeoutMs: 1_000,
  maxRetries: 1,
  maxConcurrency: 1,
  modelCatalogTtlMs: 100,
  modelCatalogRefreshTimeoutMs: 1_000,
  sessionTtlMs: 60_000,
  maxActiveSessions: 4,
  workDir: process.cwd(),
};

test('catalog normalizes the upstream model response and enforces the configured default', async () => {
  const catalog = new ModelCatalog(config, {
    fetch: async (url, options) => {
      assert.equal(url, 'https://example.test/v1/models');
      assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer test-key');
      return new Response(JSON.stringify({
        data: [{ id: 'model-b' }, { id: 'model-a', name: 'Model A' }, { id: 'model-b' }, {}],
      }));
    },
  });

  await catalog.start();

  assert.deepEqual(catalog.getSnapshot().models, [
    { id: 'model-a', name: 'Model A' },
    { id: 'model-b', name: 'model-b' },
  ]);
  assert.equal(catalog.getSnapshot().defaultModel, 'model-b');
});

test('a failed refresh retains the last successful catalog as stale', async () => {
  let call = 0;
  const catalog = new ModelCatalog(config, {
    fetch: async () => {
      call += 1;
      return call === 1
        ? new Response(JSON.stringify({ data: [{ id: 'model-b' }] }))
        : new Response('unavailable', { status: 503 });
    },
  });

  await catalog.start();
  await assert.rejects(catalog.refresh(), ModelCatalogUnavailableError);

  assert.equal(catalog.getSnapshot().stale, true);
  assert.deepEqual(catalog.getSnapshot().models, [{ id: 'model-b', name: 'model-b' }]);
});

test('an initial catalog failure does not prevent a later refresh from recovering', async () => {
  let call = 0;
  const catalog = new ModelCatalog(config, {
    fetch: async () => {
      call += 1;
      if (call === 1) throw new Error('This operation was aborted');
      return new Response(JSON.stringify({ data: [{ id: 'model-b' }] }));
    },
  });

  await catalog.start();
  assert.throws(() => catalog.getSnapshot(), ModelCatalogUnavailableError);

  await catalog.refresh();
  assert.deepEqual(catalog.getSnapshot().models, [{ id: 'model-b', name: 'model-b' }]);
});

test('an invalid default model remains a startup error', async () => {
  const catalog = new ModelCatalog(config, {
    fetch: async () => new Response(JSON.stringify({ data: [{ id: 'model-a' }] })),
  });

  await assert.rejects(catalog.start(), (error: unknown) => {
    assert.ok(error instanceof ModelCatalogUnavailableError);
    assert.equal(error.retryable, false);
    return true;
  });
});
