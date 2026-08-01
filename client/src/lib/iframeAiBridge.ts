import { complete, streamGenerate, type AiMessage } from './aiClient';

type IframeRequestType =
  | 'claude-complete-request'
  | 'llm-complete-request'
  | 'claude-stream-request'
  | 'llm-stream-request';

interface IframeAiRequest {
  type: IframeRequestType;
  requestId: string;
  prompt?: unknown;
  messages?: unknown;
  options?: { model?: unknown };
}

function isIframeAiRequest(value: unknown): value is IframeAiRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const type = Reflect.get(value, 'type');
  const requestId = Reflect.get(value, 'requestId');
  return (
    (type === 'claude-complete-request' || type === 'llm-complete-request' || type === 'claude-stream-request' || type === 'llm-stream-request')
    && typeof requestId === 'string'
  );
}

function toMessages(request: IframeAiRequest): AiMessage[] {
  if (request.type.startsWith('claude-')) {
    if (typeof request.prompt !== 'string' || !request.prompt.trim()) {
      throw new Error('prompt is required.');
    }
    return [{ role: 'user', content: request.prompt }];
  }
  if (!Array.isArray(request.messages)) {
    throw new Error('messages is required.');
  }
  const messages = request.messages.flatMap((candidate): AiMessage[] => {
    if (typeof candidate !== 'object' || candidate === null) {
      return [];
    }
    const role = Reflect.get(candidate, 'role');
    const content = Reflect.get(candidate, 'content');
    return (role === 'system' || role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()
      ? [{ role, content }]
      : [];
  });
  if (messages.length === 0) {
    throw new Error('messages is invalid.');
  }
  return messages;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The AI request failed.';
}

export async function respondToIframeAiRequest(
  data: unknown,
  send: (payload: Record<string, unknown>) => void,
): Promise<boolean> {
  if (!isIframeAiRequest(data)) {
    return false;
  }
  const responseType = data.type.replace('-request', '-response');
  const model = typeof data.options?.model === 'string' ? data.options.model : undefined;
  try {
    const messages = toMessages(data);
    if (data.type.endsWith('complete-request')) {
      send({ type: responseType, requestId: data.requestId, result: await complete({ messages, model }) });
      return true;
    }
    await streamGenerate({ messages, model }, {
      onDelta: (chunk) => send({ type: responseType, requestId: data.requestId, chunk }),
    });
    send({ type: responseType, requestId: data.requestId, done: true });
  } catch (error) {
    send({ type: responseType, requestId: data.requestId, error: errorMessage(error) });
  }
  return true;
}
