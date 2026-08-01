import { CodeRunModule, type RenderAdapter } from '@/lib/code-run/CodeRunModule';
import { isAiRequestAborted } from '@/lib/aiClient';
import { requirementAnalyzer, type RequirementAnalysisResult } from './RequirementAnalyzer';
import type { RenderFailure } from '@/hooks/useCodeRenderer';

export type ConversationStage = 'idle' | 'analyzing' | 'ready_to_generate' | 'generating' | 'validating' | 'repairing' | 'completed' | 'error';

interface CodeSession { generatedCode: string; conversationId?: string; timestamp: Date }
export interface ConversationState {
  stage: ConversationStage;
  currentRequirement: string;
  currentAnalysis: RequirementAnalysisResult | null;
  currentSession: CodeSession | null;
  selectedTemplate: any;
  codeLang: 'tsx' | 'html';
  currentModel?: string;
  error?: string;
}

export interface ConversationCallbacks {
  onStageChange?: (stage: ConversationStage) => void;
  onAnalysisChunk?: (chunk: string, analysis: RequirementAnalysisResult) => void;
  onThinkingChunk?: (chunk: string) => void;
  onAnalysisComplete?: (analysis: RequirementAnalysisResult, modelId?: string) => void;
  onCodeChunk?: (chunk: string) => void;
  onCodeComplete?: (modelId?: string) => void;
  onRecovery?: (attempt: 1 | 2, failure: RenderFailure) => void;
  onRecoveryExhausted?: (failure: RenderFailure) => void;
  onError?: (error: string) => void;
}

export class ConversationManager {
  private state: ConversationState = { stage: 'idle', currentRequirement: '', currentAnalysis: null, currentSession: null, selectedTemplate: null, codeLang: 'tsx' };
  private callbacks: ConversationCallbacks = {};
  private activeAbortController?: AbortController;
  private codeRun?: CodeRunModule;

  public setCallbacks(callbacks: ConversationCallbacks): void { this.callbacks = { ...this.callbacks, ...callbacks }; }
  public setRenderer(renderer: RenderAdapter): void {
    if (this.codeRun) this.codeRun.setRenderer(renderer);
    else this.codeRun = new CodeRunModule(renderer);
  }
  public setSelectedTemplate(template: any): void { this.state.selectedTemplate = template; }
  public setCodeLang(codeLang: 'tsx' | 'html'): void { this.state.codeLang = codeLang; }
  public getCodeLang(): 'tsx' | 'html' { return this.state.codeLang; }
  public getCurrentModel(): string | undefined { return this.state.currentModel; }
  public getCurrentCode(): string { return this.state.currentSession?.generatedCode || ''; }
  public hasCodeSession(): boolean { return Boolean(this.codeRun?.conversationId); }

  public cancelActiveRequest(): void { this.activeAbortController?.abort(); }

  public async startRequirementAnalysis(userRequirement: string, model: string): Promise<void> {
    const controller = this.startRequest();
    this.updateState({ stage: 'analyzing', currentRequirement: userRequirement, currentAnalysis: null, currentModel: model, error: undefined });
    try {
      await requirementAnalyzer.analyzeRequirement(
        userRequirement,
        (chunk, analysis) => { this.updateState({ currentAnalysis: analysis }); this.callbacks.onAnalysisChunk?.(chunk, analysis); },
        (chunk) => this.callbacks.onThinkingChunk?.(chunk),
        (analysis) => { this.updateState({ stage: 'ready_to_generate', currentAnalysis: analysis }); this.callbacks.onAnalysisComplete?.(analysis, model); },
        (error, analysis) => { this.updateState({ stage: 'error', error, currentAnalysis: analysis }); this.callbacks.onError?.(error); },
        model,
        this.state.selectedTemplate,
        controller.signal,
      );
    } catch (error) {
      this.handleFailure(error, controller, '需求分析失败');
    } finally { this.clearRequest(controller); }
  }

  public async startCodeGeneration(currentCode: string, model: string): Promise<void> {
    if (!this.state.currentAnalysis) throw new Error('无法开始代码生成：请先完成需求分析');
    if (!this.codeRun) throw new Error('预览器尚未准备好');
    const controller = this.startRequest();
    this.updateState({ stage: 'generating', currentModel: model, error: undefined, currentSession: { generatedCode: '', timestamp: new Date() } });
    try {
      await this.codeRun.start({
        model,
        language: this.state.codeLang,
        prompt: this.state.currentAnalysis.analysis,
        baseCode: currentCode || templateCode(this.state.selectedTemplate),
      }, this.codeCallbacks(), controller.signal);
      this.syncConversationId();
    } catch (error) {
      this.handleFailure(error, controller, '代码生成失败');
    } finally { this.clearRequest(controller); }
  }

