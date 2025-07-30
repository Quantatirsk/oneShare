import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { ChevronDown, ChevronUp, Brain, Code, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { extractCleanCode } from '@/utils/codeCleaningUtils';
import { useAdaptiveThinking } from '@/hooks/useAdaptiveThinking';
import { Badge } from '@/components/ui/badge';

interface ThinkingModalProps {
  isVisible?: boolean;
  content?: string;
  title?: string;
  isGenerating?: boolean;
  type?: 'thinking' | 'code' | 'analysis';
  onExpandChange?: (expanded: boolean) => void;
  className?: string;
  enableSmoothScroll?: boolean; // 是否启用丝滑滚动
  enableAdaptive?: boolean; // 新增：是否启用自适应功能
  showPerformanceStats?: boolean; // 新增：是否显示性能统计
  modelId?: string; // 新增：LLM模型ID
}

// 分离头部组件 - 不依赖content，避免频繁重渲染
const ThinkingHeader = memo<{
  title: string;
  isGenerating: boolean;
  seconds: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  type: 'thinking' | 'code' | 'analysis';
  showPerformanceStats?: boolean;
  modelId?: string;
  performanceStats?: {
    responseLatency: number | null;
    generationSpeed: number;
    averageChunkSize: number;
    totalChunks: number;
    scrollSpeed: number;
    isOptimized: boolean;
  };
}>(({ title, isGenerating, seconds, isExpanded, onToggleExpand, type, showPerformanceStats, modelId, performanceStats }) => {
  // 获取图标和主题 - shadcn黑白灰配色
  const getTypeConfig = () => {
    switch (type) {
      case 'code':
        return {
          icon: Code,
          color: 'text-foreground',
          pulseColor: 'bg-foreground'
        };
      case 'analysis':
        return {
          icon: Zap,
          color: 'text-foreground',
          pulseColor: 'bg-foreground'
        };
      default:
        return {
          icon: Brain,
          color: 'text-foreground',
          pulseColor: 'bg-foreground'
        };
    }
  };

  const config = getTypeConfig();
  const IconComponent = config.icon;

  // 清理模型ID，移除前缀部分（如 "google/" -> ""）
  const cleanModelId = (id: string) => {
    const slashIndex = id.lastIndexOf('/');
    return slashIndex !== -1 ? id.substring(slashIndex + 1) : id;
  };

  return (
    <div className="border-b border-border">
      <div className="relative flex items-center justify-between px-3 py-1">
        <div className="flex items-center gap-3">
          <div className="relative">
            <IconComponent className={cn("w-4 h-4", config.color)} />
            {isGenerating && (
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.7, 1, 0.7]
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className={cn(
                  "absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full",
                  config.pulseColor
                )}
              />
            )}
          </div>
          <span className="text-xs font-medium text-foreground">
            {isGenerating ? `${title} ${seconds}s` : '完成'}
          </span>
        </div>
        
        {/* 绝对定位的中间模型ID - 不受左右内容变化影响 */}
        {modelId && (
          <div className="absolute left-1/2 top-0 bottom-0 flex items-center justify-center transform -translate-x-1/2 pointer-events-none max-w-[160px] sm:max-w-[180px]">
            <Badge variant="default" className="text-[10px] font-mono px-1 py-0 truncate max-w-full">
              {cleanModelId(modelId)}
            </Badge>
          </div>
        )}
        
        <div className="flex items-center gap-2">
          {showPerformanceStats && performanceStats && (
            <div className="text-[10px] text-muted-foreground whitespace-nowrap">
              {performanceStats.generationSpeed > 0 && (
                <span>
                  {performanceStats.generationSpeed.toFixed(1)} TPS
                </span>
              )}
            </div>
          )}
          
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleExpand();
            }}
            className="flex items-center text-muted-foreground hover:text-foreground transition-colors text-sm cursor-pointer bg-transparent border-none p-1"
            style={{ pointerEvents: 'auto', zIndex: 1000 }}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

ThinkingHeader.displayName = 'ThinkingHeader';

// 内容预处理函数 - 使用统一的代码清理工具
const processContent = (rawContent: string): string => {
  if (!rawContent) return '';
  
  // 使用统一的代码清理工具，但保持为展示用途的配置
  return extractCleanCode(rawContent, undefined, {
    removeCodeblocks: true,
    removeIntroText: false, // 展示时保留一些上下文
    trimWhitespace: true,
    preserveStructure: true,
    debugMode: false
  });
};

// 分离内容组件 - 只在展开状态或内容变化时重渲染
const ThinkingContent = memo<{
  content: string;
  isExpanded: boolean;
  scrollPosition: number;
  enableSmoothScroll: boolean;
  isGenerating: boolean;
  enableAdaptive: boolean;
  adaptiveScrollPosition: number;
  adaptiveShouldShow: boolean;
}>(({ content, isExpanded, scrollPosition: _scrollPosition, enableSmoothScroll, isGenerating, enableAdaptive, adaptiveScrollPosition, adaptiveShouldShow }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentElement, setContentElement] = useState<HTMLElement | null>(null); // 新增：使用 state 来存储内容元素引用
  const [expandedHeight, setExpandedHeight] = useState<number | null>(null);
  const prevContentLengthRef = useRef(0);
  
  // 新增：响应式滚动状态
  const [responsiveScrollPosition, setResponsiveScrollPosition] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  
  // 内容预处理和延迟显示状态
  const [displayContent, setDisplayContent] = useState('');
  const [smoothScrollY, setSmoothScrollY] = useState(0);
  const [showContent, setShowContent] = useState(false);
  const startTimeRef = useRef<number>(0);
  const animationRef = useRef<number>(0);
  const smoothScrollStarted = useRef(false);

  // 新增：计算实际内容高度的函数
  const calculateActualContentHeight = useCallback(() => {
    if (!contentElement) return 0;
    return contentElement.scrollHeight;
  }, [contentElement]);

  // 新增：基于实际DOM测量计算滚动位置
  const calculateResponsiveScrollPosition = useCallback(() => {
    if (!containerRef.current || !contentElement || isExpanded) return 0;
    
    const containerHeight = 160; // 固定容器高度
    const contentHeight = calculateActualContentHeight();
    
    // 如果内容高度小于等于容器高度，不需要滚动
    if (contentHeight <= containerHeight) return 0;
    
    // 滚动到底部，显示最新内容
    const maxScrollPosition = contentHeight - containerHeight;
    return Math.max(0, maxScrollPosition);
  }, [calculateActualContentHeight, contentElement, isExpanded]);

  // 智能选择显示模式和滚动位置
  const shouldShowContent = enableAdaptive ? adaptiveShouldShow : showContent;
  
  // 智能滚动位置选择：优先使用响应式计算，在不可用时回退到其他模式
  const currentScrollPosition = useMemo(() => {
    if (enableAdaptive) {
      // 自适应模式：使用自适应滚动位置，但在容器宽度变化时可能需要调整
      return adaptiveScrollPosition;
    } else if (enableSmoothScroll) {
      // 平滑滚动模式
      return smoothScrollY;
    } else {
      // 响应式模式：基于实际DOM测量
      return responsiveScrollPosition;
    }
  }, [enableAdaptive, enableSmoothScroll, adaptiveScrollPosition, smoothScrollY, responsiveScrollPosition]);
  
  // 预处理内容
  const processedContent = useMemo(() => processContent(content), [content]);

  // 新增：监听容器宽度变化
  useEffect(() => {
    if (!containerRef.current) return;
    
    // 初始化 ResizeObserver
    resizeObserverRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        
        // 宽度变化时重新计算滚动位置
        if (newWidth !== containerWidth) {
          setContainerWidth(newWidth);
          
          // 延迟重新计算，确保DOM更新完成
          requestAnimationFrame(() => {
            const newScrollPosition = calculateResponsiveScrollPosition();
            setResponsiveScrollPosition(newScrollPosition);
          });
        }
      }
    });
    
    resizeObserverRef.current.observe(containerRef.current);
    
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [containerWidth, calculateResponsiveScrollPosition]);

  // 新增：内容变化时更新响应式滚动位置
  useEffect(() => {
    if (!enableAdaptive && !enableSmoothScroll && contentElement) {
      // 延迟计算，确保内容渲染完成
      const timeoutId = setTimeout(() => {
        const newScrollPosition = calculateResponsiveScrollPosition();
        setResponsiveScrollPosition(newScrollPosition);
      }, 0);
      
      return () => clearTimeout(timeoutId);
    }
  }, [displayContent, enableAdaptive, enableSmoothScroll, calculateResponsiveScrollPosition, contentElement]);

  // 新增：统一的滚动位置重置（生成开始时）
  useEffect(() => {
    if (isGenerating && !enableAdaptive) {
      // 非自适应模式下重置滚动位置
      setResponsiveScrollPosition(0);
      if (!enableSmoothScroll) {
        setSmoothScrollY(0);
      }
    }
  }, [isGenerating, enableAdaptive, enableSmoothScroll]);

  // 重置状态当生成开始/结束时 - 仅在非自适应模式下使用
  useEffect(() => {
    if (enableSmoothScroll && !enableAdaptive) {
      if (isGenerating && !startTimeRef.current) {
        // 生成开始时重置状态，立即显示内容
        console.log('🎬 ThinkingModal: 开始生成，重置状态');
        startTimeRef.current = Date.now();
        setShowContent(true); // 立即显示内容，不再延迟
        setDisplayContent('');
        smoothScrollStarted.current = true; // 立即启动滚动
        setSmoothScrollY(0);
      } else if (!isGenerating && startTimeRef.current) {
        // 生成结束时重置计时器，为下次生成做准备
        console.log('🏁 ThinkingModal: 生成结束，重置计时器');
        startTimeRef.current = 0;
      }
    }
  }, [enableSmoothScroll, enableAdaptive, isGenerating]);

  // 非启用模式的立即显示
  useEffect(() => {
    if (!enableSmoothScroll && !enableAdaptive) {
      setShowContent(true);
      setDisplayContent(processedContent);
    }
  }, [processedContent, enableSmoothScroll, enableAdaptive]);

  // 内容更新和显示逻辑 - 仅在非自适应模式下使用
  useEffect(() => {
    if (enableAdaptive) {
      // 自适应模式下直接显示处理后的内容
      setDisplayContent(processedContent);
      return;
    }
    
    if (!showContent || !enableSmoothScroll) {
      setDisplayContent(processedContent);
      return;
    }

    // 逐步显示内容（字符级动画）
    if (processedContent.length > displayContent.length) {
      const targetLength = Math.min(
        displayContent.length + Math.ceil(processedContent.length / 100), // 每次增加1%的内容
        processedContent.length
      );
      
      const timer = setTimeout(() => {
        setDisplayContent(processedContent.slice(0, targetLength));
      }, 50);

      return () => clearTimeout(timer);
    } else {
      setDisplayContent(processedContent);
    }
  }, [processedContent, showContent, displayContent, enableSmoothScroll, enableAdaptive]);

  // 丝滑向上滚动动画引擎 - 仅在非自适应模式下使用
  useEffect(() => {
    if (enableAdaptive || !enableSmoothScroll || !showContent || isExpanded || !smoothScrollStarted.current) {
      return;
    }

    const SCROLL_SPEED = 70; // 每秒向上移动70px，降低滚动速度减少频闪
    let lastTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000; // 转换为秒
      lastTime = now;

      setSmoothScrollY(prevY => {
        const newY = prevY + (SCROLL_SPEED * deltaTime);
        return newY;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [enableAdaptive, enableSmoothScroll, showContent, isExpanded, smoothScrollStarted.current]);

  // 监听展开状态变化，记录完全展开时的高度
  useEffect(() => {
    if (isExpanded && containerRef.current) {
      // 等待DOM更新后测量高度
      setTimeout(() => {
        if (containerRef.current) {
          const height = containerRef.current.scrollHeight;
          setExpandedHeight(height);
        }
      }, 0);
    }
  }, [isExpanded, displayContent]);

  // 展开状态下自动滚动到底部
  useEffect(() => {
    if (isExpanded && scrollRef.current && displayContent.length > prevContentLengthRef.current) {
      const scrollElement = scrollRef.current;
      // 使用 requestAnimationFrame 确保DOM更新后再滚动
      requestAnimationFrame(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      });
    }
    prevContentLengthRef.current = displayContent.length;
  }, [displayContent, isExpanded]);

  return (
    <motion.div 
      ref={containerRef}
      className="relative overflow-hidden"
      initial={{ height: 160 }}
      animate={{
        height: isExpanded ? (expandedHeight || "auto") : 160
      }}
      transition={{
        duration: 0.3,
        ease: "easeInOut"
      }}
    >
      {!isExpanded && (
        <>
          {/* 上方渐变遮罩 - 仅收起时显示 */}
          <div className="absolute inset-x-0 top-0 h-8 z-10 pointer-events-none bg-gradient-to-b from-card to-transparent" />
          
          {/* 下方渐变遮罩 - 仅收起时显示 */}
          <div className="absolute inset-x-0 bottom-0 h-8 z-10 pointer-events-none bg-gradient-to-t from-card to-transparent" />
        </>
      )}
      
      {/* 内容容器 */}
      <div 
        ref={scrollRef}
        className={isExpanded ? "p-4 max-h-96 overflow-y-auto" : "absolute inset-0 p-4"}
        style={!isExpanded ? {
          transform: `translateY(-${currentScrollPosition}px)`
        } : undefined}
      >
        {!shouldShowContent && (enableSmoothScroll || enableAdaptive) ? (
          <div className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono min-h-[120px] flex items-center justify-center">
            <div className="text-center">
              <div className="mb-2">⏳</div>
              <div>正在思考中...</div>
            </div>
          </div>
        ) : isExpanded ? (
          <pre 
            ref={setContentElement}
            className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono min-h-[120px]"
          >
            {displayContent || ''}
          </pre>
        ) : (
          <div 
            ref={setContentElement}
            className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono min-h-[120px]"
          >
            {displayContent || ''}
          </div>
        )}
      </div>
    </motion.div>
  );
});

