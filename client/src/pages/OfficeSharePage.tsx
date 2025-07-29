import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, AlertCircle, FileText, FileSpreadsheet, Presentation, ExternalLink, Eye, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getShareInfo, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { officeExtensions } from '@/constants/fileExtensions';
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

export function OfficeSharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  const { config } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    if (officeExtensions.word.includes(ext || '')) {
      return <FileText className="w-16 h-16 text-blue-500" />;
    }
    if (officeExtensions.excel.includes(ext || '')) {
      return <FileSpreadsheet className="w-16 h-16 text-green-500" />;
    }
    if (officeExtensions.powerpoint.includes(ext || '')) {
      return <Presentation className="w-16 h-16 text-orange-500" />;
    }
    return <FileText className="w-16 h-16 text-gray-500" />;
  };

  const getFileTypeDescription = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    if (officeExtensions.word.includes(ext || '')) {
      return 'Microsoft Word 文档';
    }
    if (officeExtensions.excel.includes(ext || '')) {
      return 'Microsoft Excel 电子表格';
    }
    if (officeExtensions.powerpoint.includes(ext || '')) {
      return 'Microsoft PowerPoint 演示文稿';
    }
    if (officeExtensions.other.includes(ext || '')) {
      return 'OpenDocument 文档';
    }
    return '办公文档';
  };

  const handlePreview = () => {
    setPreviewLoading(true);
    // 模拟预览加载
    setTimeout(() => {
      setPreviewLoading(false);
      toast({ 
        title: "预览功能", 
        description: "KKFileView 预览服务尚未配置，请下载文件查看", 
        variant: "destructive" 
      });
    }, 1000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
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
            <span className="truncate text-sm font-medium text-foreground text-center">
              {shareInfo.filename.split('/').pop()}
            </span>
          </div>

          <div className="flex items-center gap-2">            
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
            >
              <Maximize2 className="w-4 h-4 mr-2" />
              {isFullscreen ? '退出全屏' : '全屏'}
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

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* File Info Card */}
          <div className="bg-card border rounded-lg p-8 mb-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-6">
                {getFileIcon(shareInfo.filename)}
              </div>
              
              <h1 className="text-2xl font-bold mb-2">
                {shareInfo.filename.split('/').pop()?.replace(/\.[^.]+$/, '')}
              </h1>
              
              <p className="text-muted-foreground mb-6">
                {getFileTypeDescription(shareInfo.filename)}
              </p>

              <div className="flex flex-wrap items-center gap-4 justify-center">
                <Button
                  onClick={handlePreview}
                  disabled={previewLoading}
                  className="min-w-[120px]"
                >
                  {previewLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      加载中...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      在线预览
                    </>
                  )}
                </Button>
                
                <Button variant="outline" onClick={downloadFile}>
                  <Download className="w-4 h-4 mr-2" />
                  下载文件
                </Button>
              </div>
            </div>
          </div>

          {/* Preview Area */}
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="bg-muted px-4 py-2 border-b">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">文档预览</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>KKFileView 在线预览</span>
                  <ExternalLink className="w-4 h-4" />
                </div>
              </div>
            </div>
            
            <div className="h-[600px] bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <div className="w-8 h-8">
                    {getFileIcon(shareInfo.filename)}
                  </div>
                </div>
                
                <h4 className="text-lg font-medium mb-2">在线预览服务</h4>
                <p className="text-muted-foreground mb-4 max-w-md">
                  KKFileView 预览服务尚未配置。配置后将支持 Word、Excel、PowerPoint 等办公文档的在线预览。
                </p>
                
                <div className="space-y-2">
                  <Button onClick={downloadFile} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    下载查看文档
                  </Button>
                  
                  <p className="text-xs text-muted-foreground">
                    支持 .doc/.docx/.xls/.xlsx/.ppt/.pptx 等格式
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">配置说明</h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              要启用办公文档在线预览功能，需要部署 KKFileView 服务。
              KKFileView 是一个基于 Spring Boot 的通用文件在线预览项目，支持多种文档格式。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}