import path from 'node:path';
import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import { InMemoryCredentialStore, type AssistantMessage, type Model } from '@earendil-works/pi-ai';
import { streamSimple as streamOpenAICompletions } from '@earendil-works/pi-ai/api/openai-completions';
import type { Context, SimpleStreamOptions } from '@earendil-works/pi-ai';
import type { PiRuntimeConfig } from './config.js';
import type { CatalogModel, ModelCatalogSnapshot } from './model-catalog.js';

export interface GenerationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ModelNotAvailableError extends Error {
  public constructor(model: string) {
    super(`Model is not available: ${model}`);
  }
}

function toPiModel(config: PiRuntimeConfig, source: CatalogModel): Model<'openai-completions'> {
  return {
    id: source.id,
    name: source.name,
    api: 'openai-completions',
    provider: config.providerId,
    baseUrl: config.providerBaseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    // Pi requires this capability field, but zero leaves the provider's output limit unspecified.
    maxTokens: 0,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: true,
      supportsStrictMode: false,
      maxTokensField: 'max_tokens',
    },
  };
}

function buildSystemPrompt(messages: readonly GenerationMessage[]): string {
  return messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
}

function seedHistory(
  sessionManager: SessionManager,
  messages: readonly GenerationMessage[],
): string {
  const finalMessage = messages.at(-1);
  if (!finalMessage || finalMessage.role !== 'user') {
    throw new Error('The final generation message must have the user role.');
  }

  for (const message of messages.slice(0, -1)) {
    if (message.role === 'system') {
      continue;
    }
    if (message.role === 'user') {
      sessionManager.appendMessage({
        role: 'user',
        content: message.content,
        timestamp: Date.now(),
      });
      continue;
    }
    const assistantMessage: AssistantMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: message.content }],
      api: 'openai-completions',
      provider: 'oneshare-history',
      model: 'history',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: Date.now(),
    };
    sessionManager.appendMessage(assistantMessage);
  }
  return finalMessage.content;
}

async function createModelRuntime(
  config: PiRuntimeConfig,
  snapshot: ModelCatalogSnapshot,
): Promise<ModelRuntime> {
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
  });
  modelRuntime.registerProvider(config.providerId, {
    name: config.providerId,
    api: 'openai-completions',
    baseUrl: config.providerBaseUrl,
    apiKey: config.providerApiKey,
    authHeader: true,
    streamSimple: (model, context, options) => streamOpenAICompletions(
      model as Model<'openai-completions'>,
      context as Context,
      {
        ...options,
        temperature: config.temperature,
        timeoutMs: config.requestTimeoutMs,
        maxRetries: config.maxRetries,
      } as SimpleStreamOptions,
    ),
    models: snapshot.models.map((model) => toPiModel(config, model)),
  });
  await modelRuntime.setRuntimeApiKey(config.providerId, config.providerApiKey);
  return modelRuntime;
}

export async function createPiSession(input: {
  config: PiRuntimeConfig;
  snapshot: ModelCatalogSnapshot;
  modelId: string;
  messages: readonly GenerationMessage[];
  requestId: string;
}): Promise<{ session: AgentSession; prompt: string }> {
  const modelRuntime = await createModelRuntime(input.config, input.snapshot);
  const model = modelRuntime.getModel(input.config.providerId, input.modelId);
  if (!model) {
    throw new ModelNotAvailableError(input.modelId);
  }
  const sessionManager = SessionManager.inMemory(input.config.workDir, { id: input.requestId });
  const prompt = seedHistory(sessionManager, input.messages);
  const services = await createAgentSessionServices({
    cwd: input.config.workDir,
    agentDir: path.join(input.config.workDir, '.pi-runtime'),
    modelRuntime,
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: {
        provider: {
          maxRetries: input.config.maxRetries,
          timeoutMs: input.config.requestTimeoutMs,
        },
      },
    }),
    resourceLoaderOptions: {
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: buildSystemPrompt(input.messages),
    },
  });
  const diagnostic = services.diagnostics.find((item) => item.type === 'error');
  if (diagnostic) {
    throw new Error(diagnostic.message);
  }
  const { session } = await createAgentSessionFromServices({
    services,
    sessionManager,
    model,
    noTools: 'all',
  });
  session.setAutoCompactionEnabled(false);
  return { session, prompt };
}
