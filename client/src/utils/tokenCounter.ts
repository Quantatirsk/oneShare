// Token计算工具 - 基于gpt-tokenizer的精确计算

import { encode, encodeChat } from 'gpt-tokenizer';

/**
 * 支持的模型类型
 */
export type SupportedModel = 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-turbo' | 'gpt-4o' | 'gpt-4o-mini';

/**
 * 精确计算文本的token数量
 * @param text 要计算的文本
 * @param model 使用的模型，默认为gpt-4
 * @returns token数量
 */
export function getTokenCount(text: string, _model: string = 'gpt-4'): number {
  if (!text || text.length === 0) return 0;
  
  try {
    // 使用简化的API，直接传入文本
    const tokens = encode(text);
    return tokens.length;
  } catch (error) {
    console.warn('Token计算失败，使用备用方法:', error);
    // 备用方法：简单的字符长度估算
    return Math.ceil(text.length / 3.5); // 平均3.5字符 ≈ 1 token
  }
}

/**
 * 计算两个文本之间的token差异
 * @param oldText 旧文本
 * @param newText 新文本  
 * @param model 使用的模型
 * @returns 新增的token数量
 */
export function calculateTokenDiff(oldText: string, newText: string, model: string = 'gpt-4'): number {
  const oldTokens = getTokenCount(oldText, model);
  const newTokens = getTokenCount(newText, model);
  return newTokens - oldTokens;
}

/**
 * 批量计算多个文本块的token数量
 * @param texts 文本数组
 * @param model 使用的模型
 * @returns token数量数组
 */
export function batchTokenCount(texts: string[], model: string = 'gpt-4'): number[] {
  return texts.map(text => getTokenCount(text, model));
}

/**
 * 获取文本的详细token统计信息
 * @param text 要分析的文本
 * @param model 使用的模型
 * @returns 详细统计信息
 */
export function getTokenStats(text: string, model: string = 'gpt-4'): {
  totalTokens: number;
  totalChars: number;
  avgCharsPerToken: number;
  encoding: string;
  model: string;
} {
  const totalTokens = getTokenCount(text, model);
  const totalChars = text.length;
  const avgCharsPerToken = totalChars > 0 ? totalChars / totalTokens : 0;
  const encoding = 'cl100k_base'; // 默认编码
  
  return {
    totalTokens,
    totalChars,
    avgCharsPerToken,
    encoding,
    model
  };
}

/**
 * 检查文本是否超过指定的token限制
 * @param text 要检查的文本
 * @param limit token限制数量
 * @param model 使用的模型
 * @returns 是否超过限制及相关信息
 */
export function checkTokenLimit(text: string, limit: number, model: string = 'gpt-4'): {
  isOverLimit: boolean;
  tokenCount: number;
  remaining: number;
  percentage: number;
} {
  const tokenCount = getTokenCount(text, model);
  const isOverLimit = tokenCount > limit;
  const remaining = limit - tokenCount;
  const percentage = (tokenCount / limit) * 100;
  
  return {
    isOverLimit,
    tokenCount,
    remaining,
    percentage
  };
}

/**
 * 将长文本截断到指定token限制内
 * @param text 原始文本
 * @param limit token限制
 * @param model 使用的模型
 * @returns 截断后的文本
 */
export function truncateToTokenLimit(text: string, limit: number, model: string = 'gpt-4'): string {
  if (getTokenCount(text, model) <= limit) {
    return text;
  }
  
  // 二分搜索找到合适的截断点
  let left = 0;
  let right = text.length;
  let result = '';
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const substring = text.substring(0, mid);
    const tokenCount = getTokenCount(substring, model);
    
    if (tokenCount <= limit) {
      result = substring;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return result;
}

/**
 * 为聊天消息计算token (包含系统消息格式开销)
 * @param messages 聊天消息数组
 * @param model 使用的模型
 * @returns token数量
 */
export function getChatTokenCount(
  messages: Array<{role: 'system' | 'user' | 'assistant'; content: string}>, 
  model: string = 'gpt-4'
): number {
  try {
    // 使用支持的模型名称
    const supportedModel = model.toLowerCase().includes('gpt-4') ? 'gpt-4' : 'gpt-3.5-turbo';
    return encodeChat(messages, supportedModel).length;
  } catch (error) {
    console.warn('聊天token计算失败，使用简单方法:', error);
    // 备用方法：计算所有内容加上格式开销
    const contentTokens = messages.reduce((sum, msg) => 
      sum + getTokenCount(msg.content, model), 0
    );
    // 每条消息约4个额外token用于格式
    return contentTokens + (messages.length * 4);
  }
}

/**
 * 估算生成速度（token/秒）
 * @param tokenCount 生成的token数量
 * @param timeSpanMs 时间跨度（毫秒）
 * @returns token/秒
 */
export function calculateTokensPerSecond(tokenCount: number, timeSpanMs: number): number {
  if (timeSpanMs <= 0) return 0;
  return (tokenCount / timeSpanMs) * 1000;
}

// 导出智能token计算函数（向后兼容）
export function smartTokenCount(text: string, model: string = 'gpt-4'): number {
  return getTokenCount(text, model);
}

