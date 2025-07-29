import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, AlertCircle, FileText, Link, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getShareInfo, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
}

export function PdfSharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { config } = useAppStore();
  const { toast } = useToast();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const isMobile = useIsMobile();

  const fileUrl = shareId 
    ? `/api/s/${shareId}/file`
    : '';

  useEffect(() => {
    if (!shareId) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }
    loadShareInfo(shareId);
  }, [shareId]);

  const loadShareInfo = async (shareId: string) => {
    try {
      setLoading(true);
      setError(null);
      const info = await getShareInfo(api, shareId);
      if (!info) {
        setError('分享链接不存在或已过期');
        return;
      }
      setShareInfo(info);
    } catch (error) {
      console.error('加载分享信息失败:', error);
      setError(error instanceof Error ? error.message : '加载分享信息失败');
    } finally {
      setLoading(false);
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

  const copyShareLink = async () => {
    if (!shareId) return;
    
    try {
      const shareUrl = `${window.location.origin}/s/${shareId}`;
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      toast({
        title: "链接已复制",
        description: "分享链接已复制到剪贴板",
      });
      
      // 2秒后重置图标
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (error) {
      toast({
        title: "复制失败",
        description: "无法复制链接到剪贴板",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (shareInfo?.filename) {
      const filename = shareInfo.filename.split('/').pop() || shareInfo.filename;
      document.title = filename;
    }
    return () => {
      document.title = 'OneShare';
    };
  }, [shareInfo?.filename]);

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
      {/* Header */}
      <header className={cn(
        "sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b",
        isMobile ? "h-14" : "h-12"
      )}>
        <div className="h-full flex items-center px-4 justify-between">
          <button 
            onClick={() => window.location.href = '/'}
            className="text-xl font-semibold text-foreground hover:text-primary transition-colors"
          >
            OneShare
          </button>
          
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-red-500" />
              <span className="truncate text-sm font-medium text-foreground text-center">
                {shareInfo.filename.split('/').pop()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyShareLink}
            >
              {isCopied ? (
                <Check className="w-4 h-4 mr-2 text-green-500" />
              ) : (
                <Link className="w-4 h-4 mr-2" />
              )}
              {isCopied ? '已复制' : '复制链接'}
            </Button>
            
            <Button
              variant="outline"
              size="sm" 
              onClick={downloadFile}
            >
              <Download className="w-4 h-4 mr-2" />
              下载
            </Button>
          </div>
        </div>
      </header>


      {/* PDF Viewer */}
      <div className="flex-1">
        <div className="w-full h-full">
          <div className="bg-white shadow-lg overflow-hidden w-full h-full">
            {pdfLoading && (
              <div className="flex items-center justify-center h-96 w-full bg-gray-100">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <span className="text-muted-foreground">加载PDF文件...</span>
                </div>
              </div>
            )}
            
            {pdfError && (
              <div className="flex flex-col items-center justify-center h-96 w-full bg-gray-100">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">PDF加载失败</h3>
                <p className="text-muted-foreground mb-4">{pdfError}</p>
                <p className="text-sm text-muted-foreground">
                  请尝试直接下载文件查看，或使用其他PDF阅读器
                </p>
              </div>
            )}
            
            {/* PDF Embed with fallback */}
            {!pdfError && (
              <div className="relative w-full">
                <iframe
                  src={fileUrl}
                  className={cn(
                    "w-full border-0 transition-all duration-200 min-w-full",
                    pdfLoading && "opacity-0"
                  )}
                  style={{ height: isMobile ? 'calc(100vh - 56px)' : 'calc(100vh - 48px)' }}
                  onLoad={() => setPdfLoading(false)}
                  onError={() => {
                    setPdfError('浏览器不支持PDF预览');
                    setPdfLoading(false);
                  }}
                  title="PDF预览"
                />
                
                {/* PDF.js fallback */}
                {pdfError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
                    <div className="text-center max-w-md">
                      <FileText className="w-16 h-16 text-red-500 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">PDF预览不可用</h3>
                      <p className="text-muted-foreground mb-4">
                        您的浏览器不支持PDF预览功能
                      </p>
                      <div className="space-y-2">
                        <Button onClick={downloadFile} className="w-full">
                          <Download className="w-4 h-4 mr-2" />
                          下载PDF文件
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          下载后可使用PDF阅读器查看
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PDF Alternative Viewer */}
      <div className="fixed bottom-4 right-4">
        <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="w-4 h-4" />
            <span>PDF文档 • {shareInfo.filename.split('/').pop()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}