import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeAiRunSseEvent } from '../../client/src/lib/aiClient.ts';
import { aiRunEventFixtures } from '../../shared/ai-conversation-contract.fixtures.ts';

test('the browser decoder consumes the shared conversation fixtures', () => {
  for (const fixture of aiRunEventFixtures) {
    const frame = `event: ${fixture.type}\ndata: ${JSON.stringify(fixture)}\n\n`;
    assert.deepEqual(decodeAiRunSseEvent(frame), fixture);
  }
});
