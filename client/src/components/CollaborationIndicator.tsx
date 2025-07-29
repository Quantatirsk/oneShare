import { cn } from '@/lib/utils';

export interface CollaborationStatus {
  isMultiUser: boolean;
  userCount: number;
}

interface CollaborationIndicatorProps {
  status: CollaborationStatus;
  className?: string;
}

export function CollaborationIndicator({ status, className }: CollaborationIndicatorProps) {
  const getStatusConfig = (status: CollaborationStatus) => {
    if (status.isMultiUser) {
      return {
        color: 'bg-emerald-500',
        tooltip: `协作中 (${status.userCount} 人)`,
      };
    } else {
      return {
        color: 'bg-slate-400',
        tooltip: '单人编辑',
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