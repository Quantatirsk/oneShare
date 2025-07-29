import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { isValidUrl } from '@/lib/urlHandler';
import { getUrlDownloadManager } from '@/lib/urlDownloadManager';
import { useToast } from '@/hooks/use-toast';

// 检查URL是否可能支持媒体下载
function isSupportedMediaUrl(url: string): boolean {
  const supportedDomains = [
    'youtube.com', 'youtu.be', 'tiktok.com', 'douyin.com',
    'instagram.com', 'twitter.com', 'x.com', 'facebook.com',
    'bilibili.com', 'xiaohongshu.com', 'xhslink.com',
    'vimeo.com', 'dailymotion.com', 'reddit.com'
  ];
  
  try {
    const domain = new URL(url).hostname.toLowerCase().replace(/^www\\./, '');
    return supportedDomains.some(supported => domain.includes(supported));
  } catch {
    return false;
  }
}

type UrlProcessingType = 'media' | 'file' | 'webpage';

interface UrlInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileListRefresh?: () => void;
  onLinkDetected?: (url: string) => void;
  type?: UrlProcessingType;
}

export function UrlInputModal({ isOpen, onClose, onFileListRefresh, onLinkDetected, type = 'media' }: UrlInputModalProps) {
  const { config } = useAppStore();
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast({
        title: "输入错误",
        description: "请输入有效的URL地址",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    if (!isValidUrl(trimmedUrl)) {
      toast({
        title: "URL无效",
        description: "请输入有效的HTTP或HTTPS地址",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    if (!config.serverAddress || !config.authToken) {
      toast({
        title: "配置错误",
        description: "请先配置服务器地址和认证令牌",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    // 检查是否为支持媒体下载的URL
    if (isSupportedMediaUrl(trimmedUrl) && onLinkDetected) {
      // 关闭当前模态框
      setUrl('');
      onClose();
      // 触发智能链接路由
      onLinkDetected(trimmedUrl);
      return;
    }

    setIsProcessing(true);
    
    try {
      toast({
        title: "检测到URL",
        description: "开始处理URL内容，请查看下载进度...",
        duration: 1500,
      });

      // 使用URL下载管理器处理URL，这样可以显示进度
      const downloadManager = getUrlDownloadManager(config);
      await downloadManager.startDownload(trimmedUrl);

      // 刷新文件列表
      if (onFileListRefresh) {
        onFileListRefresh();
      }

      // 成功后清空输入并关闭模态框
      setUrl('');
      onClose();
      
      toast({
        title: "处理完成",
        description: "URL内容处理完成，请查看文件列表",
        duration: 2000,
      });
    } catch (error) {
      console.error('处理URL失败:', error);
      toast({
        title: "处理失败",
        description: error instanceof Error ? error.message : "处理URL时发生错误",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsProcessing(false);
    }
  }, [url, config, toast, onFileListRefresh, onClose, onLinkDetected]);

  const handleClose = useCallback(() => {
    if (!isProcessing) {
      setUrl('');
      onClose();
    }
  }, [isProcessing, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isProcessing) {
      handleClose();
    }
  }, [isProcessing, handleClose]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-5 h-5" />
            {type === 'media' && '流媒体下载'}
            {type === 'file' && '文件下载'}
            {type === 'webpage' && '网页提取'}
          </DialogTitle>
          <DialogDescription>
            {type === 'media' && '输入视频/音频URL地址，支持YouTube、TikTok、B站等平台'}
            {type === 'file' && '输入文件直链地址，系统将下载文件到服务器'}
            {type === 'webpage' && '输入网页URL地址，系统将提取并保存网页内容'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url-input">URL地址</Label>
            <Input
              id="url-input"
              type="url"
              placeholder={
                type === 'media' ? 'https://www.youtube.com/watch?v=...' :
                type === 'file' ? 'https://example.com/file.zip' :
                'https://example.com/page.html'
              }
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isProcessing}
              autoFocus
              className="w-full"
            />
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isProcessing}
            >
              <X className="w-4 h-4 mr-1" />
              取消
            </Button>
            <Button
              type="submit"
              disabled={isProcessing || !url.trim()}
              className="min-w-[100px]"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <Link className="w-4 h-4 mr-1" />
                  添加
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}