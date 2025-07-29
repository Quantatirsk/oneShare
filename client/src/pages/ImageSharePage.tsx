import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Download, 
  AlertCircle, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  RotateCcw,
  Maximize2,
  Minimize2,
  Move,
  Image as ImageIcon,
  Link,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getShareInfo, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
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

export function ImageSharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  const { config } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const isMobile = useIsMobile();

  // Image viewer states
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);

  // Helper function to calculate distance between two touches
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return null;
    const touch1 = touches[0];
    const touch2 = touches[1];
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) + 
      Math.pow(touch2.clientY - touch1.clientY, 2)
    );
  };

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

  // Image manipulation functions
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.1));
  };

  const handleRotateRight = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleRotateLeft = () => {
    setRotation(prev => (prev - 90) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single touch - start dragging if zoomed in
      if (zoom > 1) {
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
      }
    } else if (e.touches.length === 2) {
      // Two touches - prepare for pinch zoom
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      setLastTouchDistance(distance);
      setIsDragging(false); // Stop dragging when starting pinch
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging && zoom > 1) {
      // Single touch drag
      e.preventDefault();
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      });
    } else if (e.touches.length === 2 && lastTouchDistance) {
      // Two touches - pinch zoom
      e.preventDefault();
      const currentDistance = getTouchDistance(e.touches);
      if (currentDistance) {
        const scale = currentDistance / lastTouchDistance;
        setZoom(prev => Math.max(0.1, Math.min(5, prev * scale)));
        setLastTouchDistance(currentDistance);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      setIsDragging(false);
      setLastTouchDistance(null);
    } else if (e.touches.length === 1) {
      // One finger left, update distance tracking
      setLastTouchDistance(null);
    }
  };

  // Wheel zoom - only zoom when Ctrl/Cmd is held or when using pinch gesture
  const handleWheel = (e: React.WheelEvent) => {
    // Only zoom if Ctrl (Windows/Linux) or Cmd (Mac) is held down
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.max(0.1, Math.min(5, prev * delta)));
    }
    // Allow normal scrolling behavior otherwise (don't prevent default)
  };


  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

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
    <div className="min-h-screen bg-background" ref={containerRef}>
      {/* Header */}
      <header className={cn(
        "sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b transition-all duration-300",
        isMobile ? "h-14" : "h-12",
        isFullscreen && "hidden"
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
              <ImageIcon className="w-5 h-5 text-primary" />
              <span className="truncate text-sm font-medium text-foreground text-center">
                {shareInfo.filename.split('/').pop()}
              </span>
            </div>
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

      {/* Image Viewer */}
      <div 
        className={cn(
          "relative bg-black flex items-center justify-center overflow-hidden",
          isFullscreen ? "h-screen" : isMobile ? "h-[calc(100vh-56px)]" : "h-[calc(100vh-48px)]"
        )}
        onWheel={handleWheel}
      >
        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              <span className="text-white">加载图片中...</span>
            </div>
          </div>
        )}

        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-white mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">图片加载失败</h3>
              <p className="text-gray-300 mb-4">{imageError}</p>
              <Button onClick={downloadFile} variant="outline" className="text-white border-white hover:bg-white hover:text-black">
                <Download className="w-4 h-4 mr-2" />
                下载图片
              </Button>
            </div>
          </div>
        )}

        <img
          ref={imageRef}
          src={fileUrl}
          alt={shareInfo.filename.split('/').pop()}
          className={cn(
            "transition-transform duration-200 select-none",
            zoom === 1 ? "max-w-full max-h-full object-contain" : "max-w-none",
            zoom > 1 && isDragging ? "cursor-grabbing" : zoom > 1 ? "cursor-grab" : "cursor-default"
          )}
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
            opacity: imageLoading ? 0 : 1
          }}
          onLoad={() => setImageLoading(false)}
          onError={() => {
            setImageError('无法加载图片文件');
            setImageLoading(false);
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          draggable={false}
        />

        {/* Image Controls */}
        <div className={cn(
          "absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-sm rounded-lg p-3 transition-all duration-300",
          isFullscreen && "hidden"
        )}>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              className="text-white hover:bg-white/10"
              disabled={zoom <= 0.1}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              className="text-white hover:bg-white/10"
              disabled={zoom >= 5}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            
            <div className="w-px h-6 bg-white/20 mx-1" />
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRotateLeft}
              className="text-white hover:bg-white/10"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRotateRight}
              className="text-white hover:bg-white/10"
            >
              <RotateCw className="w-4 h-4" />
            </Button>
            
            <div className="w-px h-6 bg-white/20 mx-1" />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-white hover:bg-white/10 text-xs"
            >
              重置
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFullscreen}
              className="text-white hover:bg-white/10"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Zoom indicator */}
        {zoom !== 1 && !isFullscreen && (
          <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm rounded px-3 py-1 text-white text-sm transition-all duration-300">
            {Math.round(zoom * 100)}%
          </div>
        )}

        {/* Usage hints */}
        {zoom > 1 && !isDragging && !isFullscreen && (
          <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm rounded px-3 py-1 text-white text-sm flex items-center gap-2 transition-all duration-300">
            <Move className="w-4 h-4" />
            拖拽移动
          </div>
        )}
        
        {/* Zoom hint */}
        {zoom === 1 && !isFullscreen && (
          <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm rounded px-3 py-1 text-white text-sm transition-all duration-300">
            {isMobile ? "双指缩放" : "Ctrl+滚轮缩放"}
          </div>
        )}
      </div>
    </div>
  );
}