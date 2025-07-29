import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Copy, AlertCircle, MenuIcon, ChevronRight, ChevronDown, Wand2, RefreshCw, Check, ChevronLeft, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getSharedFileContent, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { ModernMarkdownViewer } from '@/components/ModernMarkdownViewer';
import { callOpenAIStream } from '@/lib/llmWrapper';

interface TocItem {
  id: string;
  title: string;
  level: number;
  hasChildren?: boolean;
}

export function ShareViewPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  const { config } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeHeading, setActiveHeading] = useState<string>('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [tocCollapsed, setTocCollapsed] = useState<boolean>(false);

  const fileUrl = shareId 
    ? `/api/s/${shareId}/file`
    : '';

  // 概览功能相关状态
  const [summaryContent, setSummaryContent] = useState<string>('');
  const [isAIProcessing, setIsAIProcessing] = useState<boolean>(false);
  const [showOverview, setShowOverview] = useState<boolean>(false);
  const [isSummaryStarted, setIsSummaryStarted] = useState(false);
  
  const summaryContainerRef = useRef<HTMLDivElement>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [tableOfContents, setTableOfContents] = useState<TocItem[]>([]);
  const isUserScrollingRef = useRef(false); // 标记用户是否在主动滚动
  const isProgrammaticScrollRef = useRef(false); // 标记是否为程序触发的滚动
  const [isMobileTocOpen, setIsMobileTocOpen] = useState(false); // 移动端目录打开状态

  // 从DOM中提取目录树 - 确保ID一致性
  const extractTableOfContentsFromDOM = useCallback((): TocItem[] => {
    if (!isMarkdownFile(shareInfo?.filename || '')) return [];

    const headings: TocItem[] = [];
    const headingElements = document.querySelectorAll('.markdown-viewer h1, .markdown-viewer h2, .markdown-viewer h3, .markdown-viewer h4, .markdown-viewer h5, .markdown-viewer h6');
    
    headingElements.forEach((element) => {
      const tagName = element.tagName.toLowerCase();
      const level = parseInt(tagName.charAt(1)); // h1 -> 1, h2 -> 2, etc.
      const title = element.textContent?.trim() || '';
      const id = element.id || `heading-${Math.random().toString(36).substr(2, 9)}`;
      
      // 如果元素没有ID，我们给它设置一个
      if (!element.id) {
        element.id = id;
      }
      
      headings.push({ id, title, level });
    });

    // 设置hasChildren属性
    headings.forEach((heading, index) => {
      const nextHeadings = headings.slice(index + 1);
      heading.hasChildren = nextHeadings.some(next => next.level > heading.level);
    });

    return headings;
  }, [shareInfo?.filename]);

  // 当markdown渲染完成后从DOM提取目录
  useEffect(() => {
    if (!fileContent) {
      setTableOfContents([]);
      return;
    }

    // 延迟执行，确保markdown已经渲染完成
    const timer = setTimeout(() => {
      const toc = extractTableOfContentsFromDOM();
      setTableOfContents(toc);
    }, 100);

    return () => clearTimeout(timer);
  }, [fileContent, extractTableOfContentsFromDOM]);

  // 检查是否是markdown文件
  const isMarkdownFile = (filename: string) => {
    return filename.toLowerCase().endsWith('.md') || filename.toLowerCase().endsWith('.txt');
  };

  // 跳转到标题
  const scrollToHeading = (id: string, isMobile = false) => {
    // 立即设置活动标题，并标记为程序滚动
    setActiveHeading(id);
    isUserScrollingRef.current = false; // 重置用户滚动状态
    isProgrammaticScrollRef.current = true; // 标记为程序触发的滚动
    
    // 如果是移动端，关闭目录
    if (isMobile) {
      setIsMobileTocOpen(false);
    }
    
    const doScroll = () => {
      const element = document.getElementById(id);
      if (element) {
        const headerHeight = 48;
        const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
        const offsetTop = elementTop - headerHeight - 20;
        
        window.scrollTo({
          top: offsetTop,
          behavior: 'instant'
        });
        
        // 延迟重置程序滚动标记，确保scroll事件处理完毕
        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 100);
      }
    };

    if (isMobile) {
      setTimeout(doScroll, 300);
    } else {
      doScroll();
    }
  };

  // 防抖函数
  const debounce = (func: (...args: any[]) => void, wait: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  // 滚动监听 - 处理活动标题高亮（仅在用户主动滚动时）
  useEffect(() => {
    if (tableOfContents.length === 0) return;

    let userScrollTimeout: NodeJS.Timeout;

    const handleScroll = debounce(() => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
      setScrollProgress(Math.min(progress, 1));

      // 只有在用户主动滚动时才更新active标题
      if (!isUserScrollingRef.current) {
        return;
      }

      // 查找当前可见的标题 - 考虑菜单栏高度
      const headings = document.querySelectorAll('.markdown-viewer h1, .markdown-viewer h2, .markdown-viewer h3, .markdown-viewer h4, .markdown-viewer h5, .markdown-viewer h6');
      const menuBarHeight = 48; // 菜单栏高度
      const visibleAreaTop = menuBarHeight + 20; // 菜单栏 + 一点间距
      
      let currentHeading = '';

      // 找到在可视区域顶部最近的标题
      for (const heading of Array.from(headings)) {
        const rect = heading.getBoundingClientRect();
        
        // 如果标题在可视区域顶部线以上（即已经滚动过去了）
        if (rect.top <= visibleAreaTop) {
          currentHeading = heading.id;
        } 
        // 如果没有标题在顶部线以上，选择第一个在可视区域内的标题
        else if (!currentHeading && rect.top > visibleAreaTop && rect.top < window.innerHeight) {
          currentHeading = heading.id;
          break;
        }
      }

      // 如果仍然没有找到，使用第一个标题
      if (!currentHeading && headings.length > 0) {
        currentHeading = headings[0].id;
      }

      if (currentHeading && currentHeading !== activeHeading) {
        setActiveHeading(currentHeading);
      }
    }, 100);

    // 检测用户是否开始滚动
    const handleUserScroll = () => {
      // 如果是程序触发的滚动，忽略
      if (isProgrammaticScrollRef.current) {
        return;
      }
      
      isUserScrollingRef.current = true;
      
      // 清除之前的超时
      if (userScrollTimeout) {
        clearTimeout(userScrollTimeout);
      }
      
      // 设置超时，在用户停止滚动一段时间后继续检测
      userScrollTimeout = setTimeout(() => {
        // 用户停止滚动后，继续保持检测状态
        // 不重置 isUserScrollingRef.current，让它保持为 true
      }, 150);
    };

    window.addEventListener('scroll', handleUserScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleUserScroll);
      window.removeEventListener('scroll', handleScroll);
      if (userScrollTimeout) {
        clearTimeout(userScrollTimeout);
      }
    };
  }, [tableOfContents, activeHeading]);

  // 生成内容概览
  const handleSummary = useCallback(async () => {
    if (!fileContent || isAIProcessing) return;
    
    setIsSummaryStarted(true);
    try {
      const content = fileContent.length > 20000 ? fileContent.substring(0, 20000) : fileContent;
      
      setIsAIProcessing(true);
      setSummaryContent('');

      const prompt = `${content}\n\n以上是一篇文档的内容，请为读者介绍这篇文档的一句话概要，结合emoji简要陈列文档的主要信息或观点，语言简洁明了。`;
      const messages = [{ role: 'user' as const, content: prompt }];
      
      await callOpenAIStream(
        messages,
        (chunk) => {
          setSummaryContent(prev => prev + chunk);
        },
        () => {
          setIsAIProcessing(false);
        },
        (error) => {
          setIsAIProcessing(false);
          toast({ title: '概览生成失败', description: error, variant: 'destructive' });
        }
      );
    } catch (error)
    {
      setIsAIProcessing(false);
      toast({ title: '概览生成失败', description: String(error), variant: 'destructive' });
    }
  }, [fileContent, isAIProcessing, toast]);

  useEffect(() => {
    if (showOverview && !isSummaryStarted) {
      handleSummary();
    }
  }, [showOverview, isSummaryStarted, handleSummary]);

  // 添加一个新的 useEffect 来处理滚动到最新内容
  useEffect(() => {
    if (summaryContent && summaryContainerRef.current) {
      summaryContainerRef.current.scrollTop = summaryContainerRef.current.scrollHeight;
    }
  }, [summaryContent]);


  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };


  useEffect(() => {
    if (!shareId) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }
    loadSharedFile(shareId);
  }, [shareId]);


  // 设置页面标题
  useEffect(() => {
    if (shareInfo?.filename) {
      let filename = shareInfo.filename.split('/').pop() || shareInfo.filename;
      // 移除文件扩展名
      filename = filename.replace(/\.(txt|md)$/i, '');
      document.title = filename;
    }
    return () => {
      document.title = 'OneShare'; // 清理时恢复默认标题
    };
  }, [shareInfo?.filename]);


  const loadSharedFile = async (shareId: string) => {
    try {
      setLoading(true);
      setError(null);
      const sharedFile = await getSharedFileContent(api, shareId);
      if (!sharedFile) {
        setError('分享链接不存在或已过期');
        return;
      }
      setShareInfo({ id: shareId, filename: sharedFile.filename, isPublic: sharedFile.isPublic, createdAt: sharedFile.createdAt });
      setFileContent(sharedFile.content);
    } catch (error) {
      console.error('加载分享文件失败:', error);
      setError(error instanceof Error ? error.message : '加载分享文件失败');
    } finally {
      setLoading(false);
    }
  };

  const copyFileContent = async () => {
    try {
      await navigator.clipboard.writeText(fileContent);
      toast({ title: '复制成功', description: '文件内容已复制到剪贴板' });
    } catch (error) {
      toast({ title: '复制失败', description: '无法复制文件内容', variant: 'destructive' });
    }
  };

  const downloadFile = () => {
    if (!shareInfo) return;
    const link = document.createElement('a');
    link.href = `${fileUrl}?download=1`;
    link.download = shareInfo.filename.split('/').pop() || shareInfo.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // 目录组件
  const TableOfContents = ({ items, className, isMobile = false }: { items: TocItem[]; className?: string; isMobile?: boolean }) => {
    if (items.length === 0) return null;

    // 过滤出应该显示的项目（考虑折叠状态）
    const visibleItems = items.filter((item, index) => {
      // 根级标题始终显示
      if (item.level === 1) return true;
      
      // 构建当前项目的完整祖先路径
      const ancestors: TocItem[] = [];
      let currentLevel = item.level;
      
      // 从当前项目向前查找所有祖先
      for (let i = index - 1; i >= 0; i--) {
        const potentialAncestor = items[i];
        
        // 如果找到一个层级更小的标题，且是当前寻找层级的直接父级
        if (potentialAncestor.level < currentLevel) {
          ancestors.unshift(potentialAncestor); // 添加到祖先列表开头
          currentLevel = potentialAncestor.level;
          
          // 如果已经到达根级，停止查找
          if (currentLevel === 1) {
            break;
          }
        }
      }
      
      // 检查祖先路径中是否有任何一个被折叠
      for (const ancestor of ancestors) {
        if (collapsedSections.has(ancestor.id)) {
          return false; // 任何祖先被折叠，都隐藏当前项目
        }
      }
      
      return true; // 没有祖先被折叠，显示
    });

    return (
      <nav className={cn(
        "space-y-0.5", 
        className?.includes('mobile-toc') && "space-y-0", // 移动端减少纵向间距
        className
      )}>
        {visibleItems.map((item) => {
          const isCollapsed = collapsedSections.has(item.id);
          
          return (
            <div key={item.id} className="flex items-start">
              {/* 折叠/展开按钮 */}
              {item.hasChildren && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection(item.id);
                  }}
                  className={cn(
                    "flex-shrink-0 p-1 hover:bg-muted/50 rounded transition-colors mt-0.5",
                    className?.includes('mobile-toc') && "p-1.5" // 移动端减少按钮padding
                  )}
                  style={{ marginLeft: `${(item.level - 1) * 16 + 8}px` }}
                >
                  {isCollapsed ? (
                    <ChevronRight className={cn("w-3 h-3", className?.includes('mobile-toc') && "w-4 h-4")} />
                  ) : (
                    <ChevronDown className={cn("w-3 h-3", className?.includes('mobile-toc') && "w-4 h-4")} />
                  )}
                </button>
              )}
              
              {/* 标题按钮 */}
              <button
                onClick={() => scrollToHeading(item.id, isMobile)}
                className={cn(
                  "flex-1 text-left px-3 py-1 text-sm rounded-md transition-colors break-words leading-relaxed",
                  activeHeading === item.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  item.level === 1 && "font-medium",
                  className?.includes('mobile-toc') && "py-1.5 text-base" // 移动端减少按钮padding
                )}
                style={{
                  marginLeft: item.hasChildren ? '0px' : `${(item.level - 1) * 20}px`
                }}
              >
                <span className="block break-words">{item.title}</span>
              </button>
            </div>
          );
        })}
      </nav>
    );
  };

  // 复制概览内容到剪贴板
  const copySummary = async () => {
    if (!summaryContent) return;

    try {
      await navigator.clipboard.writeText(summaryContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast({ title: '复制成功', description: '概览内容已复制到剪贴板' });
    } catch (error) {
      toast({ title: '复制失败', description: '无法复制概览内容', variant: 'destructive' });
    }
  };

  // 重新生成概览
  const regenerateSummary = () => {
    if (isAIProcessing) return;
    setSummaryContent('');
    handleSummary();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="text-muted-foreground">加载中...</span>
        </div>
      </div>
    );
  }

  if (error || !shareInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">无法访问文件</h2>
          <p className="text-muted-foreground mb-4">{error || '分享链接无效'}</p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background">
      {/* 顶部菜单栏 */}
      <header className="fixed top-0 left-0 right-0 z-40 h-12 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="h-full flex items-center px-4 relative overflow-hidden">
          {/* 移动端目录按钮 - 移到最左侧 */}
          {tableOfContents.length > 0 && (
            <div className="md:hidden mr-2">
              <Sheet open={isMobileTocOpen} onOpenChange={setIsMobileTocOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MenuIcon className="w-4 h-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[75vw] max-w-xs p-0">
                  <div className="flex flex-col h-full">
                    <div className="flex-shrink-0 p-4 border-b">
                      <h4 className="text-lg font-bold leading-none">目录</h4>
                    </div>
                    <ScrollArea className="flex-1 p-4">
                      <TableOfContents items={tableOfContents} className="mobile-toc" isMobile={true} />
                    </ScrollArea>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}

          {/* 桌面端网站名称，移动端隐藏 */}
          <div className="hidden md:flex items-center">
            <button 
              onClick={() => window.location.href = '/'}
              className="text-xl font-semibold text-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-2"
            >
              <Share2 size={20} />
              OneShare
            </button>
          </div>
          
          {/* 中间标题显示 - 居中 */}
          {shareInfo && (
            <div className="flex-1 flex items-center justify-center px-4">
              <span className="truncate text-sm font-medium text-foreground text-center">
                {shareInfo.filename.split('/').pop()?.replace(/\.(txt|md)$/i, '') || '文档'}
              </span>
            </div>
          )}

          {/* 右侧进度指示器 */}
          {scrollProgress > 0.05 && (
            <div className="flex items-center">
              <span className="text-xs text-muted-foreground">
                {Math.round(scrollProgress * 100)}%
              </span>
            </div>
          )}
        </div>
      </header>


      <div className="w-full max-w-screen-xl mx-auto pt-12 px-2 sm:px-4 lg:px-6">
        <div className={cn(
          "flex-1 items-start transition-all duration-500 ease-in-out",
          tocCollapsed 
            ? "md:grid md:grid-cols-[60px_minmax(0,1fr)]" 
            : "md:grid md:grid-cols-[280px_minmax(0,1fr)] lg:gap-6"
        )}>
          {/* 左侧目录 */}
          <aside className={cn(
            "fixed top-12 z-30 hidden h-[calc(100vh-3rem)] shrink-0 md:sticky md:top-12 md:h-[calc(100vh-3rem)] md:block transition-all duration-500 ease-in-out",
            tocCollapsed ? "w-[60px]" : "w-[280px]"
          )}>
            <div className="h-full overflow-hidden relative flex flex-col">
              {/* 收起/展开按钮 - 在收起状态时仍然可见 */}
              <div className="flex-shrink-0 py-2 lg:py-2 pr-2">
                <div className={cn(
                  "transition-all duration-500 ease-in-out",
                  tocCollapsed 
                    ? "flex justify-center" 
                    : "flex items-center justify-between pl-3 pr-1 mb-4"
                )}>
                  {!tocCollapsed && <h4 className="text-lg font-bold leading-none">目录</h4>}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTocCollapsed(!tocCollapsed)}
                    className="h-6 w-6 rounded-full bg-background/80 backdrop-blur border hover:bg-background/90 transition-all duration-500 ease-in-out flex-shrink-0"
                    title={tocCollapsed ? "展开目录" : "收起目录"}
                  >
                    {tocCollapsed ? (
                      <ChevronRight className="w-3 h-3" />
                    ) : (
                      <ChevronLeft className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>
              
              {/* 目录内容区 - 可滚动 */}
              <div className={cn(
                "flex-1 transition-all duration-500 ease-in-out transform pr-2",
                tocCollapsed 
                  ? "opacity-0 scale-95 translate-x-[-20px] pointer-events-none" 
                  : "opacity-100 scale-100 translate-x-0 overflow-y-auto scrollbar-hide"
              )}>
                {tableOfContents.length > 0 ? (
                  <TableOfContents items={tableOfContents} isMobile={false} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    无目录结构
                  </div>
                )}
              </div>
            </div>
          </aside>
          
          {/* 中间内容区 */}
          <main className="relative min-h-[calc(100vh-3rem)] transition-all duration-500 ease-in-out">
            <div className="w-full min-w-0 py-4 px-1 sm:py-6 sm:px-2 md:px-4 transition-all duration-500 ease-in-out">
              <div className="prose prose-sm sm:prose-base max-w-none">
                <ModernMarkdownViewer content={fileContent} />
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* 概览弹窗 */}
      {showOverview && (
        <div 
          className="fixed inset-0 z-40"
          onClick={() => setShowOverview(false)}
        >
          <div 
            className="fixed top-16 right-2 bottom-4 left-2 sm:left-auto sm:right-4 bg-background/80 dark:bg-slate-900/80 backdrop-blur-lg border dark:border-slate-700 rounded-2xl sm:w-[400px] sm:max-w-[90vw] shadow-2xl flex flex-col transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              ref={summaryContainerRef}
              className="p-4 flex-1 overflow-y-auto scrollbar-hide"
            >
              {!isSummaryStarted && (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  点击下方魔法棍生成概览
                </div>
              )}
              {isSummaryStarted && !summaryContent && isAIProcessing && (
                <div className="flex items-center gap-2 text-muted-foreground justify-center py-8">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
                  <span className="text-xs">AI 正在生成概览...</span>
                </div>
              )}
              {summaryContent && (
                <div className="prose prose-sm max-w-none dark:prose-invert text-slate-600 dark:text-slate-300 prose-headings:text-purple-600 dark:prose-headings:text-purple-400 text-[0.8rem] leading-relaxed pt-3">
                  <ModernMarkdownViewer content={summaryContent + (isAIProcessing ? ' ▊' : '')} className="overview-markdown" />
                </div>
              )}
            </div>
            
            {/* 浮动按钮组 */}
            {summaryContent && !isAIProcessing && (
              <div className="absolute top-3 right-3 flex space-x-2">
                <Button
                  onClick={copySummary}
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 border"
                >
                  {isCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </Button>
                <Button
                  onClick={regenerateSummary}
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 border"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 底部悬浮操作按钮 */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
        <div className="flex items-center gap-1 sm:gap-2 bg-background/95 backdrop-blur border rounded-full px-2 sm:px-3 py-1.5 shadow-lg">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={copyFileContent} 
            className="rounded-full h-8 px-2 sm:px-3 text-xs"
          >
            <Copy className="w-3 h-3 mr-0 sm:mr-1" />
            <span className="hidden sm:inline">复制</span>
          </Button>
          <div className="w-px h-3 bg-border"></div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={downloadFile} 
            className="rounded-full h-8 px-2 sm:px-3 text-xs"
          >
            <Download className="w-3 h-3 mr-0 sm:mr-1" />
            <span className="hidden sm:inline">下载</span>
          </Button>
          <div className="w-px h-3 bg-border"></div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowOverview(prev => !prev)}
            className="rounded-full h-8 px-2 sm:px-3 text-xs"
          >
            <Wand2 className="w-3 h-3 mr-0 sm:mr-1 text-purple-600" />
            <span className="hidden sm:inline">概览</span>
          </Button>
        </div>
      </div>


    </div>
  );
}