import { Progress } from '@/components/ui/progress';
import { formatFileSize } from '@/lib/utils';
import type { UploadProgress as UploadProgressType } from '@/types';

interface UploadProgressProps {
  progress: UploadProgressType;
}

export function UploadProgress({ progress }: UploadProgressProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSpeed = (bytesPerSecond: number) => {
    return `${formatFileSize(bytesPerSecond)}/s`;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-sm border-t border-border p-3 z-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium">
            {Math.round(progress.percent)}% 上传中...
          </span>
          <div className="flex items-center gap-4 text-muted-foreground">
            <span>{formatTime(Math.floor(progress.timeElapsed / 1000))}</span>
            <span>{formatSpeed(progress.speed)}</span>
          </div>
        </div>
        
        <Progress value={progress.percent} className="h-2" />
        
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{formatFileSize(progress.bytesUploaded)}</span>
          <span>{formatFileSize(progress.totalBytes)}</span>
        </div>
      </div>
    </div>
  );
}