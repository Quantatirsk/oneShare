import { requirementAnalyzer, RequirementAnalyzer, RequirementAnalysisResult } from './RequirementAnalyzer';
import { codeGenerator, CodeGenerator, CodeGenerationSession } from './CodeGenerator';

export type ConversationStage = 'idle' | 'analyzing' | 'ready_to_generate' | 'generating' | 'completed' | 'error';

export interface ConversationState {
  stage: ConversationStage;
  currentRequirement: string;
  currentAnalysis: RequirementAnalysisResult | null;
  currentSession: CodeGenerationSession | null;
  selectedTemplate: any;
  codeLang: 'tsx' | 'html';
  error?: string;
}

export interface ConversationCallbacks {
  onStageChange?: (stage: ConversationStage) => void;
  onAnalysisChunk?: (chunk: string, analysis: RequirementAnalysisResult) => void;
  onAnalysisComplete?: (analysis: RequirementAnalysisResult) => void;
  onUserMessage?: (message: string) => void;
  onCodeChunk?: (chunk: string) => void;
  onCodeComplete?: () => void;
  onError?: (error: string) => void;
}

export class ConversationManager {
  private state: ConversationState = {
    stage: 'idle',
    currentRequirement: '',
    currentAnalysis: null,
    currentSession: null,
    selectedTemplate: null,
    codeLang: 'tsx'
  };

  private callbacks: ConversationCallbacks = {};
  private requirementAnalyzer: RequirementAnalyzer;
  private codeGenerator: CodeGenerator;

