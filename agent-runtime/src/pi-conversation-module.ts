import crypto from 'node:crypto';
import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { PiRuntimeConfig } from './config.js';
import type { ModelCatalog } from './model-catalog.js';
import { createPiSession, ModelNotAvailableError, type GenerationMessage } from './pi-provider.js';

export interface ConversationInput {
  model: string;
  messages: readonly GenerationMessage[];
}

export interface ConversationRunInput {
  conversationId: string;
  runId: string;
  kind: 'initial' | 'user';
  content?: string;
}

export type PiConversationEvent =
  | { type: 'thinking'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'completed'; usage: UsageSummary; durationMs: number };

export interface UsageSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}

export class ConversationNotFoundError extends Error {}
export class ConversationBusyError extends Error {}
export class InvalidConversationRunError extends Error {}
export class RequestAbortedError extends Error {}

interface StoredConversation {
  session: AgentSession;
  initialPrompt: string;
  hasStarted: boolean;
  activeRunId?: string;
  lastUsedAt: number;
}

class AsyncEventQueue<T> {
  private readonly values: T[] = [];
  private resolveNext?: (result: IteratorResult<T>) => void;
  private failure?: unknown;
  private closed = false;

  public push(value: T): void {
    if (this.closed) return;
    const resolve = this.resolveNext;
    this.resolveNext = undefined;
    if (resolve) resolve({ value, done: false });
    else this.values.push(value);
  }

  public close(): void {
    this.closed = true;
    this.resolveNext?.({ value: undefined as T, done: true });
    this.resolveNext = undefined;
  }

  public fail(error: unknown): void {
    this.failure = error;
    this.close();
  }

  public async next(): Promise<IteratorResult<T>> {
    if (this.values.length) return { value: this.values.shift()!, done: false };
    if (this.failure) throw this.failure;
    if (this.closed) return { value: undefined as T, done: true };
    return new Promise((resolve) => { this.resolveNext = resolve; });
  }
}

function usageFrom(event: AgentSessionEvent): UsageSummary | undefined {
  if (event.type !== 'message_end' || event.message.role !== 'assistant') return undefined;
  return {
    input: event.message.usage.input,
    output: event.message.usage.output,
    cacheRead: event.message.usage.cacheRead,
    cacheWrite: event.message.usage.cacheWrite,
    totalTokens: event.message.usage.totalTokens,
  };
}

export class PiConversationModule {
  private readonly conversations = new Map<string, StoredConversation>();

  public constructor(
    private readonly config: PiRuntimeConfig,
    private readonly catalog: ModelCatalog,
    private readonly sessionFactory: typeof createPiSession = createPiSession,
  ) {}

  public async create(input: ConversationInput): Promise<{ conversationId: string; model: string }> {
    await this.removeExpired();
    if (this.conversations.size >= this.config.maxActiveSessions) {
      throw new ConversationBusyError('The AI runtime has reached its active conversation limit.');
    }
    if (!this.catalog.getSnapshot().models.some((model) => model.id === input.model)) {
      throw new ModelNotAvailableError(input.model);
    }
    const conversationId = crypto.randomUUID();
    const { session, prompt } = await this.sessionFactory({
      config: this.config,
      snapshot: this.catalog.getSnapshot(),
      modelId: input.model,
      messages: input.messages,
      requestId: conversationId,
    });
    this.conversations.set(conversationId, {
      session,
      initialPrompt: prompt,
      hasStarted: false,
      lastUsedAt: Date.now(),
    });
    return { conversationId, model: input.model };
  }

  public async *run(input: ConversationRunInput, signal: AbortSignal): AsyncGenerator<PiConversationEvent> {
    const record = this.conversations.get(input.conversationId);
    if (!record) throw new ConversationNotFoundError('The AI conversation no longer exists.');
    if (record.activeRunId) throw new ConversationBusyError('The AI conversation is already running.');
    const prompt = this.resolvePrompt(record, input);
    record.activeRunId = input.runId;
    record.lastUsedAt = Date.now();
    const queue = new AsyncEventQueue<PiConversationEvent>();
    let lastUsage: UsageSummary = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
    const startedAt = performance.now();
    const unsubscribe = record.session.subscribe((event) => {
      if (event.type === 'message_update') {
        if (event.assistantMessageEvent.type === 'thinking_delta') {
          queue.push({ type: 'thinking', text: event.assistantMessageEvent.delta });
        } else if (event.assistantMessageEvent.type === 'text_delta') {
          queue.push({ type: 'delta', text: event.assistantMessageEvent.delta });
        }
      }
      const usage = usageFrom(event);
      if (usage) lastUsage = usage;
    });
    const abort = () => { void record.session.abort(); };
    signal.addEventListener('abort', abort, { once: true });
    const promptPromise = record.session.prompt(prompt).then(() => queue.close()).catch((error: unknown) => queue.fail(error));

    try {
      while (true) {
        if (signal.aborted) throw new RequestAbortedError('The generation request was aborted.');
        const next = await queue.next();
        if (next.done) break;
        yield next.value;
      }
      await promptPromise;
      if (signal.aborted) throw new RequestAbortedError('The generation request was aborted.');
      yield { type: 'completed', usage: lastUsage, durationMs: Math.round(performance.now() - startedAt) };
    } finally {
      signal.removeEventListener('abort', abort);
      unsubscribe();
      if (record.activeRunId === input.runId) {
        record.activeRunId = undefined;
        record.lastUsedAt = Date.now();
      }
    }
  }

  public async abort(conversationId: string, runId: string): Promise<void> {
    const record = this.conversations.get(conversationId);
    if (!record) throw new ConversationNotFoundError('The AI conversation no longer exists.');
    if (record.activeRunId !== runId) throw new InvalidConversationRunError('The AI run is not active.');
    await record.session.abort();
  }

  public async release(conversationId: string): Promise<void> {
    const record = this.conversations.get(conversationId);
    if (!record) return;
    this.conversations.delete(conversationId);
    await record.session.abort().catch(() => undefined);
    record.session.dispose();
  }

  public async close(): Promise<void> {
    await Promise.all([...this.conversations.keys()].map((conversationId) => this.release(conversationId)));
  }

  private resolvePrompt(record: StoredConversation, input: ConversationRunInput): string {
    if (input.kind === 'initial') {
      if (record.hasStarted) throw new InvalidConversationRunError('The initial run has already started.');
      record.hasStarted = true;
      return record.initialPrompt;
    }
    if (!record.hasStarted) throw new InvalidConversationRunError('The initial run must start first.');
    if (!input.content?.trim()) throw new InvalidConversationRunError('A follow-up message is required.');
    return input.content.trim();
  }

  private async removeExpired(): Promise<void> {
    const expiresBefore = Date.now() - this.config.sessionTtlMs;
    const expired = [...this.conversations.entries()]
      .filter(([, record]) => !record.activeRunId && record.lastUsedAt < expiresBefore)
      .map(([conversationId]) => conversationId);
    await Promise.all(expired.map((conversationId) => this.release(conversationId)));
  }
}
