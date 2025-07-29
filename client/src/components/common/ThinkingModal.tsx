import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { ChevronDown, ChevronUp, Brain, Code, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { extractCleanCode } from '@/utils/codeCleaningUtils';

interface ThinkingModalProps {
  isVisible?: boolean;
  content?: string;
  title?: string;
  isGenerating?: boolean;
  type?: 'thinking' | 'code' | 'analysis';
  onExpandChange?: (expanded: boolean) => void;
  className?: string;
  enableSmoothScroll?: boolean; // 新增：是否启用丝滑滚动
}

// 分离头部组件 - 不依赖content，避免频繁重渲染
const ThinkingHeader = memo<{
  title: string;
  isGenerating: boolean;
  seconds: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  type: 'thinking' | 'code' | 'analysis';
}>(({ title, isGenerating, seconds, isExpanded, onToggleExpand, type }) => {
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

  return (
    <div className="flex items-center justify-between px-3 py-1 border-b border-border">
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
        <span className="text-sm font-medium text-foreground">
          {title} {isGenerating && `${seconds}秒`}
        </span>
      </div>
      
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleExpand();
        }}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm cursor-pointer bg-transparent border-none p-1"
        style={{ pointerEvents: 'auto', zIndex: 1000 }}
      >
        <span>{isExpanded ? '收起' : '展开'}</span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>
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
}>(({ content, isExpanded, scrollPosition, enableSmoothScroll, isGenerating }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedHeight, setExpandedHeight] = useState<number | null>(null);
  const prevContentLengthRef = useRef(0);
  
  // 内容预处理和延迟显示状态
  const [displayContent, setDisplayContent] = useState('');
  const [smoothScrollY, setSmoothScrollY] = useState(0);
  const [showContent, setShowContent] = useState(false);
  const startTimeRef = useRef<number>(0);
  const animationRef = useRef<number>(0);
  const smoothScrollStarted = useRef(false);
  
  // 预处理内容
  const processedContent = useMemo(() => processContent(content), [content]);

  // 重置状态当生成开始/结束时
  useEffect(() => {
    if (enableSmoothScroll) {
      if (isGenerating && !startTimeRef.current) {
        // 生成开始时重置状态
        console.log('🎬 ThinkingModal: 开始生成，重置状态');
        startTimeRef.current = Date.now();
        setShowContent(false);
        setDisplayContent('');
        smoothScrollStarted.current = false;
        setSmoothScrollY(0);

        // 2秒后开始显示内容
        const timer = setTimeout(() => {
          console.log('⏰ ThinkingModal: 2秒延迟结束，开始显示内容');
          setShowContent(true);
          smoothScrollStarted.current = true;
        }, 2000);

        return () => clearTimeout(timer);
      } else if (!isGenerating && startTimeRef.current) {
        // 生成结束时重置计时器，为下次生成做准备
        console.log('🏁 ThinkingModal: 生成结束，重置计时器');
        startTimeRef.current = 0;
      }
    }
  }, [enableSmoothScroll, isGenerating]);

  // 非启用模式的立即显示
  useEffect(() => {
    if (!enableSmoothScroll) {
      setShowContent(true);
      setDisplayContent(processedContent);
    }
  }, [processedContent, enableSmoothScroll]);

  // 内容更新和显示逻辑
  useEffect(() => {
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
  }, [processedContent, showContent, displayContent, enableSmoothScroll]);

  // 丝滑向上滚动动画引擎
  useEffect(() => {
    if (!enableSmoothScroll || !showContent || isExpanded || !smoothScrollStarted.current) {
      return;
    }

    const SCROLL_SPEED = 100; // 每秒向上移动100px
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
  }, [enableSmoothScroll, showContent, isExpanded, smoothScrollStarted.current]);

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
          transform: enableSmoothScroll && showContent 
            ? `translateY(-${smoothScrollY}px)` 
            : `translateY(-${scrollPosition}px)`
        } : undefined}
      >
        {!showContent && enableSmoothScroll ? (
          <div className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono min-h-[120px] flex items-center justify-center">
            <div className="text-center">
              <div className="mb-2">⏳</div>
              <div>等待内容生成...</div>
            </div>
          </div>
        ) : isExpanded ? (
          <pre className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono min-h-[120px]">
            {displayContent || ''}
          </pre>
        ) : (
          <div className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono min-h-[120px]">
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
  enableSmoothScroll = false
}) => {
  const [seconds, setSeconds] = useState(0);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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
  const prevContentRef = useRef('');
  
  useEffect(() => {
    if (!isGenerating || isExpanded || !content || !isVisible) return;
    
    // 只在内容增加时才滚动
    if (content.length > prevContentRef.current.length) {
      // 计算内容高度和滚动位置
      const lines = content.split('\n');
      const containerHeight = 160; // 更新后的收起高度
      const visibleLines = Math.floor(containerHeight / 20);
      
      // 如果内容超出可视区域，滚动到最新内容
      if (lines.length > visibleLines) {
        const targetScrollPosition = (lines.length - visibleLines) * 20;
        setScrollPosition(targetScrollPosition);
      }
    }
    
    prevContentRef.current = content;
  }, [content, isGenerating, isExpanded, isVisible]);

  // 组件初始化或重新显示时重置状态
  useEffect(() => {
    if (isVisible) {
      setScrollPosition(0);
      setSeconds(0);
      prevContentRef.current = '';
      setIsExpanded(false); // 重置展开状态
    }
  }, [isVisible]);

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
        />

        {/* 使用分离的内容组件 */}
        <ThinkingContent
          content={content}
          isExpanded={isExpanded}
          scrollPosition={scrollPosition}
          enableSmoothScroll={enableSmoothScroll}
          isGenerating={isGenerating}
        />
      </div>
    </motion.div>
  );
};

export { ThinkingModal };
export type { ThinkingModalProps };
export default ThinkingModal;