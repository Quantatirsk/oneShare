import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Download, 
  AlertCircle, 
  Package, 
  Settings, 
  Image, 
  FileArchive,
  FileX,
  HardDrive,
  Shield,
  User,
  Calendar,
  Share2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getShareInfo, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { 
  isArchiveFile, 
  isExecutableFile, 
  isImageFile
} from '@/constants/fileExtensions';
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

export function DownloadSharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  const { config } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadStarted, setDownloadStarted] = useState(false);
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
    
    setDownloadStarted(true);
    
    const link = document.createElement('a');
    link.href = `${fileUrl}?download=1`;
    link.download = shareInfo.filename.split('/').pop() || shareInfo.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ 
      title: '下载已开始', 
      description: '请检查您的下载文件夹' 
    });
  };

  const getFileIcon = (filename: string) => {
    if (isArchiveFile(filename)) {
      return <FileArchive className="w-16 h-16 text-amber-500" />;
    }
    if (isExecutableFile(filename)) {
      return <Settings className="w-16 h-16 text-red-500" />;
    }
    if (isImageFile(filename)) {
      return <Image className="w-16 h-16 text-blue-500" />;
    }
    return <FileX className="w-16 h-16 text-gray-500" />;
  };

  const getFileTypeDescription = (filename: string) => {
    if (isArchiveFile(filename)) {
      return '压缩文件';
    }
    if (isExecutableFile(filename)) {
      return '可执行文件';
    }
    if (isImageFile(filename)) {
      return '图像文件';
    }
    return '其他文件';
  };

  const getFileWarning = (filename: string) => {
    if (isExecutableFile(filename)) {
      return {
        level: 'danger' as const,
        icon: <Shield className="w-5 h-5" />,
        title: '安全提醒',
        message: '这是一个可执行文件，请确认来源可信后再运行。'
      };
    }
    
    if (isArchiveFile(filename)) {
      return {
        level: 'warning' as const,
        icon: <Package className="w-5 h-5" />,
        title: '压缩文件',
        message: '这是一个压缩文件，下载后需要解压缩才能查看内容。'
      };
    }
    
    return null;
  };


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  const warning = getFileWarning(shareInfo.filename);

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
            className="text-xl font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-2"
          >
            <Share2 size={20} />
            OneShare
          </button>
          
          <div className="flex-1 flex items-center justify-center px-4">
            <span className="truncate text-sm font-medium text-foreground text-center">
              文件下载
            </span>
          </div>

          <div className="w-[80px]"></div> {/* Spacer for balance */}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto">
          {/* File Preview Card */}
          <div className="bg-card border rounded-lg p-8 mb-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-6">
                {getFileIcon(shareInfo.filename)}
              </div>
              
              <h1 className="text-2xl font-bold mb-2">
                {shareInfo.filename.split('/').pop()}
              </h1>
              
              <p className="text-muted-foreground mb-6">
                {getFileTypeDescription(shareInfo.filename)}
              </p>

              <Button
                onClick={downloadFile}
                disabled={downloadStarted}
                size="lg"
                className="min-w-[160px]"
              >
                {downloadStarted ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    下载中...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    下载文件
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Warning Alert */}
          {warning && (
            <div className={cn(
              "border rounded-lg p-4 mb-6",
              warning.level === 'danger' && "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
              warning.level === 'warning' && "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  warning.level === 'danger' && "text-red-600 dark:text-red-400",
                  warning.level === 'warning' && "text-amber-600 dark:text-amber-400"
                )}>
                  {warning.icon}
                </div>
                <div>
                  <h4 className={cn(
                    "font-medium mb-1",
                    warning.level === 'danger' && "text-red-900 dark:text-red-100",
                    warning.level === 'warning' && "text-amber-900 dark:text-amber-100"
                  )}>
                    {warning.title}
                  </h4>
                  <p className={cn(
                    "text-sm",
                    warning.level === 'danger' && "text-red-700 dark:text-red-300",
                    warning.level === 'warning' && "text-amber-700 dark:text-amber-300"
                  )}>
                    {warning.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* File Details */}
          <div className="bg-card border rounded-lg p-6">
            <h3 className="font-medium mb-4">文件信息</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <HardDrive className="w-4 h-4" />
                  <span>文件名</span>
                </div>
                <span className="text-sm font-mono">
                  {shareInfo.filename.split('/').pop()}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>分享时间</span>
                </div>
                <span className="text-sm">
                  {formatDate(shareInfo.createdAt)}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>分享类型</span>
                </div>
                <span className="text-sm">
                  {shareInfo.isPublic ? '公开分享' : '私密分享'}
                </span>
              </div>
            </div>
          </div>

          {/* Download Instructions */}
          <div className="mt-6 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">下载提示</h4>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
              <li>• 点击"下载文件"按钮开始下载</li>
              <li>• 文件将保存到您的默认下载文件夹</li>
              <li>• 如果下载未开始，请检查浏览器的弹窗阻止设置</li>
              {isExecutableFile(shareInfo.filename) && (
                <li className="text-red-600 dark:text-red-400">• 请在运行可执行文件前确认其安全性</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}