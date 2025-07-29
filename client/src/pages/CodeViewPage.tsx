import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Copy, AlertCircle, Wand2, RefreshCw, Check, Eye, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getSharedFileContent, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { ModernMarkdownViewer } from '@/components/ModernMarkdownViewer';
import { callOpenAIStream } from '@/lib/llmWrapper';
import Editor from '@monaco-editor/react';
import { loader } from '@monaco-editor/react';

export function CodeViewPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  const { config } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fileUrl = shareId 
    ? `/api/s/${shareId}/file`
    : '';

  // AI功能相关状态
  const [summaryContent, setSummaryContent] = useState<string>('');
  const [isAIProcessing, setIsAIProcessing] = useState<boolean>(false);
  const [showOverview, setShowOverview] = useState<boolean>(false);
  const [isSummaryStarted, setIsSummaryStarted] = useState(false);
  
  const summaryContainerRef = useRef<HTMLDivElement>(null);
  const [isCopied, setIsCopied] = useState(false);
  const editorRef = useRef<any>(null);

  // 设置Monaco Editor主题
  useEffect(() => {
    loader.init().then((monaco) => {
      // 确保始终使用vs主题
      monaco.editor.setTheme('vs-dark');
    });
  }, []);

  // 当编辑器挂载时保存引用并设置主题
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    // 强制设置为黑色主题
    monaco.editor.setTheme('vs-dark');
  };

  // 获取编程语言类型
  const getLanguageFromFilename = (filename: string): string => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'sql': 'sql',
      'php': 'php',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'sh': 'shell',
      'bash': 'shell',
      'dockerfile': 'dockerfile',
      'vue': 'vue',
      'svelte': 'svelte',
      'r': 'r',
      'matlab': 'matlab',
      'm': 'matlab'
    };
    return languageMap[ext] || 'plaintext';
  };

  // 生成代码分析
  const handleSummary = useCallback(async () => {
    if (!fileContent || isAIProcessing) return;
    
    setIsSummaryStarted(true);
    try {
      const content = fileContent.length > 20000 ? fileContent.substring(0, 20000) : fileContent;
      const language = getLanguageFromFilename(shareInfo?.filename || '');
      
      setIsAIProcessing(true);
      setSummaryContent('');

      const prompt = `以下是一个${language}代码文件的内容：\n\n${content}\n\n请分析这个代码文件，提供以下信息：\n1. **代码概述**：简要说明这个文件的主要功能和用途\n2. **核心功能**：列出主要的函数、类或模块\n3. **技术栈**：识别所使用的框架、库或技术\n4. **代码结构**：描述代码的组织方式和架构模式\n5. **关键逻辑**：解释重要的业务逻辑或算法`;
      
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
          toast({ title: '代码分析失败', description: error, variant: 'destructive' });
        }
      );
    } catch (error) {
      setIsAIProcessing(false);
      toast({ title: '代码分析失败', description: String(error), variant: 'destructive' });
    }
  }, [fileContent, isAIProcessing, toast, shareInfo?.filename]);

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
      const filename = shareInfo.filename.split('/').pop() || shareInfo.filename;
      document.title = filename;
    }
    return () => {
      document.title = 'OneShare';
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
      toast({ title: '复制成功', description: '代码内容已复制到剪贴板' });
      
      // 复制后确保主题保持vs
      if (editorRef.current) {
        loader.init().then((monaco) => {
          monaco.editor.setTheme('vs-dark');
        });
      }
    } catch (error) {
      toast({ title: '复制失败', description: '无法复制代码内容', variant: 'destructive' });
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

  // 预览HTML文件
  const previewHtmlFile = () => {
    if (!shareInfo) return;
    const previewUrl = `/app/${shareInfo.id}`;
    window.open(previewUrl, '_blank');
  };

  // 检查是否为HTML文件
  const isHtmlFile = (filename: string): boolean => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    return ['html', 'htm'].includes(ext);
  };

  // 检查是否为TSX/JSX文件
  const isTsxFile = (filename: string): boolean => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    return ['tsx', 'jsx'].includes(ext);
  };

  // 预览TSX文件
  const previewTsxFile = () => {
    if (!shareInfo) return;
    // 暂时跳转到一个预览页面，后续步骤会实现具体逻辑
    const previewUrl = `/app/${shareInfo.id}`;
    window.open(previewUrl, '_blank');
  };

  // 复制分析内容到剪贴板
  const copySummary = async () => {
    if (!summaryContent) return;

    try {
      await navigator.clipboard.writeText(summaryContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast({ title: '复制成功', description: '分析内容已复制到剪贴板' });
    } catch (error) {
      toast({ title: '复制失败', description: '无法复制分析内容', variant: 'destructive' });
    }
  };

  // 重新生成分析
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
          {/* 网站名称 */}
          <div className="flex items-center">
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
                {shareInfo.filename.split('/').pop() || '代码文件'}
              </span>
            </div>
          )}

        </div>
      </header>

      <div className="w-full max-w-screen-xl mx-auto pt-12 px-2 sm:px-4 lg:px-6 pb-20">
        {/* 代码编辑器区域 */}
        <main className="relative">
          <div className="w-full min-w-0 py-2 px-1 sm:py-2 sm:px-2 md:px-4">
            <div className="border rounded-lg overflow-hidden">
              <Editor
                height="calc(100vh - 120px)"
                language={getLanguageFromFilename(shareInfo?.filename || '')}
                value={fileContent}
                theme="vs-dark"
                onMount={handleEditorDidMount}
                options={{
                  readOnly: true,
                  fontSize: 14,
                  lineNumbers: 'on',
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true
                }}
              />
            </div>
          </div>
        </main>
      </div>

      {/* 分析弹窗 */}
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
                  点击下方魔法棍生成代码分析
                </div>
              )}
              {isSummaryStarted && !summaryContent && isAIProcessing && (
                <div className="flex items-center gap-2 text-muted-foreground justify-center py-8">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
                  <span className="text-xs">AI 正在分析代码...</span>
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
          {/* HTML预览按钮 - 仅在HTML文件时显示 */}
          {shareInfo && isHtmlFile(shareInfo.filename) && (
            <>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={previewHtmlFile} 
                className="rounded-full h-8 px-2 sm:px-3 text-xs"
              >
                <Eye className="w-3 h-3 mr-0 sm:mr-1" />
                <span className="hidden sm:inline">预览</span>
              </Button>
              <div className="w-px h-3 bg-border"></div>
            </>
          )}
          {/* TSX/JSX预览按钮 - 仅在TSX/JSX文件时显示 */}
          {shareInfo && isTsxFile(shareInfo.filename) && (
            <>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={previewTsxFile} 
                className="rounded-full h-8 px-2 sm:px-3 text-xs"
              >
                <Eye className="w-3 h-3 mr-0 sm:mr-1" />
                <span className="hidden sm:inline">预览</span>
              </Button>
              <div className="w-px h-3 bg-border"></div>
            </>
          )}
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
            <span className="hidden sm:inline">分析</span>
          </Button>
        </div>
      </div>
    </div>
  );
}