ThinkingContent.displayName = 'ThinkingContent';

const ThinkingModal: React.FC<ThinkingModalProps> = ({
  isVisible = true,
  content = '',
  title = '正在思考',
  isGenerating = true,
  type = 'thinking',
  onExpandChange,
  className,
  enableSmoothScroll = false,
  enableAdaptive = true,
  showPerformanceStats = false,
  modelId
}) => {
  const [seconds, setSeconds] = useState(0);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 使用自适应thinking hook（增强版，支持容器尺寸感知）
  const {
    shouldShow: adaptiveShouldShow,
    scrollPosition: adaptiveScrollPosition,
    getPerformanceStats
  } = useAdaptiveThinking({
    content,
    isGenerating,
    enableAdaptive,
    baseScrollSpeed: 80 // 恢复到基础速度
  });

  // 获取性能统计信息
  const performanceStats = showPerformanceStats ? getPerformanceStats() : undefined;

  // 优化的展开切换函数，减少重渲染
  const handleToggleExpand = useCallback(() => {
    setIsExpanded(prev => {
      const newExpanded = !prev;
      if (onExpandChange) {
        onExpandChange(newExpanded);
      }
      return newExpanded;
    });
  }, [onExpandChange]);

  // 计时器效果
  useEffect(() => {
    if (!isGenerating || !isVisible) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    
    intervalRef.current = setInterval(() => {
      setSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isGenerating, isVisible]);

  // 流式内容显示和滚动 - 仅处理收起状态
  // 注意：此逻辑现在主要用于非自适应模式，自适应模式在 ThinkingContent 中处理
  const prevContentRef = useRef('');
  
  useEffect(() => {
    if (!isGenerating || isExpanded || !content || !isVisible || enableAdaptive) return;
    
    // 只在内容增加时才滚动
    if (content.length > prevContentRef.current.length) {
      // 备用滚动逻辑：如果 DOM 测量不可用，回退到估算方法
      const lines = content.split('\n');
      const containerHeight = 160;
      const estimatedLineHeight = 14; // 更精确的行高估算（基于 text-[10px] 和 leading-relaxed）
      const visibleLines = Math.floor(containerHeight / estimatedLineHeight);
      
      // 如果内容超出可视区域，滚动到最新内容
      if (lines.length > visibleLines) {
        const targetScrollPosition = (lines.length - visibleLines) * estimatedLineHeight;
        setScrollPosition(targetScrollPosition);
      }
    }
    
    prevContentRef.current = content;
  }, [content, isGenerating, isExpanded, isVisible, enableAdaptive]);

  // 组件初始化或重新显示时重置状态 - 只对生成中的modal重置
  useEffect(() => {
    if (isVisible && isGenerating) {
      setScrollPosition(0);
      setSeconds(0);
      prevContentRef.current = '';
      setIsExpanded(false); // 重置展开状态
    }
  }, [isVisible, isGenerating]);

  if (!isVisible) {
    return null;
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "w-full max-w-4xl mx-auto thinking-modal",
        className
      )}
    >
      <div className="relative overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
        {/* 动态边框光效 */}
        <motion.div
          animate={{
            opacity: [0.3, 0.7, 0.3]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute inset-0 rounded-lg border border-muted-foreground/20"
        />

        {/* 使用分离的头部组件 */}
        <ThinkingHeader
          title={title}
          isGenerating={isGenerating}
          seconds={seconds}
          isExpanded={isExpanded}
          onToggleExpand={handleToggleExpand}
          type={type}
          showPerformanceStats={showPerformanceStats}
          modelId={modelId}
          performanceStats={performanceStats}
        />

        {/* 使用分离的内容组件 */}
        <ThinkingContent
          content={content}
          isExpanded={isExpanded}
          scrollPosition={scrollPosition}
          enableSmoothScroll={enableSmoothScroll}
          isGenerating={isGenerating}
          enableAdaptive={enableAdaptive}
          adaptiveScrollPosition={adaptiveScrollPosition}
          adaptiveShouldShow={adaptiveShouldShow}
        />
      </div>
    </motion.div>
  );
};

export { ThinkingModal };
export type { ThinkingModalProps };
export default ThinkingModal;