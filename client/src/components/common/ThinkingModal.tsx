import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { ChevronDown, ChevronUp, Brain, Code, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { extractCleanCode } from '@/utils/codeCleaningUtils';
import { preserveThinkingContent } from '@/utils/thinkingContent';
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
                  {performanceStats.generationSpeed.toFixed(1)} Token/s
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
const processContent = (rawContent: string, type: 'thinking' | 'code' | 'analysis'): string => {
  if (!rawContent) return '';

  // 思考流可能包含未闭合的代码围栏或伪代码；将它交给代码提取器会丢失后续文本。
  if (type === 'thinking') return preserveThinkingContent(rawContent);
  
  // 使用统一的代码清理工具，但保持为展示用途的配置
  return extractCleanCode(rawContent, undefined, {
    removeCodeblocks: true,
    removeIntroText: false, // 展示时保留一些上下文
    trimWhitespace: true,
    preserveStructure: true,
    debugMode: false
  });
};

interface StreamSample {
  timestamp: number;
  characters: number;
}

interface DisplayState {
  settled: string;
  fadingLines: Array<{ id: number; text: string }>;
  trailing: string;
  trailingId: number | null;
  nextLineId: number;
}

const INITIAL_RELEASE_CHARACTERS = 40;
const RATE_SAMPLE_WINDOW_MS = 1_500;
const LINE_FADE_DURATION_MS = 140;
const MAX_TAIL_LINES = 3;

const splitCompleteLines = (content: string) => {
  const lastLineBreak = content.lastIndexOf('\n');
  if (lastLineBreak === -1) return { lines: [] as string[], trailing: content };

  return {
    lines: content.slice(0, lastLineBreak + 1).match(/[^\n]*\n/g) ?? [],
    trailing: content.slice(lastLineBreak + 1),
  };
};

// 分离内容组件：接收流式缓存，再根据队列压力和实际输入速率平滑释放。
const ThinkingContent = memo<{
  content: string;
  isExpanded: boolean;
  isGenerating: boolean;
  type: 'thinking' | 'code' | 'analysis';
}>(({ content, isExpanded, isGenerating, type }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedHeight, setExpandedHeight] = useState<number | null>(null);
  const [displayState, setDisplayState] = useState<DisplayState>({
    settled: '',
    fadingLines: [],
    trailing: '',
    trailingId: null,
    nextLineId: 0,
  });
  const receivedContentRef = useRef('');
  const displayedLengthRef = useRef(0);
  const sourceTypeRef = useRef(type);
  const streamSamplesRef = useRef<StreamSample[]>([]);
  const inputRateRef = useRef(0);
  const releaseRateRef = useRef(0);
  const fractionalCharactersRef = useRef(0);
  const playbackFrameRef = useRef<number | null>(null);
  const lastPlaybackTimestampRef = useRef<number | null>(null);
  const followsLatestRef = useRef(true);
  const lastProgrammaticScrollTopRef = useRef<number | null>(null);

  const processedContent = useMemo(() => processContent(content, type), [content, type]);
  const renderedContent = isGenerating
    ? `${displayState.settled}${displayState.fadingLines.map(({ text }) => text).join('')}${displayState.trailing}`
    : processedContent;

  const resetBuffer = useCallback((source: string, sourceType: typeof type) => {
    const initialLength = Math.min(source.length, INITIAL_RELEASE_CHARACTERS);
    const initialContent = source.slice(0, initialLength);
    const { lines, trailing } = splitCompleteLines(initialContent);
    receivedContentRef.current = source;
    displayedLengthRef.current = initialLength;
    sourceTypeRef.current = sourceType;
    streamSamplesRef.current = source.length ? [{ timestamp: performance.now(), characters: source.length }] : [];
    inputRateRef.current = 0;
    releaseRateRef.current = 0;
    fractionalCharactersRef.current = 0;
    lastPlaybackTimestampRef.current = null;
    setDisplayState((previous) => {
      const trailingId = trailing ? previous.nextLineId : null;
      return {
        settled: lines.join(''),
        fadingLines: [],
        trailing,
        trailingId,
        nextLineId: trailing ? previous.nextLineId + 1 : previous.nextLineId,
      };
    });
  }, []);

  const recordInput = useCallback((characters: number) => {
    if (!characters) return;
    const now = performance.now();
    const samples = streamSamplesRef.current;
    samples.push({ timestamp: now, characters });
    const cutoff = now - RATE_SAMPLE_WINDOW_MS;
    while (samples.length > 0 && samples[0].timestamp < cutoff) samples.shift();

    if (samples.length < 2) return;
    const totalCharacters = samples.reduce((total, sample) => total + sample.characters, 0);
    const durationMs = Math.max(1, now - samples[0].timestamp);
    const measuredRate = totalCharacters / (durationMs / 1_000);
    inputRateRef.current = inputRateRef.current === 0
      ? measuredRate
      : inputRateRef.current * 0.7 + measuredRate * 0.3;
  }, []);

  const releaseNextChunk = useCallback((timestamp: number) => {
    const source = receivedContentRef.current;
    const pending = source.length - displayedLengthRef.current;
    if (pending <= 0) {
      playbackFrameRef.current = null;
      lastPlaybackTimestampRef.current = null;
      return;
    }

    const lastTimestamp = lastPlaybackTimestampRef.current ?? timestamp;
    const elapsedSeconds = Math.max(0, (timestamp - lastTimestamp) / 1_000);
    lastPlaybackTimestampRef.current = timestamp;

    // 队列越长，目标消化时间越短；实际输入速率决定基础节奏。
    const desiredDrainSeconds = Math.max(0.1, Math.min(0.55, 0.55 - pending / 3_000));
    const pressureRate = pending / desiredDrainSeconds;
    const targetRate = Math.max(inputRateRef.current, pressureRate);
    releaseRateRef.current = releaseRateRef.current === 0
      ? targetRate
      : releaseRateRef.current * 0.72 + targetRate * 0.28;

    fractionalCharactersRef.current += releaseRateRef.current * elapsedSeconds;
    const releaseLength = Math.min(
      pending,
      Math.max(1, Math.floor(fractionalCharactersRef.current)),
    );
    fractionalCharactersRef.current -= releaseLength;

    const start = displayedLengthRef.current;
    const end = start + releaseLength;
    displayedLengthRef.current = end;
    setDisplayState((previous) => {
      const hadTrailingContent = Boolean(previous.trailing);
      const { lines, trailing } = splitCompleteLines(previous.trailing + source.slice(start, end));
      let nextLineId = previous.nextLineId;
      const completedLines = lines.map((text, index) => {
        if (index === 0 && hadTrailingContent && previous.trailingId !== null) {
          return { id: previous.trailingId, text };
        }

        const line = { id: nextLineId, text };
        nextLineId += 1;
        return line;
      });

      let trailingId: number | null = null;
      if (trailing) {
        if (lines.length === 0 && hadTrailingContent) {
          trailingId = previous.trailingId;
        } else {
          trailingId = nextLineId;
          nextLineId += 1;
        }
      }

      const nextFadingLines = [...previous.fadingLines, ...completedLines];
      const maxFadingLines = trailing ? MAX_TAIL_LINES - 1 : MAX_TAIL_LINES;
      const settledLineCount = Math.max(0, nextFadingLines.length - maxFadingLines);

      return {
        settled: previous.settled + nextFadingLines.slice(0, settledLineCount).map(({ text }) => text).join(''),
        fadingLines: nextFadingLines.slice(settledLineCount),
        trailing,
        trailingId,
        nextLineId,
      };
    });
    playbackFrameRef.current = requestAnimationFrame(releaseNextChunk);
  }, []);

  // 每个流式事件仅追加接收缓存；视觉层由独立 RAF 消费该缓存。
  useEffect(() => {
    if (!isGenerating) {
      if (playbackFrameRef.current) cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
      receivedContentRef.current = processedContent;
      displayedLengthRef.current = processedContent.length;
      setDisplayState((previous) => ({
        settled: processedContent,
        fadingLines: [],
        trailing: '',
        trailingId: null,
        nextLineId: previous.nextLineId,
      }));
      return;
    }

    // 首个增量时接收缓存为空，也必须初始化显示缓冲；否则 RAF 虽已排队，
    // 卡片会一直停留在等待态，直到流结束后才改为最终文本。
    const isNewStream = receivedContentRef.current.length === 0
      || sourceTypeRef.current !== type
      || !processedContent.startsWith(receivedContentRef.current);
    if (isNewStream) {
      resetBuffer(processedContent, type);
    } else {
      const receivedLength = receivedContentRef.current.length;
      const deltaLength = processedContent.length - receivedLength;
      if (deltaLength > 0) {
        receivedContentRef.current = processedContent;
        recordInput(deltaLength);
      }
    }

    if (playbackFrameRef.current === null && receivedContentRef.current.length > displayedLengthRef.current) {
      playbackFrameRef.current = requestAnimationFrame(releaseNextChunk);
    }
  }, [processedContent, isGenerating, recordInput, releaseNextChunk, resetBuffer, type]);

  useEffect(() => () => {
    if (playbackFrameRef.current) cancelAnimationFrame(playbackFrameRef.current);
  }, []);

  // 每次视觉释放后跟随真实内容底部，不引入额外像素速度。
  useEffect(() => {
    if (!isGenerating || isExpanded || !scrollRef.current || !followsLatestRef.current) return;

    const element = scrollRef.current;
    const frame = requestAnimationFrame(() => {
      if (followsLatestRef.current) {
        const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
        lastProgrammaticScrollTopRef.current = maxScrollTop;
        element.scrollTop = maxScrollTop;
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [displayState, isGenerating, isExpanded]);

  useEffect(() => {
    followsLatestRef.current = true;
    if (scrollRef.current) {
      lastProgrammaticScrollTopRef.current = 0;
      scrollRef.current.scrollTop = 0;
    }
  }, [isGenerating, type]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (lastProgrammaticScrollTopRef.current !== null
      && Math.abs(element.scrollTop - lastProgrammaticScrollTopRef.current) <= 0.5) {
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.clientHeight - element.scrollTop;
    followsLatestRef.current = distanceFromBottom <= 8;
  }, []);

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
  }, [isExpanded, renderedContent]);

  // 展开状态下自动滚动到底部
  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      const scrollElement = scrollRef.current;
      requestAnimationFrame(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      });
    }
  }, [renderedContent, isExpanded]);

  const contentNode = isGenerating ? (
    <>
      {displayState.settled}
      {displayState.fadingLines.map(({ id, text }) => (
        <motion.span
          key={id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: LINE_FADE_DURATION_MS / 1_000, ease: 'linear' }}
        >
          {text}
        </motion.span>
      ))}
      {displayState.trailing && (
        <motion.span
          key={displayState.trailingId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ duration: LINE_FADE_DURATION_MS / 1_000, ease: 'linear' }}
        >
          {displayState.trailing}
        </motion.span>
      )}
    </>
  ) : renderedContent;

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
        onScroll={handleScroll}
        className={isExpanded ? "p-4 max-h-96 overflow-y-auto" : "absolute inset-0 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}
      >
        {!renderedContent && isGenerating ? (
          <div className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono min-h-[120px] flex items-center justify-center">
            <div className="text-center">
              <div className="mb-2">⏳</div>
              <div>正在思考中...</div>
            </div>
          </div>
        ) : isExpanded ? (
          <pre className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono min-h-[120px]">
            {contentNode}
          </pre>
        ) : (
          <div className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono min-h-[120px]">
            {contentNode}
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
  enableAdaptive = true,
  showPerformanceStats = false,
  modelId
}) => {
  const [seconds, setSeconds] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 使用自适应thinking hook（增强版，支持容器尺寸感知）
  const { getPerformanceStats } = useAdaptiveThinking({
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

  // 组件初始化或重新显示时重置状态 - 只对生成中的modal重置
  useEffect(() => {
    if (isVisible && isGenerating) {
      setSeconds(0);
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
          isGenerating={isGenerating}
          type={type}
        />
      </div>
    </motion.div>
  );
};

export { ThinkingModal };
export type { ThinkingModalProps };
export default ThinkingModal;