  public async continueConversation(userMessage: string, model: string): Promise<void> {
    if (!this.codeRun?.conversationId) throw new Error('没有可继续的代码会话');
    const controller = this.startRequest();
    this.updateState({ stage: 'generating', currentRequirement: userMessage, currentModel: this.state.currentModel || model, error: undefined });
    try {
      await this.codeRun.continue(userMessage, this.state.codeLang, this.codeCallbacks(), controller.signal);
      this.syncConversationId();
    } catch (error) {
      this.handleFailure(error, controller, '代码修改失败');
    } finally { this.clearRequest(controller); }
  }

  public reset(): void {
    this.cancelActiveRequest();
    void this.codeRun?.reset();
    this.updateState({ stage: 'idle', currentRequirement: '', currentAnalysis: null, currentSession: null, selectedTemplate: null, error: undefined });
  }

  public updateCurrentAnalysis(analysis: string): void {
    if (this.state.currentAnalysis) this.state.currentAnalysis = { ...this.state.currentAnalysis, analysis };
  }

  public getConversationStats(): { analysisCount: number; conversationRounds: number; codeLength: number; isAtLimit: boolean } {
    return { analysisCount: this.state.currentAnalysis ? 1 : 0, conversationRounds: this.codeRun?.conversationId ? 1 : 0, codeLength: this.getCurrentCode().length, isAtLimit: false };
  }

  private codeCallbacks() {
    return {
      onThinking: (chunk: string) => this.callbacks.onThinkingChunk?.(chunk),
      onCodeStart: () => {
        if (this.state.currentSession) this.state.currentSession.generatedCode = '';
        this.updateState({ stage: 'generating' });
      },
      onCodeDelta: (chunk: string) => {
        if (this.state.currentSession) this.state.currentSession.generatedCode += chunk;
        this.callbacks.onCodeChunk?.(chunk);
      },
      onValidating: () => this.updateState({ stage: 'validating' }),
      onRepairing: (attempt: 1 | 2, failure: RenderFailure) => {
        this.updateState({ stage: 'repairing' });
        this.callbacks.onRecovery?.(attempt, failure);
      },
      onReady: (code: string) => {
        if (this.state.currentSession) this.state.currentSession.generatedCode = code;
        this.updateState({ stage: 'completed' });
        this.callbacks.onCodeComplete?.(this.state.currentModel);
      },
      onExhausted: (code: string, failure: RenderFailure) => {
        if (this.state.currentSession) this.state.currentSession.generatedCode = code;
        this.updateState({ stage: 'completed', error: failure.message });
        this.callbacks.onRecoveryExhausted?.(failure);
        this.callbacks.onCodeComplete?.(this.state.currentModel);
      },
    };
  }

  private startRequest(): AbortController { this.activeAbortController?.abort(); const controller = new AbortController(); this.activeAbortController = controller; return controller; }
  private clearRequest(controller: AbortController): void { if (this.activeAbortController === controller) this.activeAbortController = undefined; }
  private syncConversationId(): void { if (this.state.currentSession) this.state.currentSession.conversationId = this.codeRun?.conversationId; }
  private handleFailure(error: unknown, controller: AbortController, fallback: string): void {
    if (isAiRequestAborted(error)) {
      if (this.activeAbortController === controller) this.updateState({ stage: this.hasCodeSession() ? 'completed' : 'idle', error: undefined });
      return;
    }
    const message = error instanceof Error ? error.message : fallback;
    this.updateState({ stage: 'error', error: message });
    this.callbacks.onError?.(message);
  }
  private updateState(updates: Partial<ConversationState>): void {
    const oldStage = this.state.stage;
    this.state = { ...this.state, ...updates };
    if (oldStage !== this.state.stage) this.callbacks.onStageChange?.(this.state.stage);
  }
}

function templateCode(template: unknown): string {
  if (typeof template !== 'object' || template === null) return '';
  const code = Reflect.get(template, 'code');
  return typeof code === 'string' ? code : '';
}

export const conversationManager = new ConversationManager();
