export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiModel { id: string; name: string }
export interface AiModelCatalog {
  models: AiModel[];
  defaultModel: string;
  catalogVersion: number;
  refreshedAt: string;
  stale: boolean;
}
export interface GenerateRequest { messages: AiMessage[]; model?: string }
export interface GenerateStreamHandlers {
  onThinkingDelta?: (text: string) => void;
  onDelta: (text: string) => void;
  onCompleted?: () => void;
}
export interface AiConversation { conversationId: string; model: string }

interface FailurePayload { code?: string; message?: string; retryable?: boolean; requestId?: string }
interface ParsedSseEvent { type: string; data: unknown }
const MODEL_CATALOG_TIMEOUT_MS = 10_000;
let catalogCache: AiModelCatalog | undefined;
let catalogPromise: Promise<AiModelCatalog> | undefined;

export class AiRequestError extends Error {
  public constructor(message: string, public readonly code: string, public readonly retryable: boolean, public readonly requestId?: string) {
    super(message);
  }
}

export function isAiRequestAborted(error: unknown): boolean {
  return (error instanceof Error && error.name === 'AbortError') || (error instanceof AiRequestError && error.code === 'AI_REQUEST_ABORTED');
}

function failureFromPayload(payload: FailurePayload, fallback: string): AiRequestError {
  return new AiRequestError(payload.message || fallback, payload.code || 'AI_REQUEST_FAILED', payload.retryable ?? false, payload.requestId);
}

async function readFailure(response: Response, fallback: string): Promise<AiRequestError> {
  try { return failureFromPayload(await response.json() as FailurePayload, fallback); }
  catch { return new AiRequestError(`${fallback} (HTTP ${response.status})`, 'AI_REQUEST_FAILED', response.status >= 500); }
}

function newRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseSseEvent(frame: string): ParsedSseEvent | undefined {
  const lines = frame.split(/\r?\n/);
  let type = 'message';
  const data: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '');
    if (field === 'event') type = value;
    else if (field === 'data') data.push(value);
  }
  if (!data.length) return undefined;
  try { return { type, data: JSON.parse(data.join('\n')) }; }
  catch { throw new AiRequestError('The AI stream contained invalid JSON.', 'INVALID_STREAM_EVENT', false); }
}

function eventText(data: unknown): string | undefined {
  const text = typeof data === 'object' && data !== null ? Reflect.get(data, 'text') : undefined;
  return typeof text === 'string' && text ? text : undefined;
}

export async function fetchAiModelCatalog(refresh = false): Promise<AiModelCatalog> {
  if (!refresh && catalogCache) return catalogCache;
  if (!refresh && catalogPromise) return catalogPromise;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MODEL_CATALOG_TIMEOUT_MS);
  const request = fetch('/api/ai/models', { signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw await readFailure(response, 'Unable to load AI models.');
      const catalog = (await response.json() as { data?: AiModelCatalog }).data;
      if (!catalog || !Array.isArray(catalog.models) || !catalog.defaultModel) {
        throw new AiRequestError('The AI model catalog is invalid.', 'INVALID_MODEL_CATALOG', false);
      }
      catalogCache = catalog;
      return catalog;
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) throw new AiRequestError('Loading AI models timed out. Please retry.', 'MODEL_CATALOG_TIMEOUT', true);
      throw error;
    })
    .finally(() => { clearTimeout(timeoutId); catalogPromise = undefined; });
  if (!refresh) catalogPromise = request;
  return request;
}

export async function getDefaultAiModel(): Promise<string> { return (await fetchAiModelCatalog()).defaultModel; }

export async function createAiConversation(request: GenerateRequest, signal?: AbortSignal): Promise<AiConversation> {
  const model = request.model || await getDefaultAiModel();
  const response = await fetch('/api/ai/conversations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ model, messages: request.messages }),
  });
  if (!response.ok) throw await readFailure(response, 'The AI conversation could not be created.');
  const conversation = (await response.json() as { data?: AiConversation }).data;
  if (!conversation?.conversationId || !conversation.model) {
    throw new AiRequestError('The AI conversation response is invalid.', 'INVALID_CONVERSATION_RESPONSE', true);
  }
  return conversation;
}

export async function releaseAiConversation(conversationId: string): Promise<void> {
  await fetch(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
}

export async function streamAiConversationRun(
  conversationId: string,
  input: { kind: 'initial' | 'user'; content?: string; runId?: string },
  handlers: GenerateStreamHandlers,
  signal?: AbortSignal,
): Promise<string> {
  const runId = input.runId || newRunId();
  const response = await fetch(`/api/ai/conversations/${encodeURIComponent(conversationId)}/runs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ ...input, runId }),
  });
  if (!response.ok) throw await readFailure(response, 'The AI run could not be started.');
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new AiRequestError('The AI server did not return an event stream.', 'INVALID_STREAM_RESPONSE', true);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AiRequestError('The AI response has no readable stream.', 'INVALID_STREAM_RESPONSE', true);
  const decoder = new TextDecoder();
  let buffer = '';
  let terminal = false;
  const handleFrame = (frame: string): void => {
    const event = parseSseEvent(frame);
    if (!event || terminal) return;
    if (event.type === 'thinking') { const text = eventText(event.data); if (text) handlers.onThinkingDelta?.(text); return; }
    if (event.type === 'delta') { const text = eventText(event.data); if (text) handlers.onDelta(text); return; }
    if (event.type === 'completed') { terminal = true; handlers.onCompleted?.(); return; }
    if (event.type === 'aborted') {
      terminal = true;
      throw new AiRequestError('The AI run was stopped.', 'AI_REQUEST_ABORTED', false);
    }
    if (event.type === 'failed') { terminal = true; throw failureFromPayload(typeof event.data === 'object' && event.data ? event.data as FailurePayload : {}, 'The AI provider failed.'); }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      for (const frame of frames) handleFrame(frame);
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleFrame(buffer);
    if (!terminal) throw new AiRequestError('The AI stream ended before completion.', 'STREAM_ENDED_EARLY', true);
    return runId;
  } catch (error) {
    if (signal?.aborted) void fetch(`/api/ai/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
    throw error;
  }
}

export async function streamGenerate(request: GenerateRequest, handlers: GenerateStreamHandlers, signal?: AbortSignal): Promise<void> {
  const conversation = await createAiConversation(request, signal);
  try {
    await streamAiConversationRun(conversation.conversationId, { kind: 'initial' }, handlers, signal);
  } finally {
    void releaseAiConversation(conversation.conversationId);
  }
}

export async function complete(request: GenerateRequest, signal?: AbortSignal): Promise<string> {
  let result = '';
  await streamGenerate(request, { onDelta: (text) => { result += text; } }, signal);
  return result;
}

export function generateText(messages: AiMessage[], model?: string, signal?: AbortSignal): Promise<string> { return complete({ messages, model }, signal); }
export async function streamText(messages: AiMessage[], onDelta: (text: string) => void, onCompleted?: () => void, onError?: (message: string) => void, model?: string, signal?: AbortSignal): Promise<void> {
  try { await streamGenerate({ messages, model }, { onDelta, onCompleted }, signal); }
  catch (error) { onError?.(error instanceof Error ? error.message : 'The AI request failed.'); }
}
