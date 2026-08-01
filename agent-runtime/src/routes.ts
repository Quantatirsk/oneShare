import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ModelCatalog } from './model-catalog.js';
import { ModelCatalogUnavailableError } from './model-catalog.js';
import {
  ConversationBusyError,
  ConversationNotFoundError,
  InvalidConversationRunError,
  type PiConversationModule,
  RequestAbortedError,
} from './pi-conversation-module.js';
import { ModelNotAvailableError, type GenerationMessage } from './pi-provider.js';
import { startHeartbeat, startSse, writeSseEvent } from './sse.js';

interface CreateConversationBody { model?: unknown; messages?: unknown }
interface RunBody { runId?: unknown; kind?: unknown; content?: unknown }
interface RouteDependencies {
  catalog: ModelCatalog;
  conversations: PiConversationModule;
  acquire: () => (() => void) | undefined;
}
interface ApiFailure { code: string; message: string; retryable: boolean }

class ApiRouteError extends Error {
  public constructor(public readonly statusCode: number, public readonly failure: ApiFailure) {
    super(failure.message);
  }
}

function parseMessages(body: CreateConversationBody): { model: string; messages: GenerationMessage[] } {
  if (typeof body.model !== 'string' || !body.model.trim()) {
    throw new ApiRouteError(400, { code: 'INVALID_REQUEST', message: 'model is required.', retryable: false });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new ApiRouteError(400, { code: 'INVALID_REQUEST', message: 'messages must be a non-empty array.', retryable: false });
  }
  const messages = body.messages.map((candidate): GenerationMessage => {
    if (typeof candidate !== 'object' || candidate === null) {
      throw new ApiRouteError(400, { code: 'INVALID_REQUEST', message: 'message must be an object.', retryable: false });
    }
    const role = Reflect.get(candidate, 'role');
    const content = Reflect.get(candidate, 'content');
    if ((role !== 'system' && role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {
      throw new ApiRouteError(400, { code: 'INVALID_REQUEST', message: 'message role or content is invalid.', retryable: false });
    }
    return { role, content };
  });
  if (messages.at(-1)?.role !== 'user') {
    throw new ApiRouteError(400, { code: 'INVALID_REQUEST', message: 'the final message must have the user role.', retryable: false });
  }
  return { model: body.model.trim(), messages };
}

function parseRun(body: RunBody): { runId: string; kind: 'initial' | 'user'; content?: string } {
  if (typeof body.runId !== 'string' || !body.runId.trim()) {
    throw new ApiRouteError(400, { code: 'INVALID_REQUEST', message: 'runId is required.', retryable: false });
  }
  if (body.kind !== 'initial' && body.kind !== 'user') {
    throw new ApiRouteError(400, { code: 'INVALID_REQUEST', message: 'run kind is invalid.', retryable: false });
  }
  if (body.kind === 'user' && (typeof body.content !== 'string' || !body.content.trim())) {
    throw new ApiRouteError(400, { code: 'INVALID_REQUEST', message: 'a user run needs content.', retryable: false });
  }
  return { runId: body.runId.trim(), kind: body.kind, content: typeof body.content === 'string' ? body.content : undefined };
}

function mapFailure(error: unknown): ApiRouteError {
  if (error instanceof ApiRouteError) return error;
  if (error instanceof ModelNotAvailableError) return new ApiRouteError(400, { code: 'MODEL_NOT_AVAILABLE', message: error.message, retryable: false });
  if (error instanceof ModelCatalogUnavailableError) return new ApiRouteError(503, { code: 'MODEL_CATALOG_UNAVAILABLE', message: error.message, retryable: true });
  if (error instanceof ConversationNotFoundError) return new ApiRouteError(404, { code: 'CONVERSATION_NOT_FOUND', message: error.message, retryable: false });
  if (error instanceof ConversationBusyError) return new ApiRouteError(409, { code: 'CONVERSATION_BUSY', message: error.message, retryable: true });
  if (error instanceof InvalidConversationRunError) return new ApiRouteError(409, { code: 'INVALID_RUN', message: error.message, retryable: false });
  return new ApiRouteError(502, { code: 'UPSTREAM_FAILURE', message: 'The AI provider request failed.', retryable: true });
}

function sendFailure(reply: FastifyReply, error: unknown, requestId = crypto.randomUUID()): FastifyReply {
  const mapped = mapFailure(error);
  return reply.code(mapped.statusCode).send({ ...mapped.failure, requestId });
}

export async function registerRoutes(app: FastifyInstance, dependencies: RouteDependencies): Promise<void> {
  app.get('/healthz', async (_request, reply) => {
    try {
      const snapshot = dependencies.catalog.getSnapshot();
      return reply.send({ ok: true, catalogVersion: snapshot.version, stale: snapshot.stale });
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  app.get('/api/ai/models', async (_request, reply) => {
    try {
      dependencies.catalog.refreshIfStale();
      const snapshot = dependencies.catalog.getSnapshot();
      return reply.send({ data: { models: snapshot.models, defaultModel: snapshot.defaultModel, catalogVersion: snapshot.version, refreshedAt: snapshot.refreshedAt, stale: snapshot.stale } });
    } catch (error) {
      return sendFailure(reply, error);
    }
  });

  app.post<{ Body: CreateConversationBody }>('/api/ai/conversations', async (request, reply) => {
    try {
      const input = parseMessages(request.body ?? {});
      dependencies.catalog.refreshIfStale();
      const conversation = await dependencies.conversations.create(input);
      return reply.code(201).send({ data: conversation });
    } catch (error) {
      return sendFailure(reply, error);
    }
  });

  app.post<{ Params: { conversationId: string }; Body: RunBody }>('/api/ai/conversations/:conversationId/runs', async (request, reply) => {
    let input: { runId: string; kind: 'initial' | 'user'; content?: string };
    try {
      input = parseRun(request.body ?? {});
    } catch (error) {
      return sendFailure(reply, error);
    }
    const release = dependencies.acquire();
    if (!release) {
      return reply.code(429).header('Retry-After', '1').send({ code: 'RUNTIME_BUSY', message: 'The AI runtime is busy. Please retry shortly.', retryable: true, requestId: crypto.randomUUID() });
    }
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    reply.hijack();
    startSse(reply.raw);
    reply.raw.once('close', abort);
    const stopHeartbeat = startHeartbeat(reply.raw);
    try {
      for await (const event of dependencies.conversations.run({ conversationId: request.params.conversationId, ...input }, abortController.signal)) {
        writeSseEvent(reply.raw, event.type, { ...event, conversationId: request.params.conversationId, runId: input.runId });
      }
    } catch (error) {
      if (error instanceof RequestAbortedError || abortController.signal.aborted) {
        writeSseEvent(reply.raw, 'aborted', { conversationId: request.params.conversationId, runId: input.runId });
      } else {
        writeSseEvent(reply.raw, 'failed', { ...mapFailure(error).failure, conversationId: request.params.conversationId, runId: input.runId });
      }
    } finally {
      stopHeartbeat();
      reply.raw.removeListener('close', abort);
      release();
      if (!reply.raw.writableEnded) reply.raw.end();
    }
    return reply;
  });

  app.delete<{ Params: { conversationId: string; runId: string } }>('/api/ai/conversations/:conversationId/runs/:runId', async (request, reply) => {
    try {
      await dependencies.conversations.abort(request.params.conversationId, request.params.runId);
      return reply.code(202).send({ ok: true });
    } catch (error) {
      return sendFailure(reply, error);
    }
  });

  app.delete<{ Params: { conversationId: string } }>('/api/ai/conversations/:conversationId', async (request, reply) => {
    await dependencies.conversations.release(request.params.conversationId);
    return reply.code(204).send();
  });
}
