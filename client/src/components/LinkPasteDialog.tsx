import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Link, 
  Download, 
  FileText, 
  Video, 
  Loader2,
  ExternalLink,
  Save,
  Copy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppStore } from '@/stores/appStore';
import { getUrlDownloadManager } from '@/lib/urlDownloadManager';

interface LinkPasteDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  onPasteAsText: (text: string) => void;
  onProcessComplete?: (result: any) => void;
}

interface CobaltOptions {
  videoQuality: string;
  audioFormat: string;
  audioBitrate: string;
  downloadMode: string;
  filenameStyle: string;
  youtubeVideoCodec?: string;
  youtubeDubLang?: string;
  youtubeBetterAudio?: boolean;
  allowH265?: boolean;
  tiktokFullAudio?: boolean;
}

export function LinkPasteDialog({
  isOpen,
  onOpenChange,
  url,
  onPasteAsText,
  onProcessComplete
}: LinkPasteDialogProps) {
  const { toast } = useToast();
  const { config } = useAppStore();
  const [activeTab, setActiveTab] = useState<'text' | 'download' | 'markdown'>('download');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cobaltSupported, setCobaltSupported] = useState<boolean | null>(null);
  const [cobaltOptions, setCobaltOptions] = useState<CobaltOptions>({
    videoQuality: 'max',
    audioFormat: 'best',
    audioBitrate: '320',
    downloadMode: 'auto',
    filenameStyle: 'basic'
  });
  const [customFilename, setCustomFilename] = useState('');
  const [checkingSupport, setCheckingSupport] = useState(false);
  
  // 固定逻辑：默认保存到服务器，设为私有文件
  const saveToServer = true;
  const isPublic = false;

  // 检查URL是否支持Cobalt下载
  useEffect(() => {
    if (!url || !isOpen) return;

    const checkCobaltSupport = async () => {
      setCheckingSupport(true);
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (config.authToken) {
          headers['Authorization'] = config.authToken;
        }

        const response = await fetch(`${config.serverAddress}/api/cobalt/check`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ url })
        });
        
        const data = await response.json();
        if (data.success) {
          setCobaltSupported(data.supported);
          if (data.supported && data.default_options) {
            setCobaltOptions(prev => ({
              ...prev,
              ...data.default_options  // 服务器返回的最高规格默认配置
            }));
          }
        }
      } catch (error) {
        console.error('检查Cobalt支持失败:', error);
        setCobaltSupported(false);
      } finally {
        setCheckingSupport(false);
      }
    };

    checkCobaltSupport();
  }, [url, isOpen]);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setActiveTab('download');
      setCobaltSupported(null);
      setCustomFilename('');
      setIsProcessing(false);
    }
  }, [isOpen]);

  const handlePasteAsText = () => {
    onPasteAsText(url);
    onOpenChange(false);
  };

  const handleCobaltDownload = async () => {
    if (!cobaltSupported) return;

    setIsProcessing(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (config.authToken) {
        headers['Authorization'] = config.authToken;
      }

      const response = await fetch(`${config.serverAddress}/api/cobalt/download`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url,
          options: cobaltOptions,
          save_to_server: saveToServer,
          filename: customFilename || undefined,
          is_public: isPublic
        })
      });
      
      const data = await response.json();
      if (data.success) {
        // 立即关闭对话框
        onOpenChange(false);
        
        if (data.type === 'picker') {
          // 显示选择器选项
          toast({
            title: '选择媒体',
            description: `找到 ${data.items.length} 个媒体文件，请选择要下载的项目`,
          });
          // TODO: 显示picker选择界面
        } else if (data.type === 'downloading') {
          // 下载任务已启动，添加到下载管理器
          const downloadManager = getUrlDownloadManager(config);
          downloadManager.addTask(data.task_id, data.url, data.filename);
          
          toast({
            title: '下载任务已启动',
            description: `正在下载: ${data.filename}，请查看底部进度条`,
          });
          onProcessComplete?.(data);
        } else if (data.type === 'saved') {
          // 同步下载完成
          toast({
            title: '下载成功',
            description: `文件已保存为: ${data.filename}`,
          });
          onProcessComplete?.(data);
        } else {
          // 直接下载链接
          toast({
            title: '获取下载链接成功',
            description: '文件链接已获取，可直接下载',
          });
          onProcessComplete?.(data);
        }
      } else {
        toast({
          title: '下载失败',
          description: data.message || '未知错误',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Cobalt下载失败:', error);
      toast({
        title: '下载失败',
        description: error.message || '网络错误',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkdownConvert = async () => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('url', url);
      formData.append('is_public', String(isPublic));

      const headers: Record<string, string> = {};
      if (config.authToken) {
        headers['Authorization'] = config.authToken;
      }

      const response = await fetch(`${config.serverAddress}/api/url/process`, {
        method: 'POST',
        headers,
        body: formData
      });
      
      const data = await response.json();
      if (data.success) {
        toast({
          title: '转换成功',
          description: `网页已转换为Markdown: ${data.filename}`,
        });
        onProcessComplete?.(data);
        onOpenChange(false);
      } else {
        toast({
          title: '转换失败',
          description: data.message || '转换过程中出现错误',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Markdown转换失败:', error);
      toast({
        title: '转换失败',
        description: error.message || '网络错误',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getPlatformName = (url: string) => {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'YouTube';
    if (hostname.includes('tiktok.com')) return 'TikTok';
    if (hostname.includes('instagram.com')) return 'Instagram';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'Twitter/X';
    if (hostname.includes('bilibili.com')) return 'Bilibili';
    if (hostname.includes('xiaohongshu.com')) return '小红书';
    return '未知平台';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-5 h-5" />
            链接粘贴处理
          </DialogTitle>
          <DialogDescription>
            选择如何处理粘贴的链接内容
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 显示URL */}
          <div className="space-y-2">
            <Label>检测到的链接</Label>
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <ExternalLink className="w-4 h-4" />
                <span className="font-mono text-xs break-all">{url}</span>
              </div>
              {cobaltSupported !== null && (
                <div className="mt-2">
                  <Badge 
                    variant={cobaltSupported ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {cobaltSupported ? `${getPlatformName(url)} - 支持媒体下载` : '不支持媒体下载'}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger 
                value="download" 
                disabled={checkingSupport || !cobaltSupported}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                媒体下载
                {checkingSupport && <Loader2 className="w-3 h-3 animate-spin" />}
              </TabsTrigger>
              <TabsTrigger value="text" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                粘贴为文本
              </TabsTrigger>
              <TabsTrigger value="markdown" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                转为Markdown
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Copy className="w-4 h-4" />
                  <h4 className="font-medium">直接粘贴</h4>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  将链接作为纯文本粘贴到当前位置
                </p>
                <Button onClick={handlePasteAsText} className="w-full">
                  粘贴为文本
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="download" className="space-y-4">
              {cobaltSupported ? (
                <div className="space-y-4">
                  {/* 基本设置 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>视频质量</Label>
                      <Select 
                        value={cobaltOptions.videoQuality} 
                        onValueChange={(value) => setCobaltOptions(prev => ({ ...prev, videoQuality: value }))}
                      >
                        <SelectTrigger className="focus:ring-0 focus:ring-offset-0">
                          <SelectValue placeholder="选择视频质量" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="max">最高质量</SelectItem>
                          <SelectItem value="2160">4K (2160p)</SelectItem>
                          <SelectItem value="1440">2K (1440p)</SelectItem>
                          <SelectItem value="1080">1080p</SelectItem>
                          <SelectItem value="720">720p</SelectItem>
                          <SelectItem value="480">480p</SelectItem>
                          <SelectItem value="360">360p</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>音频格式</Label>
                      <Select 
                        value={cobaltOptions.audioFormat} 
                        onValueChange={(value) => setCobaltOptions(prev => ({ ...prev, audioFormat: value }))}
                      >
                        <SelectTrigger className="focus:ring-0 focus:ring-offset-0">
                          <SelectValue placeholder="选择音频格式" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="best">最佳质量</SelectItem>
                          <SelectItem value="mp3">MP3</SelectItem>
                          <SelectItem value="ogg">OGG</SelectItem>
                          <SelectItem value="wav">WAV</SelectItem>
                          <SelectItem value="opus">Opus</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>音频比特率</Label>
                      <Select 
                        value={cobaltOptions.audioBitrate} 
                        onValueChange={(value) => setCobaltOptions(prev => ({ ...prev, audioBitrate: value }))}
                      >
                        <SelectTrigger className="focus:ring-0 focus:ring-offset-0">
                          <SelectValue placeholder="选择音频比特率" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="320">320 kbps</SelectItem>
                          <SelectItem value="256">256 kbps</SelectItem>
                          <SelectItem value="128">128 kbps</SelectItem>
                          <SelectItem value="96">96 kbps</SelectItem>
                          <SelectItem value="64">64 kbps</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>下载模式</Label>
                      <Select 
                        value={cobaltOptions.downloadMode} 
                        onValueChange={(value) => setCobaltOptions(prev => ({ ...prev, downloadMode: value }))}
                      >
                        <SelectTrigger className="focus:ring-0 focus:ring-offset-0">
                          <SelectValue placeholder="选择下载模式" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">自动</SelectItem>
                          <SelectItem value="audio">仅音频</SelectItem>
                          <SelectItem value="mute">静音视频</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* 自定义文件名 */}
                  <div className="space-y-2">
                    <Label>自定义文件名 (可选)</Label>
                    <Input
                      value={customFilename}
                      onChange={(e) => setCustomFilename(e.target.value)}
                      placeholder="留空使用默认文件名"
                    />
                  </div>


                  <Button 
                    onClick={handleCobaltDownload} 
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        下载中...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        开始下载
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="p-4 border rounded-lg text-center">
                  <Video className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    此链接不支持媒体下载功能
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="markdown" className="space-y-4">
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" />
                    <h4 className="font-medium">网页转Markdown</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    将网页内容提取并转换为Markdown格式保存
                  </p>

                </div>

                <Button 
                  onClick={handleMarkdownConvert} 
                  disabled={isProcessing}
                  className="w-full"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      转换中...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      转换为Markdown
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
