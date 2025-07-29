import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Download, AlertCircle, Volume2, Link, Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getShareInfo, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { isVideoFile, isAudioFile } from '@/constants/fileExtensions';
import { cn } from '@/lib/utils';
import ReactPlayer from 'react-player';

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

export function MediaSharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  const { config } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const isMobile = useIsMobile();
  
  // ReactPlayer ref
  const playerRef = useRef<ReactPlayer>(null);

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
    
    toast({
      title: "下载已开始",
      description: "文件下载已开始",
      duration: 1500,
    });
  };

  const copyDirectLink = async () => {
    if (!shareInfo) return;
    
    try {
      const directUrl = api.buildUnifiedDirectUrl(shareInfo.filename);
      await navigator.clipboard.writeText(directUrl);
      setIsCopied(true);
      toast({
        title: "直链已复制",
        description: "文件直链已复制到剪贴板",
      });
      
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

  const isVideo = isVideoFile(shareInfo.filename);
  const isAudio = isAudioFile(shareInfo.filename);

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
              {shareInfo.filename.split('/').pop()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyDirectLink}
            >
              {isCopied ? (
                <Check className="w-4 h-4 mr-2 text-green-500" />
              ) : (
                <Link className="w-4 h-4 mr-2" />
              )}
              {isCopied ? '已复制' : '复制直链'}
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

      {/* Media Container */}
      <div className={cn(
        "flex items-center justify-center",
        isMobile ? "h-[calc(100vh-56px)]" : "h-[calc(100vh-48px)]",
        isAudio ? "bg-background" : "bg-black"
      )}>
        <div className={cn(
          "w-full h-full flex items-center justify-center",
          isVideo ? "aspect-video max-w-full max-h-full" : "max-w-2xl mx-auto px-4"
        )}>
          {isVideo ? (
            // Video Player
            <ReactPlayer
              ref={playerRef}
              url={fileUrl}
              controls={true}
              width="100%"
              height="100%"
              config={{
                file: {
                  attributes: {
                    controlsList: 'nodownload',
                    disablePictureInPicture: false,
                  }
                }
              }}
              onError={(error) => {
                console.error('视频播放错误:', error);
                toast({
                  title: "播放失败",
                  description: "无法播放此视频文件",
                  variant: "destructive",
                });
              }}
            />
          ) : (
            // Audio Player with custom visualization
            <div className="w-full max-w-md mx-auto">
              <div className="bg-card rounded-lg p-6 shadow-lg border">
                {/* Audio visualization */}
                <div className="flex flex-col items-center space-y-6 mb-6">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                    <Volume2 className="w-12 h-12 text-white" />
                  </div>
                  
                  <div className="text-center">
                    <h2 className="text-xl font-semibold mb-2">
                      {shareInfo.filename.split('/').pop()?.replace(/\.[^.]+$/, '')}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      {shareInfo.filename.split('.').pop()?.toUpperCase()} 音频文件
                    </p>
                  </div>
                </div>
                
                {/* Audio Player */}
                <div className="w-full">
                  <ReactPlayer
                    ref={playerRef}
                    url={fileUrl}
                    controls={true}
                    width="100%"
                    height="60px"
                    config={{
                      file: {
                        forceAudio: true,
                        attributes: {
                          controlsList: 'nodownload',
                        }
                      }
                    }}
                    onError={(error) => {
                      console.error('音频播放错误:', error);
                      toast({
                        title: "播放失败",
                        description: "无法播放此音频文件",
                        variant: "destructive",
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}