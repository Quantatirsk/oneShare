import { Check, Loader2, AlertCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SaveStatus } from '@/hooks/useAutoSave';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  className?: string;
}

export function SaveStatusIndicator({ status, className }: SaveStatusIndicatorProps) {
  const getStatusConfig = (status: SaveStatus) => {
    switch (status) {
      case 'saving':
        return {
          icon: Loader2,
          text: '保存中...',
          className: 'text-blue-500',
          animate: true
        };
      case 'saved':
        return {
          icon: Check,
          text: '已保存',
          className: 'text-green-500',
          animate: false
        };
      case 'error':
        return {
          icon: AlertCircle,
          text: '保存失败',
          className: 'text-red-500',
          animate: false
        };
      case 'idle':
      default:
        return {
          icon: Circle,
          text: '',
          className: 'text-gray-400',
          animate: false
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  if (status === 'idle') {
    return null;
  }

  return (
    <div className={cn(
      'flex items-center gap-1.5 text-sm font-medium',
      config.className,
      className
    )}>
      <Icon 
        className={cn(
          'w-4 h-4',
          config.animate && 'animate-spin'
        )} 
      />
      <span>{config.text}</span>
    </div>
  );
}