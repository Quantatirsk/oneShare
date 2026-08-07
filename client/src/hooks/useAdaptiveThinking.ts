import { useState, useEffect, useRef, useCallback } from 'react';
import { getTokenCount } from '@/utils/tokenCounter';

interface AdaptiveThinkingState {
  // 显示控制
  shouldShow: boolean;
  showDelay: number;
  
  // 内容生成统计
  firstTokenTime: number | null;
  generationSpeed: number; // Token/秒，基于实际流式增量测量
  totalTokens: number;
  generationStartTime: number | null;
  
  // 滚动控制
  scrollSpeed: number; // px/秒
  
  // 性能统计
  averageChunkSize: number; // token数量
  chunkCount: number;
  responseLatency: number | null;
}

interface UseAdaptiveThinkingOptions {
  content: string;
  isGenerating: boolean;
  enableAdaptive?: boolean;
  baseScrollSpeed?: number;
}

export function useAdaptiveThinking({
  content,
  isGenerating,
  enableAdaptive = true,
  baseScrollSpeed = 60
}: UseAdaptiveThinkingOptions) {
  const [state, setState] = useState<AdaptiveThinkingState>({
    shouldShow: false,
    showDelay: 0,
    firstTokenTime: null,
    generationSpeed: 0,
    totalTokens: 0,
    generationStartTime: null,
    scrollSpeed: baseScrollSpeed,
    averageChunkSize: 0,
    chunkCount: 0,
    responseLatency: null
  });

  // 用于跟踪内容变化的引用
  const prevContentRef = useRef<string>('');
  const generationTimestampsRef = useRef<number[]>([]);
  const chunkTokenSizesRef = useRef<number[]>([]);
  const speedUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 基于实际到达的 token 增量计算输出速度，用于界面性能统计。
  const calculateGenerationSpeed = useCallback(() => {
    const timestamps = generationTimestampsRef.current;
    const chunkSizes = chunkTokenSizesRef.current;
    
    if (timestamps.length < 2 || chunkSizes.length < 2) return 0;
    
    // 使用最近5秒的数据计算速度
    const now = Date.now();
    const windowSize = 5000; // 5秒窗口
    
    let totalTokens = 0;
    let oldestTime = now;
    let validChunks = 0;
    
    // 从最新数据向前遍历，收集窗口内的数据
    for (let i = timestamps.length - 1; i >= 0; i--) {
      const timestamp = timestamps[i];
      if (now - timestamp <= windowSize) {
        totalTokens += chunkSizes[i];
        oldestTime = Math.min(oldestTime, timestamp);
        validChunks++;
      } else {
        break; // 超出窗口范围
      }
    }
    
    if (validChunks < 2) return 0;
    
    const timeSpan = (now - oldestTime) / 1000; // 转换为秒
    return timeSpan > 0 ? totalTokens / timeSpan : 0;
  }, []);

  // 动态滚动速度计算
  const calculateScrollSpeed = useCallback(() => {
    const currentTokenSpeed = calculateGenerationSpeed();
    
    if (currentTokenSpeed === 0) return baseScrollSpeed;
    
    // 根据token生成速度调整滚动速度
    const adaptedSpeed = Math.max(25, Math.min(200, currentTokenSpeed * 0.4));
    return adaptedSpeed;
  }, [calculateGenerationSpeed, baseScrollSpeed]);




  // 清理所有定时器和动画的函数
  const cleanupAll = useCallback(() => {
    if (speedUpdateTimerRef.current) {
      clearInterval(speedUpdateTimerRef.current);
      speedUpdateTimerRef.current = null;
    }
  }, []);

  // 重置状态（生成开始时）
  const resetState = useCallback(() => {
    // 先清理所有定时器和动画
    cleanupAll();
    
    setState(prev => ({
      ...prev,
      shouldShow: false,
      firstTokenTime: null,
      generationSpeed: 0,
      totalTokens: 0,
      generationStartTime: Date.now(),
      averageChunkSize: 0,
      chunkCount: 0,
      responseLatency: null
    }));
    
    prevContentRef.current = '';
    generationTimestampsRef.current = [];
    chunkTokenSizesRef.current = [];
  }, [cleanupAll]);

  // 监听生成状态变化
  useEffect(() => {
    if (isGenerating && state.generationStartTime === null) {
      console.log('🎬 [AdaptiveThinking] 开始生成，重置状态');
      resetState();
    } else if (!isGenerating && state.generationStartTime !== null) {
      console.log('🏁 [AdaptiveThinking] 生成结束，保持内容显示');
      // 生成结束时立即清理所有动画和定时器
      cleanupAll();
      
      // 确保内容保持显示状态，显示最终速度
      setState(prev => ({
        ...prev,
        shouldShow: true, // 强制保持显示
        generationSpeed: calculateGenerationSpeed(), // 计算最终速度
        scrollSpeed: 0 // 停止滚动
      }));
    }
  }, [isGenerating, resetState, state.generationStartTime, cleanupAll, calculateGenerationSpeed]);

  // 监听内容变化
  useEffect(() => {
    if (!isGenerating || !state.generationStartTime) return;

    const prevContent = prevContentRef.current;
    const newChunkText = content.substring(prevContent.length);
    
    if (newChunkText.length > 0) {
      const now = Date.now();
      
      const newChunkTokenCount = getTokenCount(newChunkText);
      
      // 记录首Token时间
      if (state.firstTokenTime === null) {
        const latency = now - state.generationStartTime;
        console.log('⚡ [AdaptiveThinking] 首Token到达，延迟:', latency, 'ms');
        
        setState(prev => ({
          ...prev,
          firstTokenTime: now,
          responseLatency: latency,
          showDelay: 0,
          // 真实内容到达即展示；等待态仅用于尚未收到 token 的阶段。
          shouldShow: true,
        }));
      }

      // 更新统计信息
      generationTimestampsRef.current.push(now);
      chunkTokenSizesRef.current.push(newChunkTokenCount);
      
      // 清理过期数据（保留最近10秒的数据，避免内存泄漏）
      const cutoffTime = now - 10000; // 10秒前
      while (generationTimestampsRef.current.length > 0 && 
             generationTimestampsRef.current[0] < cutoffTime) {
        generationTimestampsRef.current.shift();
        chunkTokenSizesRef.current.shift();
      }
      
      // 额外保护：最多保留50个数据点
      if (generationTimestampsRef.current.length > 50) {
        generationTimestampsRef.current.shift();
        chunkTokenSizesRef.current.shift();
      }

      const measuredGenerationSpeed = calculateGenerationSpeed();
      const newScrollSpeed = calculateScrollSpeed();
      const totalTokens = getTokenCount(content);
      
      setState(prev => ({
        ...prev,
        totalTokens: totalTokens,
        generationSpeed: prev.generationSpeed === 0
          ? measuredGenerationSpeed
          : prev.generationSpeed * 0.65 + measuredGenerationSpeed * 0.35,
        scrollSpeed: newScrollSpeed,
        chunkCount: prev.chunkCount + 1,
        averageChunkSize: chunkTokenSizesRef.current.reduce((a, b) => a + b, 0) / chunkTokenSizesRef.current.length
      }));
    }

    prevContentRef.current = content;
  }, [content, isGenerating, state.generationStartTime, state.firstTokenTime, calculateGenerationSpeed, calculateScrollSpeed]);

  // 定期更新生成速度（仅在生成中且已开始显示时运行）
  useEffect(() => {
    if (!isGenerating || !state.shouldShow || !state.generationStartTime) {
      if (speedUpdateTimerRef.current) {
        clearInterval(speedUpdateTimerRef.current);
        speedUpdateTimerRef.current = null;
      }
      return;
    }

    // 每秒更新一次速度显示
    speedUpdateTimerRef.current = setInterval(() => {
      const currentSpeed = calculateGenerationSpeed();
      const currentScrollSpeed = calculateScrollSpeed();
      
      setState(prev => {
        // 使用指数移动平均进行平滑处理，避免数值跳动
        const smoothingFactor = 0.3;
        const smoothedSpeed = prev.generationSpeed === 0 ? currentSpeed : 
          prev.generationSpeed * (1 - smoothingFactor) + currentSpeed * smoothingFactor;
        
        return {
          ...prev,
          generationSpeed: smoothedSpeed,
          scrollSpeed: currentScrollSpeed
        };
      });
    }, 1000);

    return () => {
      if (speedUpdateTimerRef.current) {
        clearInterval(speedUpdateTimerRef.current);
        speedUpdateTimerRef.current = null;
      }
    };
  }, [isGenerating, state.shouldShow, state.generationStartTime, calculateGenerationSpeed, calculateScrollSpeed]);

  // 清理函数
  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  // 获取性能统计信息
  const getPerformanceStats = useCallback(() => ({
    responseLatency: state.responseLatency,
    generationSpeed: state.generationSpeed,
    averageChunkSize: state.averageChunkSize,
    totalChunks: state.chunkCount,
    scrollSpeed: state.scrollSpeed,
    isOptimized: enableAdaptive
  }), [state, enableAdaptive]);

  return {
    // 显示控制
    shouldShow: state.shouldShow,
    showDelay: state.showDelay,
    
    // 滚动控制
    scrollSpeed: state.scrollSpeed,
    
    // 统计信息
    generationSpeed: state.generationSpeed,
    responseLatency: state.responseLatency,
    
    // 工具函数
    getPerformanceStats,
    resetState
  };
}
