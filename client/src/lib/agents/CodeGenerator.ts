import { callCodeGenerationStream } from '@/lib/llmWrapper';
import type { Message } from '@/types';
import type { RequirementAnalysisResult } from './RequirementAnalyzer';
import { extractCleanCode, type CodeLanguage } from '@/utils/codeCleaningUtils';

export interface CodeGenerationSession {
  id: string;
  requirement: string;
  analysis?: RequirementAnalysisResult;
  template?: any;
  conversationHistory: Message[];
  generatedCode: string;
  timestamp: Date;
  status: 'idle' | 'generating' | 'completed' | 'error';
  error?: string;
}

export interface CodeGenerationCallbacks {
  onChunk: (content: string) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export class CodeGenerator {
  private currentSession: CodeGenerationSession | null = null;
  private sessionHistory: CodeGenerationSession[] = [];
  private maxHistoryLength = 6;

  /**
   * 开始新的代码生成会话
   */
  startNewSession(
    requirement: string,
    analysis?: RequirementAnalysisResult,
    template?: any
  ): CodeGenerationSession {
    const sessionId = Date.now().toString();
    
    const session: CodeGenerationSession = {
      id: sessionId,
      requirement,
      analysis,
      template,
      conversationHistory: [],
      generatedCode: '',
      timestamp: new Date(),
      status: 'idle'
    };

    this.currentSession = session;
    this.addSessionToHistory(session);

    return session;
  }

  /**
   * 生成代码 (流式)
   */
  async generateCode(
    callbacks: CodeGenerationCallbacks,
    currentCode: string = '',
    model: string = 'moonshotai/kimi-k2-instruct',
    codeLang: 'tsx' | 'html' = 'tsx'
  ): Promise<void> {
    if (!this.currentSession) {
      throw new Error('没有活跃的代码生成会话');
    }

    const session = this.currentSession;
    session.status = 'generating';
    session.generatedCode = '';

    try {
      await callCodeGenerationStream(
        session.analysis?.analysis || '',
        session.conversationHistory,
        session.template,
        currentCode,
        (chunk) => {
          session.generatedCode += chunk;
          callbacks.onChunk(chunk);
        },
        () => {
          session.status = 'completed';
          
          // 清理生成的代码
          const cleanedCode = extractCleanCode(
            session.generatedCode, 
            codeLang as CodeLanguage,
            { debugMode: false }
          );
          
          // 如果清理后的代码有效，使用清理后的版本
          if (cleanedCode && cleanedCode.trim().length > 0) {
            session.generatedCode = cleanedCode;
          }
          
          // 添加生成的代码到对话历史
          session.conversationHistory.push({
            role: 'assistant',
            content: session.generatedCode
          });
          this.updateSessionHistory(session.id, session);
          callbacks.onComplete?.();
        },
        (error) => {
          session.status = 'error';
          session.error = error;
          this.updateSessionHistory(session.id, session);
          callbacks.onError?.(error);
        },
        model,
        true, // isFirstGeneration
        codeLang
      );
    } catch (error) {
      session.status = 'error';
      session.error = error instanceof Error ? error.message : '代码生成失败';
      this.updateSessionHistory(session.id, session);
      throw error;
    }
  }

  /**
   * 继续对话 (用于代码修改)
   */
  async continueConversation(
    userMessage: string,
    callbacks: CodeGenerationCallbacks,
    currentCode: string = '',
    model: string = 'moonshotai/kimi-k2-instruct',
    codeLang: 'tsx' | 'html' = 'tsx'
  ): Promise<void> {
    if (!this.currentSession) {
      throw new Error('没有活跃的代码生成会话');
    }

    const session = this.currentSession;
    
    // 更新需求为新的用户消息
    session.requirement = userMessage;
    session.status = 'generating';
    session.generatedCode = '';
    
    // 添加用户消息到对话历史
    session.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    try {
      await callCodeGenerationStream(
        '', // 对于继续对话，不需要单独的prompt，因为已经在conversationHistory中
        this.getOptimizedConversationHistory(),
        session.template,
        currentCode, // 使用当前代码而不是模板
        (chunk) => {
          session.generatedCode += chunk;
          callbacks.onChunk(chunk);
        },
        () => {
          session.status = 'completed';
          
          // 清理生成的代码
          const cleanedCode = extractCleanCode(
            session.generatedCode, 
            codeLang as CodeLanguage,
            { debugMode: false }
          );
          
          // 如果清理后的代码有效，使用清理后的版本
          if (cleanedCode && cleanedCode.trim().length > 0) {
            session.generatedCode = cleanedCode;
          }
          
          // 添加助手回复到对话历史
          session.conversationHistory.push({
            role: 'assistant',
            content: session.generatedCode
          });
          this.updateSessionHistory(session.id, session);
          callbacks.onComplete?.();
        },
        (error) => {
          session.status = 'error';
          session.error = error;
          this.updateSessionHistory(session.id, session);
          callbacks.onError?.(error);
        },
        model,
        false, // isFirstGeneration = false
        codeLang
      );
    } catch (error) {
      session.status = 'error';
      session.error = error instanceof Error ? error.message : '对话失败';
      this.updateSessionHistory(session.id, session);
      throw error;
    }
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): CodeGenerationSession | null {
    return this.currentSession;
  }

  /**
   * 获取会话历史
   */
  getSessionHistory(): CodeGenerationSession[] {
    return [...this.sessionHistory];
  }

  /**
   * 根据ID获取会话
   */
  getSessionById(id: string): CodeGenerationSession | null {
    return this.sessionHistory.find(session => session.id === id) || null;
  }

  /**
   * 清除当前会话
   */
  clearCurrentSession(): void {
    this.currentSession = null;
  }

  /**
   * 清除所有历史
   */
  clearAllHistory(): void {
    this.currentSession = null;
    this.sessionHistory = [];
  }

  /**
   * 获取完整的对话历史 (用于代码生成)
   */
  getFullConversationHistory(): Message[] {
    if (!this.currentSession) {
      return [];
    }

    const messages: Message[] = [];
    const session = this.currentSession;
    
    // 1. 添加需求分析结果作为初始用户消息
    if (session.analysis) {
      messages.push({
        role: 'user', 
        content: session.analysis.analysis
      });
    }
    
    // 2. 添加代码生成对话历史
    return [...messages, ...session.conversationHistory];
  }

  /**
   * 获取优化后的对话历史 (用于token优化)
   */
  private getOptimizedConversationHistory(): Message[] {
    const fullHistory = this.getFullConversationHistory();
    
    // 如果历史记录超过8条，只保留最近的6条
    if (fullHistory.length > 8) {
      return fullHistory.slice(-6);
    }

    return fullHistory;
  }

  /**
   * 生成会话摘要 (用于上下文压缩)
   */
  generateSessionSummary(): string {
    if (!this.currentSession) {
      return '';
    }

    const session = this.currentSession;
    const conversationCount = Math.floor(session.conversationHistory.length / 2);
    
    return `会话摘要：
需求: ${session.requirement.slice(0, 100)}...
${session.analysis ? `分析: ${session.analysis.analysis.slice(0, 100)}...` : ''}
对话轮数: ${conversationCount}
状态: ${session.status}
${session.generatedCode ? `代码长度: ${session.generatedCode.length} 字符` : ''}`;
  }

  /**
   * 检查是否可以开始新的生成
   */
  canStartGeneration(): boolean {
    return !this.currentSession || this.currentSession.status !== 'generating';
  }

  /**
   * 获取生成进度信息
   */
  getGenerationProgress(): {
    isGenerating: boolean;
    currentCode: string;
    conversationCount: number;
  } {
    if (!this.currentSession) {
      return {
        isGenerating: false,
        currentCode: '',
        conversationCount: 0
      };
    }

    return {
      isGenerating: this.currentSession.status === 'generating',
      currentCode: this.currentSession.generatedCode,
      conversationCount: Math.floor(this.currentSession.conversationHistory.length / 2)
    };
  }

  private addSessionToHistory(session: CodeGenerationSession): void {
    this.sessionHistory.push(session);
    
    // 保持历史记录在限制范围内
    if (this.sessionHistory.length > this.maxHistoryLength) {
      this.sessionHistory = this.sessionHistory.slice(-this.maxHistoryLength);
    }
  }

  private updateSessionHistory(id: string, updatedSession: CodeGenerationSession): void {
    const index = this.sessionHistory.findIndex(session => session.id === id);
    if (index !== -1) {
      this.sessionHistory[index] = updatedSession;
    }
  }
}

// 创建全局单例
export const codeGenerator = new CodeGenerator();