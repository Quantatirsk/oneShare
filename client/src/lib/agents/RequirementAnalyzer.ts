import { callRequirementAnalysisStream } from '@/lib/llmWrapper';
import type { Message } from '@/types';

export interface RequirementAnalysisResult {
  id: string;
  userRequirement: string;
  analysis: string;
  timestamp: Date;
  status: 'analyzing' | 'completed' | 'error';
  error?: string;
}

export class RequirementAnalyzer {
  private analysisHistory: RequirementAnalysisResult[] = [];
  private maxHistoryLength = 6;

  /**
   * 分析用户需求 (流式)
   */
  async analyzeRequirement(
    userRequirement: string,
    onChunk: (content: string, result: RequirementAnalysisResult) => void,
    onComplete?: (result: RequirementAnalysisResult) => void,
    onError?: (error: string, result: RequirementAnalysisResult) => void,
    model: string = 'gpt-4.1-nano',
    selectedTemplate?: any
  ): Promise<void> {
    const analysisId = Date.now().toString();
    
    const result: RequirementAnalysisResult = {
      id: analysisId,
      userRequirement,
      analysis: '',
      timestamp: new Date(),
      status: 'analyzing'
    };

    // 添加到历史记录
    this.addToHistory(result);

    try {
      await callRequirementAnalysisStream(
        userRequirement,
        (chunk) => {
          result.analysis += chunk;
          this.updateHistory(analysisId, result);
          onChunk(chunk, result);
        },
        () => {
          result.status = 'completed';
          this.updateHistory(analysisId, result);
          onComplete?.(result);
        },
        (error) => {
          result.status = 'error';
          result.error = error;
          this.updateHistory(analysisId, result);
          onError?.(error, result);
        },
        model,
        selectedTemplate
      );
    } catch (error) {
      result.status = 'error';
      result.error = error instanceof Error ? error.message : '分析失败';
      this.updateHistory(analysisId, result);
      onError?.(error instanceof Error ? error.message : '分析失败', result);
    }
  }

  /**
   * 获取分析历史
   */
  getAnalysisHistory(): RequirementAnalysisResult[] {
    return [...this.analysisHistory];
  }

  /**
   * 获取最新的分析结果
   */
  getLatestAnalysis(): RequirementAnalysisResult | null {
    return this.analysisHistory.length > 0 
      ? this.analysisHistory[this.analysisHistory.length - 1] 
      : null;
  }

  /**
   * 清除分析历史
   */
  clearHistory(): void {
    this.analysisHistory = [];
  }

  /**
   * 根据ID获取分析结果
   */
  getAnalysisById(id: string): RequirementAnalysisResult | null {
    return this.analysisHistory.find(analysis => analysis.id === id) || null;
  }

  /**
   * 生成分析摘要 (用于上下文压缩)
   */
  generateAnalysisSummary(): string {
    if (this.analysisHistory.length === 0) {
      return '';
    }

    const recentAnalyses = this.analysisHistory.slice(-3);
    const summaryParts = recentAnalyses.map(analysis => {
      if (analysis.status === 'completed') {
        return `需求: ${analysis.userRequirement.slice(0, 100)}...\n分析: ${analysis.analysis.slice(0, 200)}...`;
      }
      return `需求: ${analysis.userRequirement.slice(0, 100)}... (分析失败)`;
    });

    return summaryParts.join('\n\n');
  }

  /**
   * 转换为对话消息格式
   */
  toConversationMessages(): Message[] {
    const messages: Message[] = [];
    
    for (const analysis of this.analysisHistory) {
      if (analysis.status === 'completed') {
        messages.push({
          role: 'user',
          content: analysis.userRequirement
        });
        messages.push({
          role: 'assistant',
          content: analysis.analysis
        });
      }
    }

    return messages;
  }

  private addToHistory(result: RequirementAnalysisResult): void {
    this.analysisHistory.push(result);
    
    // 保持历史记录在限制范围内
    if (this.analysisHistory.length > this.maxHistoryLength) {
      this.analysisHistory = this.analysisHistory.slice(-this.maxHistoryLength);
    }
  }

  private updateHistory(id: string, updatedResult: RequirementAnalysisResult): void {
    const index = this.analysisHistory.findIndex(analysis => analysis.id === id);
    if (index !== -1) {
      this.analysisHistory[index] = updatedResult;
    }
  }
}

// 创建全局单例
export const requirementAnalyzer = new RequirementAnalyzer();