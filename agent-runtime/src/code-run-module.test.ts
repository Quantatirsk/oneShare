import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CodeRunModule,
  type CodeRunEvent,
  type ConversationAdapter,
  type RenderAdapter,
} from '../../client/src/lib/code-run/CodeRunModule.ts';
import type { AiConversationRunRequest, AiRunEvent } from '../../shared/ai-conversation-contract.ts';

const successfulUsage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 };

function createAdapter(eventsFor: (request: AiConversationRunRequest) => AsyncIterable<AiRunEvent>): ConversationAdapter {
  return {
    create: async () => ({ conversationId: 'conversation-1', model: 'model-a' }),
    run: (_conversationId, request) => eventsFor(request),
    release: async () => undefined,
  };
}

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const event of events) values.push(event);
  return values;
}

test('code runs expose ordered events and ignore mismatched conversation frames', async () => {
  const renderer: RenderAdapter = { validate: async () => ({ ok: true }) };
  const adapter = createAdapter(async function* (request) {
    yield { type: 'delta', conversationId: 'other-conversation', runId: request.runId, text: 'late' };
    yield { type: 'delta', conversationId: 'conversation-1', runId: 'superseded-run', text: 'late' };
    yield { type: 'thinking', conversationId: 'conversation-1', runId: request.runId, text: 'plan' };
    yield { type: 'delta', conversationId: 'conversation-1', runId: request.runId, text: '<main>ready</main>' };
    yield { type: 'completed', conversationId: 'conversation-1', runId: request.runId, usage: successfulUsage, durationMs: 1 };
  });
  const codeRun = new CodeRunModule(renderer, adapter);

  const events = await collect(codeRun.start({ model: 'model-a', language: 'html', prompt: 'build' }, new AbortController().signal));

  assert.deepEqual(events.map((event) => event.type), ['code_started', 'thinking', 'code_delta', 'validating', 'ready']);
  assert.equal(events.filter((event) => event.type === 'code_delta').length, 1);
  assert.equal((events.at(-1) as Extract<CodeRunEvent, { type: 'ready' }>).code, '<main>ready</main>');
});

test('a first repair can succeed in the same conversation', async () => {
  const requests: AiConversationRunRequest[] = [];
  const outcomes = [
    { ok: false as const, failure: { kind: 'source' as const, message: 'first failure' } },
    { ok: true as const },
  ];
  const adapter = createAdapter(async function* (request) {
    requests.push(request);
    yield { type: 'delta', conversationId: 'conversation-1', runId: request.runId, text: `<main>${requests.length}</main>` };
    yield { type: 'completed', conversationId: 'conversation-1', runId: request.runId, usage: successfulUsage, durationMs: 1 };
  });
  const codeRun = new CodeRunModule({ validate: async () => outcomes.shift()! }, adapter);

  const events = await collect(codeRun.start({ model: 'model-a', language: 'html', prompt: 'build' }, new AbortController().signal));

  assert.deepEqual(requests.map((request) => request.kind), ['initial', 'user']);
  assert.deepEqual(events.filter((event) => event.type === 'repairing').map((event) => (event as Extract<CodeRunEvent, { type: 'repairing' }>).attempt), [1]);
  assert.equal(events.at(-1)?.type, 'ready');
});

test('code runs own the two-repair limit and expose exhaustion', async () => {
  const requests: AiConversationRunRequest[] = [];
  const failures = [
    { ok: false as const, failure: { kind: 'source' as const, message: 'first failure' } },
    { ok: false as const, failure: { kind: 'source' as const, message: 'second failure' } },
    { ok: false as const, failure: { kind: 'source' as const, message: 'third failure' } },
  ];
  const renderer: RenderAdapter = { validate: async () => failures.shift()! };
  const adapter = createAdapter(async function* (request) {
    requests.push(request);
    yield { type: 'delta', conversationId: 'conversation-1', runId: request.runId, text: `<main>${requests.length}</main>` };
    yield { type: 'completed', conversationId: 'conversation-1', runId: request.runId, usage: successfulUsage, durationMs: 1 };
  });
  const codeRun = new CodeRunModule(renderer, adapter);

  const events = await collect(codeRun.start({ model: 'model-a', language: 'html', prompt: 'build' }, new AbortController().signal));

  assert.deepEqual(requests.map((request) => request.kind), ['initial', 'user', 'user']);
  assert.deepEqual(events.filter((event) => event.type === 'repairing').map((event) => (event as Extract<CodeRunEvent, { type: 'repairing' }>).attempt), [1, 2]);
  assert.equal(events.at(-1)?.type, 'exhausted');
});

