import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './config.js';

test('loads PI_MAX_TOKENS', () => {
  const config = loadConfig({
    PI_PROVIDER_BASE_URL: 'https://example.test/v1',
    PI_PROVIDER_API_KEY: 'test-key',
    PI_DEFAULT_MODEL: 'test-model',
    PI_MAX_TOKENS: '32648',
  });

  assert.equal(config.maxTokens, 32_648);
});
