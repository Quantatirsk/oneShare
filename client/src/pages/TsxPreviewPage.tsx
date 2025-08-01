import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getSharedFileContent, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { BackendRenderer } from '@/lib/backendRenderer';

export function TsxPreviewPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  const { config } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BackendRenderer | null>(null);

  // 辅助函数：去除文件名后缀
  const getFileNameWithoutExtension = (filename: string): string => {
    if (!filename) return '';
    const dotIndex = filename.lastIndexOf('.');
    return dotIndex > 0 ? filename.substring(0, dotIndex) : filename;
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
      const filename = shareInfo.filename.split('/').pop() || shareInfo.filename;
      // 去除后缀名
      const nameWithoutExt = getFileNameWithoutExtension(filename);
      document.title = `${nameWithoutExt}`;
    }
    return () => {
      document.title = 'OneShare';
    };
  }, [shareInfo?.filename]);

  // 清理渲染器
  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
      }
    };
  }, []);


  const loadSharedFile = async (shareId: string) => {
    try {
      setLoading(true);
      setError(null);
      const sharedFile = await getSharedFileContent(api, shareId);
      if (!sharedFile) {
        setError('分享链接不存在或已过期');
        return;
      }
      setShareInfo({ 
        id: shareId, 
        filename: sharedFile.filename, 
        isPublic: sharedFile.isPublic, 
        createdAt: sharedFile.createdAt 
      });
      setFileContent(sharedFile.content);
      
      // 自动开始渲染
      setTimeout(() => {
        renderTSX(sharedFile.content);
      }, 100);
    } catch (error) {
      console.error('加载分享文件失败:', error);
      setError(error instanceof Error ? error.message : '加载分享文件失败');
    } finally {
      setLoading(false);
    }
  };

  const renderTSX = async (tsxCode: string) => {
    if (!iframeContainerRef.current) {
      toast({
        title: '渲染失败',
        description: '容器未准备就绪',
        variant: 'destructive'
      });
      return;
    }

    try {
      setRendering(true);
      setError(null);

      // 清理之前的渲染器
      if (rendererRef.current) {
        rendererRef.current.destroy();
      }

      // 创建新的渲染器
      const renderer = new BackendRenderer(api);
      rendererRef.current = renderer;

      // 清空容器
      iframeContainerRef.current.innerHTML = '';

      // 创建沙箱iframe
      const iframe = await renderer.createSandboxIframe(iframeContainerRef.current, {
        sandboxAttributes: [
          'allow-scripts',
          'allow-same-origin',
          'allow-modals',
          'allow-forms',
          'allow-popups',
          'allow-popups-to-escape-sandbox',
          'allow-top-navigation',
          'allow-top-navigation-by-user-activation',
          'allow-downloads',
          'allow-pointer-lock',
          'allow-presentation',
          'allow-orientation-lock',
          'allow-storage-access-by-user-activation'
        ]
      });

      // 渲染TSX内容
      await renderer.renderTSX(tsxCode, iframe);



    } catch (error) {
      console.error('TSX渲染失败:', error);
      const errorMessage = error instanceof Error ? error.message : '渲染失败';
      setError(errorMessage);
      toast({
        title: '渲染失败',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setRendering(false);
    }
  };



  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="text-muted-foreground">加载TSX文件中...</span>
        </div>
      </div>
    );
  }

  if (error && !shareInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">无法访问文件</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* 预览区域 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {rendering && (
          <div className="flex items-center justify-center p-4 sm:p-8 border-b border-border bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">
                <span className="hidden sm:inline">正在编译和渲染TSX组件...</span>
                <span className="sm:hidden">编译中...</span>
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center p-4 sm:p-8 border-b border-border bg-destructive/10">
            <div className="flex flex-col sm:flex-row items-center gap-3 text-destructive">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-medium text-center sm:text-left">{error}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => renderTSX(fileContent)}
                className="mt-2 sm:mt-0 sm:ml-4"
              >
                重试
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 relative bg-white">
          <div 
            ref={iframeContainerRef}
            className="absolute inset-0 w-full h-full"
            style={{ minHeight: '400px' }}
          />
          
          {!rendering && !error && !iframeContainerRef.current?.hasChildNodes() && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="text-center text-muted-foreground">
                <div className="text-lg mb-2">
                  <span className="hidden sm:inline">等待TSX组件渲染</span>
                  <span className="sm:hidden">等待渲染</span>
                </div>
                <Button onClick={() => renderTSX(fileContent)} variant="outline">
                  开始渲染
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 底部悬浮信息框 */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 group">
        <div className="
          opacity-0 group-hover:opacity-100 
          transition-all duration-200 
          bg-black/80 backdrop-blur-sm 
          text-white text-xs 
          px-3 py-2 rounded-lg 
          pointer-events-none
          min-w-max
        ">
          <div className="flex items-center gap-2 sm:gap-4">
            {shareInfo && (
              <span className="hidden md:inline"> {getFileNameWithoutExtension(shareInfo.filename)}</span>
            )}
            <span className="text-gray-300">|</span>
            <span className="hidden sm:inline">Powered by Quant (pengzhia@gmail.com)</span>
            <span className="sm:hidden">Quant</span>
          </div>
        </div>
      </div>

    </div>
  );
}