test('an aborted run does not validate or start a repair', async () => {
  let validated = 0;
  const renderer: RenderAdapter = { validate: async () => { validated += 1; return { ok: true }; } };
  const adapter = createAdapter(async function* (request) {
    yield { type: 'aborted', conversationId: 'conversation-1', runId: request.runId };
  });
  const codeRun = new CodeRunModule(renderer, adapter);

  const events = await collect(codeRun.start({ model: 'model-a', language: 'html', prompt: 'build' }, new AbortController().signal));

  assert.deepEqual(events.map((event) => event.type), ['code_started', 'aborted']);
  assert.equal(validated, 0);
});

test('a reset after cancellation does not start another run', async () => {
  let startedRuns = 0;
  const adapter = createAdapter(async function* () {
    startedRuns += 1;
    yield { type: 'completed', conversationId: 'conversation-1', runId: 'unreachable', usage: successfulUsage, durationMs: 1 };
  });
  const codeRun = new CodeRunModule({ validate: async () => ({ ok: true }) }, adapter);
  const controller = new AbortController();
  const events = codeRun.start({ model: 'model-a', language: 'html', prompt: 'build' }, controller.signal);

  assert.equal((await events.next()).value?.type, 'code_started');
  controller.abort();
  await codeRun.reset();

  assert.equal((await events.next()).value?.type, 'aborted');
  assert.equal(startedRuns, 0);
});

test('cancellation while validating emits aborted without a repair', async () => {
  let repairRequests = 0;
  const adapter = createAdapter(async function* (request) {
    repairRequests += 1;
    yield { type: 'delta', conversationId: 'conversation-1', runId: request.runId, text: '<main>ready</main>' };
    yield { type: 'completed', conversationId: 'conversation-1', runId: request.runId, usage: successfulUsage, durationMs: 1 };
  });
  const controller = new AbortController();
  const codeRun = new CodeRunModule({ validate: async () => ({ ok: true }) }, adapter);
  const events = codeRun.start({ model: 'model-a', language: 'html', prompt: 'build' }, controller.signal);

  await events.next();
  await events.next();
  assert.equal((await events.next()).value?.type, 'validating');
  controller.abort();

  assert.equal((await events.next()).value?.type, 'aborted');
  assert.equal(repairRequests, 1);
});

test('cancellation after a repair notice does not start the repair run', async () => {
  const requests: AiConversationRunRequest[] = [];
  const adapter = createAdapter(async function* (request) {
    requests.push(request);
    yield { type: 'delta', conversationId: 'conversation-1', runId: request.runId, text: '<main>broken</main>' };
    yield { type: 'completed', conversationId: 'conversation-1', runId: request.runId, usage: successfulUsage, durationMs: 1 };
  });
  const controller = new AbortController();
  const codeRun = new CodeRunModule({ validate: async () => ({ ok: false, failure: { kind: 'source', message: 'broken' } }) }, adapter);
  const events = codeRun.start({ model: 'model-a', language: 'html', prompt: 'build' }, controller.signal);

  await events.next();
  await events.next();
  await events.next();
  assert.equal((await events.next()).value?.type, 'repairing');
  controller.abort();

  assert.equal((await events.next()).value?.type, 'aborted');
  assert.deepEqual(requests.map((request) => request.kind), ['initial']);
});

test('an infrastructure validation failure ends the event stream without a repair', async () => {
  const requests: AiConversationRunRequest[] = [];
  const renderer: RenderAdapter = {
    validate: async () => ({ ok: false, failure: { kind: 'infrastructure', message: 'preview unavailable' } }),
  };
  const adapter = createAdapter(async function* (request) {
    requests.push(request);
    yield { type: 'delta', conversationId: 'conversation-1', runId: request.runId, text: '<main>ready</main>' };
    yield { type: 'completed', conversationId: 'conversation-1', runId: request.runId, usage: successfulUsage, durationMs: 1 };
  });
  const codeRun = new CodeRunModule(renderer, adapter);

  const events = await collect(codeRun.start({ model: 'model-a', language: 'html', prompt: 'build' }, new AbortController().signal));

  assert.deepEqual(requests.map((request) => request.kind), ['initial']);
  assert.equal(events.at(-1)?.type, 'failed');
});
