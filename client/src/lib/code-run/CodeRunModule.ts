import {
  AiRequestError,
  createAiRunId,
  createAiConversation,
  isAiRequestAborted,
  releaseAiConversation,
  streamAiConversationEvents,
  type AiConversation,
  type GenerateRequest,
} from '../aiClient.ts';
import { extractCleanCode, type CodeLanguage } from '../../utils/codeCleaningUtils.ts';
import type { RenderFailure, RenderOutcome } from '../../hooks/useCodeRenderer.ts';
import type { AiConversationRunRequest, AiRunEvent } from '../../../../shared/ai-conversation-contract.ts';

export interface RenderAdapter {
  validate(code: string, language: 'tsx' | 'html', signal: AbortSignal): Promise<RenderOutcome>;
}

export interface ConversationAdapter {
  create(request: GenerateRequest, signal: AbortSignal): Promise<AiConversation>;
  run(conversationId: string, request: AiConversationRunRequest, signal: AbortSignal): AsyncIterable<AiRunEvent>;
  release(conversationId: string): Promise<void>;
}

export interface CodeRunInput {
  model: string;
  language: 'tsx' | 'html';
  prompt: string;
  baseCode?: string;
}

export interface CodeRunFailure {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
}

export type CodeRunEvent =
  | { type: 'thinking'; runId: string; text: string }
  | { type: 'code_started'; runId: string; repairAttempt: number }
  | { type: 'code_delta'; runId: string; text: string }
  | { type: 'validating'; runId: string }
  | { type: 'repairing'; runId: string; attempt: 1 | 2; failure: RenderFailure }
  | { type: 'ready'; runId: string; code: string }
  | { type: 'exhausted'; runId: string; code: string; failure: RenderFailure }
  | { type: 'aborted'; runId: string }
  | { type: 'failed'; runId: string; failure: CodeRunFailure };

const browserConversationAdapter: ConversationAdapter = {
  create: createAiConversation,
  run: streamAiConversationEvents,
  release: releaseAiConversation,
};

export class CodeRunModule {
  private conversation?: AiConversation;

  public constructor(
    private renderer: RenderAdapter,
    private readonly conversations: ConversationAdapter = browserConversationAdapter,
  ) {}

  public get conversationId(): string | undefined { return this.conversation?.conversationId; }
  public setRenderer(renderer: RenderAdapter): void { this.renderer = renderer; }

