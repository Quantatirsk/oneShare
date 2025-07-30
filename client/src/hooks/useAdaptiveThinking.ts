import { useState, useEffect, useRef, useCallback } from 'react';
import { getTokenCount, calculateTokenDiff } from '@/utils/tokenCounter';

interface AdaptiveThinkingState {
  // 显示控制
  shouldShow: boolean;
  showDelay: number;
  
  // 内容生成统计
  firstTokenTime: number | null;
  generationSpeed: number; // token/秒
  totalTokens: number;
  generationStartTime: number | null;
  
  // 滚动控制
  scrollSpeed: number; // px/秒
  adaptiveScrollPosition: number;
  
  // 性能统计
  averageChunkSize: number; // token数量
  chunkCount: number;
  responseLatency: number | null;
}

interface UseAdaptiveThinkingOptions {
  content: string;
  isGenerating: boolean;
  enableAdaptive?: boolean;
  minShowDelay?: number;
  maxShowDelay?: number;
  baseScrollSpeed?: number;
  containerHeight?: number; // 新增：容器高度
  onContentHeightChange?: (height: number) => void; // 新增：内容高度变化回调
}

export function useAdaptiveThinking({
  content,
  isGenerating,
  enableAdaptive = true,
  minShowDelay = 500,
  maxShowDelay = 3000,
  baseScrollSpeed = 60,
  containerHeight = 160,
  onContentHeightChange
}: UseAdaptiveThinkingOptions) {
  const [state, setState] = useState<AdaptiveThinkingState>({
    shouldShow: false,
    showDelay: 2000,
    firstTokenTime: null,
    generationSpeed: 0,
    totalTokens: 0,
    generationStartTime: null,
    scrollSpeed: baseScrollSpeed,
    adaptiveScrollPosition: 0,
    averageChunkSize: 0,
    chunkCount: 0,
    responseLatency: null
  });

  // 用于跟踪内容变化的引用
  const prevContentRef = useRef<string>('');
  const generationTimestampsRef = useRef<number[]>([]);
  const chunkTokenSizesRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const showTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speedUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 计算生成速度 - 使用滑动窗口计算实时token速度
  const calculateGenerationSpeed = useCallback(() => {
    const timestamps = generationTimestampsRef.current;
    const chunkTokenSizes = chunkTokenSizesRef.current;
    
    if (timestamps.length < 2 || chunkTokenSizes.length < 2) return 0;
    
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
        totalTokens += chunkTokenSizes[i];
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

  // 智能延迟计算
  const calculateShowDelay = useCallback((firstTokenLatency: number): number => {
    if (!enableAdaptive) return 2000;

    // 根据首Token延迟时间动态调整显示延迟
    if (firstTokenLatency <= 1000) {
      return minShowDelay; // 快速响应：立即显示
    } else if (firstTokenLatency <= 3000) {
      return Math.min(firstTokenLatency * 0.5, 1500); // 中等响应：延迟一半时间
    } else {
      return Math.min(maxShowDelay, firstTokenLatency * 0.3); // 慢速响应：延迟30%时间
    }
  }, [enableAdaptive, minShowDelay, maxShowDelay]);

  // 动态滚动速度计算
  const calculateScrollSpeed = useCallback(() => {
    const currentTokenSpeed = calculateGenerationSpeed();
    
    if (currentTokenSpeed === 0) return baseScrollSpeed;
    
    // 根据token生成速度调整滚动速度
    // token速度通常比字符速度小，所以需要调整系数
    // 假设平均1个token ≈ 3.5个字符，调整滚动速度映射
    const adaptedSpeed = Math.max(30, Math.min(150, currentTokenSpeed * 2.0));
    return adaptedSpeed;
  }, [calculateGenerationSpeed, baseScrollSpeed]);

  // 清理所有定时器和动画的函数
  const cleanupAll = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (speedUpdateTimerRef.current) {
      clearInterval(speedUpdateTimerRef.current);
      speedUpdateTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
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
      adaptiveScrollPosition: 0,
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
        scrollSpeed: 0, // 停止滚动
        adaptiveScrollPosition: prev.adaptiveScrollPosition // 保持当前滚动位置
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
      
      // 计算新增内容的token数量
      const newChunkTokenCount = calculateTokenDiff(prevContent, content);
      
      // 记录首Token时间
      if (state.firstTokenTime === null) {
        const latency = now - state.generationStartTime;
        console.log('⚡ [AdaptiveThinking] 首Token到达，延迟:', latency, 'ms');
        
        const showDelay = calculateShowDelay(latency);
        console.log('📅 [AdaptiveThinking] 计算显示延迟:', showDelay, 'ms');
        
        setState(prev => ({
          ...prev,
          firstTokenTime: now,
          responseLatency: latency,
          showDelay
        }));

        // 设置显示定时器
        showTimerRef.current = setTimeout(() => {
          console.log('✨ [AdaptiveThinking] 开始显示内容');
          setState(prev => ({ ...prev, shouldShow: true }));
        }, showDelay);
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

      const newGenerationSpeed = calculateGenerationSpeed();
      const newScrollSpeed = calculateScrollSpeed();
      const totalTokens = getTokenCount(content);
      
      setState(prev => ({
        ...prev,
        totalTokens: totalTokens,
        generationSpeed: newGenerationSpeed,
        scrollSpeed: newScrollSpeed,
        chunkCount: prev.chunkCount + 1,
        averageChunkSize: chunkTokenSizesRef.current.reduce((a, b) => a + b, 0) / chunkTokenSizesRef.current.length
      }));
    }

    prevContentRef.current = content;
  }, [content, isGenerating, state.generationStartTime, state.firstTokenTime, calculateShowDelay, calculateGenerationSpeed, calculateScrollSpeed]);

  // 定期更新生成速度（仅在生成中且已开始显示时运行）
  useEffect(() => {
    if (!isGenerating || !state.shouldShow || !state.generationStartTime) {
      if (speedUpdateTimerRef.current) {
        clearInterval(speedUpdateTimerRef.current);
        speedUpdateTimerRef.current = null;
      }
      return;
    }

    // 每2.5秒更新一次速度显示，减少频繁更新导致的频闪
    speedUpdateTimerRef.current = setInterval(() => {
      const currentSpeed = calculateGenerationSpeed();
      const currentScrollSpeed = calculateScrollSpeed();
      
      setState(prev => {
        // 使用更保守的指数移动平均进行平滑处理，避免数值跳动
        const smoothingFactor = 0.2;
        const smoothedSpeed = prev.generationSpeed === 0 ? currentSpeed : 
          prev.generationSpeed * (1 - smoothingFactor) + currentSpeed * smoothingFactor;
        
        // 只有当速度变化超过15%时才更新滚动速度，避免微小变化导致频闪
        const speedChangeThreshold = 0.15;
        const speedDiff = Math.abs(currentScrollSpeed - prev.scrollSpeed) / Math.max(prev.scrollSpeed, 1);
        const shouldUpdateScrollSpeed = speedDiff > speedChangeThreshold;
        
        return {
          ...prev,
          generationSpeed: smoothedSpeed,
          scrollSpeed: shouldUpdateScrollSpeed ? currentScrollSpeed : prev.scrollSpeed
        };
      });
    }, 2500);

    return () => {
      if (speedUpdateTimerRef.current) {
        clearInterval(speedUpdateTimerRef.current);
        speedUpdateTimerRef.current = null;
      }
    };
  }, [isGenerating, state.shouldShow, state.generationStartTime, calculateGenerationSpeed, calculateScrollSpeed]);

  // 增强的自适应滚动动画（支持容器尺寸感知）
  useEffect(() => {
    if (!state.shouldShow || !isGenerating || state.scrollSpeed === 0) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    let lastTime = Date.now();
    
    const animate = () => {
      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000; // 转换为秒
      lastTime = now;

      setState(prev => {
        // 计算基础滚动增量
        const scrollDelta = prev.scrollSpeed * deltaTime;
        let newScrollPosition = prev.adaptiveScrollPosition + scrollDelta;
        
        // 如果有内容高度回调，通知外部组件当前的滚动状态
        if (onContentHeightChange && content) {
          // 估算当前内容应该占用的高度
          const estimatedLines = content.split('\n').length;
          const estimatedHeight = estimatedLines * 14; // 基于字体大小的估算
          
          // 如果内容高度超过容器高度，调整滚动位置
          if (estimatedHeight > containerHeight) {
            const maxScroll = estimatedHeight - containerHeight;
            newScrollPosition = Math.min(newScrollPosition, maxScroll);
          } else {
            newScrollPosition = 0; // 内容不足容器高度时不滚动
          }
        }
        
        return {
          ...prev,
          adaptiveScrollPosition: Math.max(0, newScrollPosition)
        };
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [state.shouldShow, isGenerating, state.scrollSpeed, state.generationStartTime, containerHeight, onContentHeightChange, content]);

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
    scrollPosition: state.adaptiveScrollPosition,
    scrollSpeed: state.scrollSpeed,
    
    // 统计信息
    generationSpeed: state.generationSpeed,
    responseLatency: state.responseLatency,
    
    // 工具函数
    getPerformanceStats,
    resetState
  };
}