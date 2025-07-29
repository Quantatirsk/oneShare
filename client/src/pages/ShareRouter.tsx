import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { getShareInfo, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { getFileType } from '@/constants/fileExtensions';

// Import all share page components
import { ShareViewPage } from './ShareViewPage';
import { CodeViewPage } from './CodeViewPage';
import { MediaSharePage } from './MediaSharePage';
import { PdfSharePage } from './PdfSharePage';
import { OfficeSharePage } from './OfficeSharePage';
import { ImageSharePage } from './ImageSharePage';
import { DownloadSharePage } from './DownloadSharePage';

export function ShareRouter() {
  const { shareId } = useParams<{ shareId: string }>();
  const { config } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="text-muted-foreground">正在识别文件类型...</span>
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

  // Determine which component to render based on file type
  const fileType = getFileType(shareInfo.filename);

  switch (fileType) {
    case 'text':
      return <ShareViewPage />;
    case 'code':
      return <CodeViewPage />;
    case 'media':
      return <MediaSharePage />;
    case 'pdf':
      return <PdfSharePage />;
    case 'office':
      return <OfficeSharePage />;
    case 'image':
      return <ImageSharePage />;
    case 'archive':
    case 'executable':
    case 'other':
    default:
      return <DownloadSharePage />;
  }
}