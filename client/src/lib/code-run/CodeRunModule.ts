import {
  createAiConversation,
  releaseAiConversation,
  streamAiConversationRun,
  type AiConversation,
} from '@/lib/aiClient';
import { extractCleanCode, type CodeLanguage } from '@/utils/codeCleaningUtils';
import type { RenderFailure, RenderOutcome } from '@/hooks/useCodeRenderer';

export interface RenderAdapter {
  validate(code: string, language: 'tsx' | 'html', signal: AbortSignal): Promise<RenderOutcome>;
}

export interface CodeRunInput {
  model: string;
  language: 'tsx' | 'html';
  prompt: string;
  baseCode?: string;
}

export interface CodeRunCallbacks {
  onThinking(text: string): void;
  onCodeStart(repairAttempt: number): void;
  onCodeDelta(text: string): void;
  onValidating(): void;
  onRepairing(attempt: 1 | 2, failure: RenderFailure): void;
  onReady(code: string): void;
  onExhausted(code: string, failure: RenderFailure): void;
}

export class CodeRunModule {
  private conversation?: AiConversation;

  public constructor(private renderer: RenderAdapter) {}

  public get conversationId(): string | undefined { return this.conversation?.conversationId; }
  public setRenderer(renderer: RenderAdapter): void { this.renderer = renderer; }

  public async start(input: CodeRunInput, callbacks: CodeRunCallbacks, signal: AbortSignal): Promise<void> {
    await this.reset();
    this.conversation = await createAiConversation({
      model: input.model,
      messages: [
        { role: 'system', content: buildSystemPrompt(input.language, input.baseCode) },
        { role: 'user', content: input.prompt },
      ],
    }, signal);
    await this.execute({ kind: 'initial' }, input.language, callbacks, signal, 0);
  }

  public async continue(prompt: string, language: 'tsx' | 'html', callbacks: CodeRunCallbacks, signal: AbortSignal): Promise<void> {
    if (!this.conversation) throw new Error('没有可继续的代码会话。');
    await this.execute({ kind: 'user', content: prompt }, language, callbacks, signal, 0);
  }

  public async reset(): Promise<void> {
    const conversationId = this.conversation?.conversationId;
    this.conversation = undefined;
    if (conversationId) await releaseAiConversation(conversationId);
  }

  private async execute(
    request: { kind: 'initial' | 'user'; content?: string },
    language: 'tsx' | 'html',
    callbacks: CodeRunCallbacks,
    signal: AbortSignal,
    repairAttempt: number,
  ): Promise<void> {
    if (!this.conversation) throw new Error('没有可运行的代码会话。');
    callbacks.onCodeStart(repairAttempt);
    let output = '';
    await streamAiConversationRun(this.conversation.conversationId, request, {
      onThinkingDelta: callbacks.onThinking,
      onDelta: (text) => {
        output += text;
        callbacks.onCodeDelta(text);
      },
    }, signal);
    if (signal.aborted) return;
    const code = normalizeCode(output, language);
    if (!code) throw new Error('模型没有返回可渲染的代码。');
    callbacks.onValidating();
    const outcome = await this.renderer.validate(code, language, signal);
    if (signal.aborted) return;
    if (outcome.ok) {
      callbacks.onReady(code);
      return;
    }
    if (outcome.failure.kind === 'infrastructure' || repairAttempt >= 2) {
      callbacks.onExhausted(code, outcome.failure);
      return;
    }
    const nextAttempt = (repairAttempt + 1) as 1 | 2;
    callbacks.onRepairing(nextAttempt, outcome.failure);
    await this.execute({ kind: 'user', content: buildRepairPrompt(code, language, outcome.failure) }, language, callbacks, signal, nextAttempt);
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
