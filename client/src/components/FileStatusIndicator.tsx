import { cn } from '@/lib/utils';

export type FileStatus = 'synced' | 'modified' | 'conflict' | 'saving';

interface FileStatusIndicatorProps {
  status: FileStatus;
  className?: string;
}

export function FileStatusIndicator({ status, className }: FileStatusIndicatorProps) {
  const getStatusConfig = (status: FileStatus) => {
    switch (status) {
      case 'synced':
        return {
          color: 'bg-green-500',
          tooltip: '文件已同步',
        };
      case 'modified':
        return {
          color: 'bg-orange-500',
          tooltip: '文件已修改',
        };
      case 'conflict':
        return {
          color: 'bg-red-500',
          tooltip: '文件冲突',
        };
      case 'saving':
        return {
          color: 'bg-blue-500 animate-pulse',
          tooltip: '保存中...',
        };
      default:
        return {
          color: 'bg-gray-400',
          tooltip: '未知状态',
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <div
      className={cn(
        'w-3 h-3 rounded-full flex-shrink-0',
        config.color,
        className
      )}
      title={config.tooltip}
    />
  );
}