import assert from 'node:assert/strict';
import test from 'node:test';
import { aiRunEventFixtures } from '../../shared/ai-conversation-contract.fixtures.ts';
import { isAiRunTerminalEvent, parseAiRunEvent } from '../../shared/ai-conversation-contract.ts';

test('shared conversation fixtures cover every valid SSE event and terminal', () => {
  for (const fixture of aiRunEventFixtures) {
    assert.deepEqual(parseAiRunEvent(fixture.type, fixture), fixture);
  }

  assert.deepEqual(
    aiRunEventFixtures.filter(isAiRunTerminalEvent).map((event) => event.type),
    ['completed', 'aborted', 'failed'],
  );
  assert.equal(parseAiRunEvent('thinking', { text: 'missing run identity' }), undefined);
  assert.equal(parseAiRunEvent('unknown', aiRunEventFixtures[0]), undefined);
});
