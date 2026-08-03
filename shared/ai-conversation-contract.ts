export const AI_RUN_KINDS = ['initial', 'user'] as const;
export type AiRunKind = (typeof AI_RUN_KINDS)[number];

export interface AiConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiConversationCreateRequest {
  model: string;
  messages: AiConversationMessage[];
}

export interface AiConversationRunRequest {
  runId: string;
  kind: AiRunKind;
  content?: string;
}

export interface AiUsageSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}

export interface AiRunFailure {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
}

interface AiRunEventBase {
  conversationId: string;
  runId: string;
}

export type AiRunEvent =
  | (AiRunEventBase & { type: 'thinking' | 'delta'; text: string })
  | (AiRunEventBase & { type: 'completed'; usage: AiUsageSummary; durationMs: number })
  | (AiRunEventBase & { type: 'aborted' })
  | (AiRunEventBase & { type: 'failed' } & AiRunFailure);

export type AiRunEventType = AiRunEvent['type'];

export function isAiRunKind(value: unknown): value is AiRunKind {
  return typeof value === 'string' && (AI_RUN_KINDS as readonly string[]).includes(value);
}

export function isAiRunTerminalEvent(event: AiRunEvent): boolean {
  return event.type === 'completed' || event.type === 'aborted' || event.type === 'failed';
}

export function parseAiRunEvent(type: string, payload: unknown): AiRunEvent | undefined {
  if (!isRecord(payload) || !hasRunIdentity(payload)) return undefined;
  const base = { conversationId: payload.conversationId, runId: payload.runId };

  if ((type === 'thinking' || type === 'delta') && typeof payload.text === 'string') {
    return { type, ...base, text: payload.text };
  }
  if (type === 'completed' && isUsageSummary(payload.usage) && isFiniteNumber(payload.durationMs)) {
    return { type, ...base, usage: payload.usage, durationMs: payload.durationMs };
  }
  if (type === 'aborted') return { type, ...base };
  if (type === 'failed' && isFailure(payload)) {
    return {
      type,
      ...base,
      code: payload.code,
      message: payload.message,
      retryable: payload.retryable,
      ...(typeof payload.requestId === 'string' ? { requestId: payload.requestId } : {}),
    };
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasRunIdentity(value: Record<string, unknown>): value is Record<string, unknown> & AiRunEventBase {
  return typeof value.conversationId === 'string'
    && value.conversationId.length > 0
    && typeof value.runId === 'string'
    && value.runId.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isUsageSummary(value: unknown): value is AiUsageSummary {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.input)
    && isFiniteNumber(value.output)
    && isFiniteNumber(value.cacheRead)
    && isFiniteNumber(value.cacheWrite)
    && isFiniteNumber(value.totalTokens);
}

function isFailure(value: Record<string, unknown>): value is Record<string, unknown> & AiRunFailure {
  return typeof value.code === 'string'
    && value.code.length > 0
    && typeof value.message === 'string'
    && value.message.length > 0
    && typeof value.retryable === 'boolean';
}
