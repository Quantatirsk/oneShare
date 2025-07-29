import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasteIndicatorProps {
  show: boolean;
}

export function PasteIndicator({ show }: PasteIndicatorProps) {
  return (
    <div
      className={cn(
        "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1600]",
        "bg-background/90 backdrop-blur-sm border border-border rounded-lg",
        "px-6 py-4 flex items-center gap-3",
        "transition-opacity duration-200 pointer-events-none",
        "shadow-lg",
        show ? "opacity-100" : "opacity-0"
      )}
    >
      <Check className="w-5 h-5 text-green-500" />
      <span className="font-medium">粘贴操作已捕获并正在处理</span>
    </div>
  );
}