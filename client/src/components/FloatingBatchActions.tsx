import { useState } from 'react';
import {
  Download,
  Trash2, 
  X,
  Loader2,
  Users,
  Lock,
  Unlock,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { FileItem } from '@/types';

interface FloatingBatchActionsProps {
  selectedFiles: Set<string>;
  files: FileItem[];
  onBatchDownload: (files: string[]) => void;
  onBatchDelete: (files: string[]) => void;
  onBatchChangePermission?: (files: string[], isPublic: boolean) => void;
  onBatchLock?: (files: string[], locked: boolean) => void;
  onClearSelection: () => void;
}

export function FloatingBatchActions({
  selectedFiles,
  files,
  onBatchDownload,
  onBatchDelete,
  onBatchChangePermission,
  onBatchLock,
  onClearSelection,
}: FloatingBatchActionsProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  const selectedCount = selectedFiles.size;

  // Don't render if no files are selected
  if (selectedCount === 0) {
    return null;
  }

  const selectedArray = Array.from(selectedFiles);
  const selectedFileItems = files.filter(file => selectedFiles.has(file.filename));
  const hasDirectories = selectedFileItems.some(file => file.type === 'directory');
  const hasFiles = selectedFileItems.some(file => file.type === 'file');

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await onBatchDownload(selectedArray);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-6 z-50">
      {/* Main FAB */}
      <div className="relative">
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="lg"
              className={cn(
                "h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200",
                "bg-primary hover:bg-primary/90 text-primary-foreground",
                "border-2 border-primary-foreground/20"
              )}
            >
              <div className="flex flex-col items-center">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-xs font-medium">{selectedCount}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          
          <DropdownMenuContent
            align="start"
            side="top"
            className="w-48 p-2"
            sideOffset={10}
          >
            <DropdownMenuLabel className="flex items-center justify-between px-2">
              <span className="font-medium">已选择 {selectedCount} 个项目</span>
              <Button
                variant="ghost"
                size="sm" 
                onClick={onClearSelection}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </DropdownMenuLabel>
            
            <DropdownMenuSeparator />

            {/* Download */}
            {hasFiles && (
              <DropdownMenuItem 
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-3 px-3 py-2"
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{isDownloading ? '压缩中...' : '下载'}</span>
              </DropdownMenuItem>
            )}

            {/* Permission Actions */}
            {onBatchChangePermission && hasFiles && (
              <>
                <DropdownMenuItem 
                  onClick={() => onBatchChangePermission(selectedArray, true)}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <Users className="w-4 h-4" />
                  <span>设为公开</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onBatchChangePermission(selectedArray, false)}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <Shield className="w-4 h-4" />
                  <span>设为私有</span>
                </DropdownMenuItem>
              </>
            )}

            {/* Lock Actions */}
            {onBatchLock && (hasFiles || hasDirectories) && (
              <>
                <DropdownMenuItem 
                  onClick={() => onBatchLock(selectedArray, true)}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>锁定</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onBatchLock(selectedArray, false)}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <Unlock className="w-4 h-4" />
                  <span>解锁</span>
                </DropdownMenuItem>
              </>
            )}

            {/* Delete */}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onBatchDelete(selectedArray)}
              className="flex items-center gap-3 px-3 py-2 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
              <span>删除</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}