  constructor() {
    this.requirementAnalyzer = requirementAnalyzer;
    this.codeGenerator = codeGenerator;
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: ConversationCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 设置选中的模板
   */
  setSelectedTemplate(template: any): void {
    this.state.selectedTemplate = template;
  }

  /**
   * 设置代码语言
   */
  setCodeLang(codeLang: 'tsx' | 'html'): void {
    this.state.codeLang = codeLang;
  }

  /**
   * 获取代码语言
   */
  getCodeLang(): 'tsx' | 'html' {
    return this.state.codeLang;
  }

  /**
   * 开始需求分析 (流式)
   */
  async startRequirementAnalysis(
    userRequirement: string,
    model: string = 'gpt-4.1-nano'
  ): Promise<void> {
    this.updateState({
      stage: 'analyzing',
      currentRequirement: userRequirement,
      currentAnalysis: null,
      error: undefined
    });

    try {
      await this.requirementAnalyzer.analyzeRequirement(
        userRequirement,
        (chunk, analysis) => {
          this.updateState({
            currentAnalysis: analysis
          });
          this.callbacks.onAnalysisChunk?.(chunk, analysis);
        },
        (analysis) => {
          this.updateState({
            stage: 'ready_to_generate',
            currentAnalysis: analysis
          });
          this.callbacks.onAnalysisComplete?.(analysis);
        },
        (error, analysis) => {
          this.updateState({
            stage: 'error',
            error,
            currentAnalysis: analysis
          });
          this.callbacks.onError?.(error);
        },
        model,
        this.state.selectedTemplate
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '需求分析失败';
      
      this.updateState({
        stage: 'error',
        error: errorMessage
      });

      this.callbacks.onError?.(errorMessage);
    }
  }

  /**
   * 开始代码生成
   */
  async startCodeGeneration(
    currentCode: string = '',
    model: string = 'moonshotai/kimi-k2-instruct'
  ): Promise<void> {
    // 允许在 ready_to_generate 或 completed 状态下开始代码生成
    if (!['ready_to_generate', 'completed'].includes(this.state.stage) || !this.state.currentAnalysis) {
      throw new Error('无法开始代码生成：请先完成需求分析');
    }

    this.updateState({
      stage: 'generating'
    });

    // 开始新的代码生成会话
    const session = this.codeGenerator.startNewSession(
      this.state.currentRequirement,
      this.state.currentAnalysis,
      this.state.selectedTemplate
    );

    this.updateState({
      currentSession: session
    });

    try {
      await this.codeGenerator.generateCode(
        {
          onChunk: (chunk) => {
            this.callbacks.onCodeChunk?.(chunk);
          },
          onComplete: () => {
            this.updateState({
              stage: 'completed'
            });
            this.callbacks.onCodeComplete?.();
          },
          onError: (error) => {
            this.updateState({
              stage: 'error',
              error
            });
            this.callbacks.onError?.(error);
          }
        },
        currentCode,
        model,
        this.state.codeLang
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '代码生成失败';
      
      this.updateState({
        stage: 'error',
        error: errorMessage
      });

      this.callbacks.onError?.(errorMessage);
    }
  }

  /**
   * 继续对话 (用于代码修改)
   */
  async continueConversation(
    userMessage: string,
    currentCode: string = '',
    model: string = 'moonshotai/kimi-k2-instruct'
  ): Promise<void> {
    if (!this.state.currentSession) {
      // 如果没有当前会话，当作新的需求分析处理
      await this.startRequirementAnalysis(userMessage);
      return;
    }

    // 通知UI添加用户消息
    this.callbacks.onUserMessage?.(userMessage);

    this.updateState({
      stage: 'generating',
      currentRequirement: userMessage,
      error: undefined
    });

    try {
      await this.codeGenerator.continueConversation(
        userMessage,
        {
          onChunk: (chunk) => {
            this.callbacks.onCodeChunk?.(chunk);
          },
          onComplete: () => {
            this.updateState({
              stage: 'completed'
            });
            this.callbacks.onCodeComplete?.();
          },
          onError: (error) => {
            this.updateState({
              stage: 'error',
              error
            });
            this.callbacks.onError?.(error);
          }
        },
        currentCode,
        model,
        this.state.codeLang
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '对话失败';
      
      this.updateState({
        stage: 'error',
        error: errorMessage
      });

      this.callbacks.onError?.(errorMessage);
    }
  }

  /**
   * 重新生成代码
   */
  async regenerateCode(
    currentCode: string = '',
    model: string = 'moonshotai/kimi-k2-instruct'
  ): Promise<void> {
    if (this.state.stage === 'ready_to_generate') {
      await this.startCodeGeneration(currentCode, model);
    } else if (this.state.currentSession) {
      await this.continueConversation(this.state.currentRequirement, currentCode, model);
    } else {
      throw new Error('无法重新生成：没有可用的需求或会话');
    }
  }

  /**
   * 重置对话
   */
  reset(): void {
    this.codeGenerator.clearCurrentSession();
    
    this.updateState({
      stage: 'idle',
      currentRequirement: '',
      currentAnalysis: null,
      currentSession: null,
      selectedTemplate: null,
      // 保持当前的codeLang不变，不要重置为tsx
      error: undefined
    });
  }

  /**
   * 获取当前状态
   */
  getState(): ConversationState {
    return { ...this.state };
  }

  /**
   * 获取当前生成的代码
   */
  getCurrentCode(): string {
    return this.state.currentSession?.generatedCode || '';
  }

  /**
   * 获取对话统计信息
   */
  getConversationStats(): {
    analysisCount: number;
    conversationRounds: number;
    codeLength: number;
    isAtLimit: boolean;
  } {
    const analysisHistory = this.requirementAnalyzer.getAnalysisHistory();
    const currentSession = this.state.currentSession;
    const conversationRounds = currentSession 
      ? Math.floor(currentSession.conversationHistory.length / 2)
      : 0;

    return {
      analysisCount: analysisHistory.length,
      conversationRounds,
      codeLength: currentSession?.generatedCode.length || 0,
      isAtLimit: conversationRounds >= 6 // 6轮对话限制
    };
  }

  /**
   * 生成上下文摘要 (用于token优化)
   */
  generateContextSummary(): string {
    const analysisSummary = this.requirementAnalyzer.generateAnalysisSummary();
    const sessionSummary = this.codeGenerator.generateSessionSummary();
    
    return `上下文摘要：
${analysisSummary}

${sessionSummary}

当前阶段：${this.state.stage}`;
  }

  /**
   * 检查是否可以进行操作
   */
  canPerformAction(action: 'analyze' | 'generate' | 'continue'): boolean {
    switch (action) {
      case 'analyze':
        return this.state.stage === 'idle' || this.state.stage === 'error' || this.state.stage === 'completed';
      case 'generate':
        return this.state.stage === 'ready_to_generate';
      case 'continue':
        return this.state.stage === 'completed' && this.state.currentSession !== null;
      default:
        return false;
    }
  }

  /**
   * 转换为适合显示的消息历史
   */
  toDisplayMessages(): Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    type: 'analysis' | 'code' | 'conversation';
  }> {
    const messages: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
      type: 'analysis' | 'code' | 'conversation';
    }> = [];

    // 添加需求分析消息
    if (this.state.currentAnalysis) {
      messages.push({
        id: `analysis-req-${this.state.currentAnalysis.id}`,
        role: 'user',
        content: this.state.currentAnalysis.userRequirement,
        timestamp: this.state.currentAnalysis.timestamp,
        type: 'analysis'
      });

      if (this.state.currentAnalysis.status === 'completed') {
        messages.push({
          id: `analysis-res-${this.state.currentAnalysis.id}`,
          role: 'assistant',
          content: this.state.currentAnalysis.analysis,
          timestamp: this.state.currentAnalysis.timestamp,
          type: 'analysis'
        });
      }
    }

    // 添加代码生成对话历史
    if (this.state.currentSession) {
      this.state.currentSession.conversationHistory.forEach((msg, index) => {
        messages.push({
          id: `conversation-${this.state.currentSession!.id}-${index}`,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: this.state.currentSession!.timestamp,
          type: 'conversation'
        });
      });
    }

    return messages;
  }

  /**
   * 更新当前分析内容 (用于编辑需求分析后的更新)
   */
  updateCurrentAnalysis(newAnalysisContent: string): void {
    if (this.state.currentAnalysis) {
      this.state.currentAnalysis = {
        ...this.state.currentAnalysis,
        analysis: newAnalysisContent
      };
    }
  }

  private updateState(updates: Partial<ConversationState>): void {
    const oldStage = this.state.stage;
    this.state = { ...this.state, ...updates };
    
    if (oldStage !== this.state.stage) {
      this.callbacks.onStageChange?.(this.state.stage);
    }
  }
}

// 创建全局单例
export const conversationManager = new ConversationManager();