  public async *start(input: CodeRunInput, signal: AbortSignal): AsyncGenerator<CodeRunEvent> {
    const runId = createAiRunId();
    try {
      await this.reset();
      this.conversation = await this.conversations.create({
        model: input.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(input.language, input.baseCode) },
          { role: 'user', content: input.prompt },
        ],
      }, signal);
    } catch (error) {
      yield this.failureEvent(runId, error, signal);
      return;
    }
    yield* this.execute({ kind: 'initial' }, input.language, signal, 0);
  }

  public async *continue(
    prompt: string,
    language: 'tsx' | 'html',
    signal: AbortSignal,
  ): AsyncGenerator<CodeRunEvent> {
    if (!this.conversation) throw new Error('没有可继续的代码会话。');
    yield* this.execute({ kind: 'user', content: prompt }, language, signal, 0);
  }

  public async reset(): Promise<void> {
    const conversationId = this.conversation?.conversationId;
    this.conversation = undefined;
    if (conversationId) await this.conversations.release(conversationId);
  }

  private async *execute(
    request: Omit<AiConversationRunRequest, 'runId'>,
    language: 'tsx' | 'html',
    signal: AbortSignal,
    repairAttempt: number,
  ): AsyncGenerator<CodeRunEvent> {
    if (!this.conversation) throw new Error('没有可运行的代码会话。');
    const conversationId = this.conversation.conversationId;
    const runId = createAiRunId();
    if (signal.aborted) {
      yield { type: 'aborted', runId };
      return;
    }
    yield { type: 'code_started', runId, repairAttempt };
    if (signal.aborted) {
      yield { type: 'aborted', runId };
      return;
    }

    let output = '';
    let completed = false;
    try {
      for await (const event of this.conversations.run(
        conversationId,
        { ...request, runId },
        signal,
      )) {
        if (event.runId !== runId || event.conversationId !== conversationId) continue;
        if (event.type === 'thinking') {
          yield { type: 'thinking', runId, text: event.text };
        } else if (event.type === 'delta') {
          output += event.text;
          yield { type: 'code_delta', runId, text: event.text };
        } else if (event.type === 'completed') {
          completed = true;
        } else if (event.type === 'aborted') {
          yield { type: 'aborted', runId };
          return;
        } else if (event.type === 'failed') {
          yield {
            type: 'failed',
            runId,
            failure: { code: event.code, message: event.message, retryable: event.retryable, requestId: event.requestId },
          };
          return;
        }
      }
    } catch (error) {
      yield this.failureEvent(runId, error, signal);
      return;
    }

    if (signal.aborted) {
      yield { type: 'aborted', runId };
      return;
    }
    if (!completed) {
      yield {
        type: 'failed',
        runId,
        failure: { code: 'STREAM_ENDED_EARLY', message: 'AI run ended without a terminal event.', retryable: true },
      };
      return;
    }

    const code = normalizeCode(output, language);
    if (!code) {
      yield {
        type: 'failed',
        runId,
        failure: { code: 'EMPTY_MODEL_OUTPUT', message: '模型没有返回可渲染的代码。', retryable: false },
      };
      return;
    }
    yield { type: 'validating', runId };

    let outcome: RenderOutcome;
    try {
      outcome = await this.renderer.validate(code, language, signal);
    } catch (error) {
      yield this.failureEvent(runId, error, signal);
      return;
    }

    if (signal.aborted) {
      yield { type: 'aborted', runId };
      return;
    }
    if (outcome.ok) {
      yield { type: 'ready', runId, code };
      return;
    }
    if (outcome.failure.kind === 'infrastructure') {
      yield {
        type: 'failed',
        runId,
        failure: { code: 'RENDER_INFRASTRUCTURE', message: outcome.failure.message, retryable: true },
      };
      return;
    }
    if (repairAttempt >= 2) {
      yield { type: 'exhausted', runId, code, failure: outcome.failure };
      return;
    }

    const nextAttempt = (repairAttempt + 1) as 1 | 2;
    yield { type: 'repairing', runId, attempt: nextAttempt, failure: outcome.failure };
    yield* this.execute(
      { kind: 'user', content: buildRepairPrompt(code, language, outcome.failure) },
      language,
      signal,
      nextAttempt,
    );
  }

  private failureEvent(runId: string, error: unknown, signal: AbortSignal): CodeRunEvent {
    if (signal.aborted || isAiRequestAborted(error)) return { type: 'aborted', runId };
    if (error instanceof AiRequestError) {
      return {
        type: 'failed',
        runId,
        failure: { code: error.code, message: error.message, retryable: error.retryable, requestId: error.requestId },
      };
    }
    return {
      type: 'failed',
      runId,
      failure: { code: 'CODE_RUN_FAILED', message: error instanceof Error ? error.message : '代码生成失败。', retryable: false },
    };
  }
}

function buildSystemPrompt(language: 'tsx' | 'html', baseCode?: string): string {
  const target = language === 'tsx' ? 'React TypeScript TSX' : 'single-file HTML';
  return [
    `Generate a complete, production-quality ${target} application.`,
    'Return code only. Keep the result responsive and self-contained.',
    language === 'tsx'
      ? 'Use React, TypeScript, and Tailwind classes. Include all required imports.'
      : 'Use semantic HTML, Tailwind via CDN, and inline module JavaScript when needed.',
    baseCode ? `Adapt this existing code rather than discarding its useful structure:\n\n${baseCode}` : '',
  ].filter(Boolean).join('\n\n');
}

function buildRepairPrompt(code: string, language: 'tsx' | 'html', failure: RenderFailure): string {
  const diagnostic = failure.message.slice(0, 4_000);
  return [
    `The ${language} code you just produced failed to render.`,
    `Failure type: ${failure.kind}.`,
    `Diagnostic: ${diagnostic}`,
    'Return a complete replacement source file only. Do not explain the fix.',
    `Current source:\n\n${code.slice(0, 80_000)}`,
  ].join('\n\n');
}

function normalizeCode(value: string, language: 'tsx' | 'html'): string {
  const cleaned = extractCleanCode(value, language as CodeLanguage, { debugMode: false });
  return (cleaned || value).trim();
}
