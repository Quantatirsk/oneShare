import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { getShareInfo, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { isMarkdownFile } from '@/constants/fileExtensions';

// Import preview components
import { TsxPreviewPage } from './TsxPreviewPage';
import { HtmlPreviewPage } from './HtmlPreviewPage';
import { ShareViewPage } from './ShareViewPage';

export function AppPreviewRouter() {
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

  // 获取文件扩展名
  const getFileExtension = (filename: string): string => {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  };

  // 判断是否为HTML文件
  const isHtmlFile = (filename: string): boolean => {
    const ext = getFileExtension(filename);
    return ['html', 'htm'].includes(ext);
  };

  // 判断是否为TSX/JSX文件
  const isTsxJsxFile = (filename: string): boolean => {
    const ext = getFileExtension(filename);
    return ['tsx', 'jsx'].includes(ext);
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

  // 根据文件类型选择预览组件
  if (isTsxJsxFile(shareInfo.filename)) {
    return <TsxPreviewPage />;
  }
  
  if (isHtmlFile(shareInfo.filename)) {
    return <HtmlPreviewPage />;
  }
  
  if (isMarkdownFile(shareInfo.filename)) {
    return <ShareViewPage />;
  }
  
  // 对于其他文件类型，显示不支持的提示
  const fileExtension = getFileExtension(shareInfo.filename);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-medium mb-2">不支持的文件类型</h2>
        <p className="text-muted-foreground mb-4">
          文件类型 .{fileExtension} 暂不支持应用内预览
        </p>
        <p className="text-sm text-muted-foreground">
          请使用直接链接访问文件
        </p>
      </div>
    </div>
  );
}