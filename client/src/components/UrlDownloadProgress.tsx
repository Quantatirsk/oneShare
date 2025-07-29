import { Progress } from '@/components/ui/progress';
import { X, Download, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UrlDownloadProgressProps {
  url: string;
  filename: string;
  progress: number;
  downloadedBytes: number;
  totalBytes?: number;
  isComplete: boolean;
  isError: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onClose: () => void;
}

export function UrlDownloadProgress({
  url,
  filename,
  progress,
  downloadedBytes,
  totalBytes,
  isComplete,
  isError,
  errorMessage,
  onCancel,
  onClose
}: UrlDownloadProgressProps) {
  const displayUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;

  // 格式化字节数为可读格式
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed bottom-4 left-4 w-96 bg-background border border-border rounded-lg shadow-lg p-4 z-50">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Download className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate" title={filename}>
              {filename}
            </div>
            <div className="text-xs text-muted-foreground truncate" title={url}>
              {displayUrl}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0"
          onClick={isComplete || isError ? onClose : onCancel}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {isError ? (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" />
          <span className="flex-1">{errorMessage || '下载失败'}</span>
        </div>
      ) : isComplete ? (
        <div className="text-green-600 text-sm font-medium">
          ✅ 下载完成
        </div>
      ) : (
        <div className="space-y-2">
          {totalBytes && totalBytes > 0 ? (
            <Progress value={progress} className="h-2" />
          ) : (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
          )}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>下载中...</span>
            <span>
              {totalBytes && totalBytes > 0 
                ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${progress.toFixed(1)}%)`
                : formatBytes(downloadedBytes)
              }
            </span>
          </div>
        </div>
      )}
    </div>
  );
}