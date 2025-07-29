import React from 'react';
import {
  Download,
  Trash2,
  X,
  CheckSquare,
  Square,
  Loader2,
  Users,
  Lock,
  Unlock,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FileItem } from '@/types';

interface BatchOperationBarProps {
  selectedFiles: Set<string>;
  files: FileItem[];
  onBatchDownload: (files: string[]) => void;
  onBatchDelete: (files: string[]) => void;
  onBatchCopy: (files: string[]) => void;
  onBatchChangePermission?: (files: string[], isPublic: boolean) => void;
  onBatchLock?: (files: string[], locked: boolean) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
}

export function BatchOperationBar({
  selectedFiles,
  files,
  onBatchDownload,
  onBatchDelete,
  onBatchChangePermission,
  onBatchLock,
  onClearSelection,
  onSelectAll,
}: BatchOperationBarProps) {
  const [isDownloading, setIsDownloading] = React.useState(false);
  const selectedCount = selectedFiles.size;
  const totalSelectableFiles = files.filter(file => file.type !== 'parent_dir').length;
  const isAllSelected = selectedCount === totalSelectableFiles && totalSelectableFiles > 0;

  if (selectedCount === 0) {
    return null;
  }

  const selectedArray = Array.from(selectedFiles);
  const selectedFileItems = files.filter(file => selectedFiles.has(file.filename));
  const hasDirectories = selectedFileItems.some(file => file.type === 'directory');
  const hasFiles = selectedFileItems.some(file => file.type === 'file');

  return (
    <div className="bg-primary/10 border border-primary/20 rounded-lg p-2 sm:p-3 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={isAllSelected ? onClearSelection : onSelectAll}
              className="h-8 w-8 p-0"
            >
              {isAllSelected ? (
                <CheckSquare className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </Button>
            <span className="text-sm font-medium">
              已选择 {selectedCount} 个项目
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* 下载按钮 - 只对文件有效 */}
            {hasFiles && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setIsDownloading(true);
                  try {
                    await onBatchDownload(selectedArray);
                  } finally {
                    setIsDownloading(false);
                  }
                }}
                disabled={isDownloading}
                className="h-8 px-2 sm:px-3 hover:bg-primary/10 hover:border-primary/20 transition-colors"
              >
                {isDownloading ? (
                  <Loader2 className="w-3 h-3 sm:mr-1 animate-spin" />
                ) : (
                  <Download className="w-3 h-3 sm:mr-1" />
                )}
                <span className="hidden sm:inline">{isDownloading ? '压缩中...' : '下载'}</span>
              </Button>
            )}

            {/* 权限管理按钮组 */}
            {onBatchChangePermission && hasFiles && (
              <div className="flex items-center border rounded-md">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onBatchChangePermission(selectedArray, true)}
                  className="h-8 px-2 sm:px-3 hover:bg-primary/10 transition-colors rounded-r-none border-r"
                  title="设为公开"
                >
                  <Users className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline text-xs">公开</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onBatchChangePermission(selectedArray, false)}
                  className="h-8 px-2 sm:px-3 hover:bg-primary/10 transition-colors rounded-l-none"
                  title="设为私有"
                >
                  <Shield className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline text-xs">私有</span>
                </Button>
              </div>
            )}

            {/* 锁定管理按钮组 */}
            {onBatchLock && (hasFiles || hasDirectories) && (
              <div className="flex items-center border rounded-md">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onBatchLock(selectedArray, true)}
                  className="h-8 px-2 sm:px-3 hover:bg-primary/10 transition-colors rounded-r-none border-r"
                  title="锁定"
                >
                  <Lock className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline text-xs">锁定</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onBatchLock(selectedArray, false)}
                  className="h-8 px-2 sm:px-3 hover:bg-primary/10 transition-colors rounded-l-none"
                  title="解锁"
                >
                  <Unlock className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline text-xs">解锁</span>
                </Button>
              </div>
            )}

            {/* 删除按钮 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBatchDelete(selectedArray)}
              className="h-8 px-2 sm:px-3 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20 transition-colors"
            >
              <Trash2 className="w-3 h-3 sm:mr-1" />
              <span className="hidden sm:inline">删除</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          {/* 显示选中项目类型统计 */}
          <div className="text-xs text-muted-foreground">
            {hasFiles && hasDirectories && (
              <span>文件和文件夹</span>
            )}
            {hasFiles && !hasDirectories && (
              <span>{selectedCount} 个文件</span>
            )}
            {!hasFiles && hasDirectories && (
              <span>{selectedCount} 个文件夹</span>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}