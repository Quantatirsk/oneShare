import React from 'react';
import {
  File,
  Folder,
  ArrowUp,
  Download,
  Link,
  Trash2,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileJson,
  FileCog,
  FileArchive,
  FileSpreadsheet,
  FileTerminal,
  CheckSquare,
  Square,
  Share2,
  MoreVertical,
  Calendar,
  HardDrive,
  Lock,
  Unlock,
  Edit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatFileSize, cn } from '@/lib/utils';
import type { FileItem } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AnimatedCard } from '@/components/ui/animated-card';

interface FileCardProps {
  file: FileItem;
  isSelected: boolean;
  onFileClick: (file: FileItem) => void;
  onDirectoryClick: (path: string) => void;
  onDownload: (fileName: string) => void;
  onCopyLink: (fileName: string) => void;
  onShare?: (fileName: string) => void;
  onDelete: (fileName: string) => void;
  onRename?: (fileName: string) => void;
  onChangePermission?: (fileName: string, isPublic: boolean) => void;
  onChangeDirectoryPermission?: (dirPath: string, currentPermission: boolean) => void;
  onToggleSelection: (filename: string, event: React.MouseEvent) => void;
  onToggleLock?: (fileName: string, isDirectory: boolean, currentLocked: boolean) => void;
  buildDirectUrl: (fileName: string) => string;
  dragState?: {
    isDragging: boolean;
    draggedItem: FileItem | null;
    dragOverTarget: string | null;
  };
  onDragStart?: (e: React.DragEvent, file: FileItem, index: number) => void;
  onDragOver?: (e: React.DragEvent, file: FileItem) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, file: FileItem) => void;
  onDragEnd?: () => void;
  index: number;
}

export function FileCard({
  file,
  isSelected,
  onFileClick,
  onDirectoryClick,
  onDownload,
  onCopyLink,
  onShare,
  onDelete,
  onRename,
  onChangePermission,
  onChangeDirectoryPermission,
  onToggleSelection,
  onToggleLock,
  buildDirectUrl: _buildDirectUrl,
  dragState,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  index,
}: FileCardProps) {
  const getFileInfo = (file: FileItem) => {
    if (file.type === 'parent_dir') {
      return {
        icon: <ArrowUp className="w-5 h-5" />,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted',
        category: '返回上级',
        badgeVariant: 'outline' as const
      };
    }

    if (file.type === 'directory') {
      return {
        icon: <Folder className="w-5 h-5" />,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        category: '文件夹',
        badgeVariant: 'outline' as const
      };
    }

    const extension = file.filename.split('.').pop()?.toLowerCase() || '';

    // 文本文件
    if (['txt', 'md', 'rtf', 'log', 'crt', 'pem', 'key', 'csr'].includes(extension)) {
      return {
        icon: <FileText className="w-5 h-5" />,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/50',
        category: '文档',
        badgeVariant: 'outline' as const
      };
    }

    // 图片文件
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension)) {
      return {
        icon: <FileImage className="w-5 h-5" />,
        color: 'text-purple-600 dark:text-purple-400',
        bgColor: 'bg-purple-50 dark:bg-purple-950/50',
        category: '图片',
        badgeVariant: 'outline' as const
      };
    }

    // 视频文件
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'].includes(extension)) {
      return {
        icon: <FileVideo className="w-5 h-5" />,
        color: 'text-pink-600 dark:text-pink-400',
        bgColor: 'bg-pink-50 dark:bg-pink-950/50',
        category: '视频',
        badgeVariant: 'outline' as const
      };
    }

    // 音频文件
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(extension)) {
      return {
        icon: <FileAudio className="w-5 h-5" />,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-950/50',
        category: '音频',
        badgeVariant: 'outline' as const
      };
    }

    // 代码文件
    if (['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php'].includes(extension)) {
      return {
        icon: <FileCode className="w-5 h-5" />,
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-50 dark:bg-amber-950/50',
        category: '代码',
        badgeVariant: 'outline' as const
      };
    }

    // JSON/配置文件
    if (['json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config'].includes(extension)) {
      return {
        icon: <FileJson className="w-5 h-5" />,
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-50 dark:bg-orange-950/50',
        category: '配置',
        badgeVariant: 'outline' as const
      };
    }

    // 可执行文件
    if (['exe', 'dll', 'so', 'dylib', 'app'].includes(extension)) {
      return {
        icon: <FileCog className="w-5 h-5" />,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-950/50',
        category: '程序',
        badgeVariant: 'destructive' as const
      };
    }

    // 压缩文件
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension)) {
      return {
        icon: <FileArchive className="w-5 h-5" />,
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-50 dark:bg-yellow-950/50',
        category: '压缩',
        badgeVariant: 'outline' as const
      };
    }

    // 电子表格
    if (['xlsx', 'xls', 'csv'].includes(extension)) {
      return {
        icon: <FileSpreadsheet className="w-5 h-5" />,
        color: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
        category: '表格',
        badgeVariant: 'outline' as const
      };
    }

    // 脚本文件
    if (['sh', 'bash', 'bat', 'cmd', 'ps1'].includes(extension)) {
      return {
        icon: <FileTerminal className="w-5 h-5" />,
        color: 'text-cyan-600 dark:text-cyan-400',
        bgColor: 'bg-cyan-50 dark:bg-cyan-950/50',
        category: '脚本',
        badgeVariant: 'outline' as const
      };
    }

    return {
      icon: <File className="w-5 h-5" />,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/50',
      category: '文件',
      badgeVariant: 'outline' as const
    };
  };

  const handleFileNameClick = () => {
    if (file.type === 'directory') {
      onDirectoryClick(file.filename);
    } else if (file.type === 'parent_dir') {
      onDirectoryClick('..');
    } else {
      onFileClick(file);
    }
  };

  const isSelectable = file.type !== 'parent_dir';
  const isDraggedOver = dragState?.dragOverTarget === file.filename;
  const fileInfo = getFileInfo(file);

  const getCardBackground = () => {
    if (isSelected) return "ring-2 ring-primary/50 border-primary/50 shadow-xl bg-primary/5";
    if (isDraggedOver) return "bg-accent border-primary shadow-xl ring-2 ring-primary/30";

    // 根据文件的公开/私有状态设置不同背景
    if ((file.type === 'file' || file.type === 'directory') && file.is_public !== undefined) {
      if (file.is_public) {
        return "bg-card/80 hover:bg-blue-50/60 dark:hover:bg-blue-900/30";
      } else {
        return "bg-card/80 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30";
      }
    }





    return "bg-card/80 hover:bg-card/90";
  };

  return (
    <AnimatedCard
      animation="hover"
      intensity="medium"
      className={cn(
        "group border border-border/40 rounded-xl overflow-hidden cursor-pointer backdrop-blur-sm transition-all duration-300",
        "hover:border-border/60 shadow-lg hover:shadow-2xl hover:scale-[1.02] hover:-translate-y-1",
        "flex-shrink-0",
        getCardBackground()
      )}
    >
      <div
        onClick={handleFileNameClick}
        draggable={file.type !== 'parent_dir' && !!onDragStart}
        onDragStart={(e) => onDragStart?.(e, file, index)}
        onDragOver={(e) => onDragOver?.(e, file)}
        onDragLeave={(e) => onDragLeave?.(e)}
        onDrop={(e) => onDrop?.(e, file)}
        onDragEnd={onDragEnd}
        className="relative"
      >
        <div className="p-4 pb-3 relative h-[120px] flex flex-col justify-between">
          {/* 主要内容区域 */}
          <div className="flex items-start gap-4 flex-1">
            {/* 文件图标和后缀 */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              {/* 文件图标 */}
              <div className={cn(
                "flex items-center justify-center w-10 h-10 rounded-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10",
                fileInfo.bgColor,
                fileInfo.color
              )}>
                {fileInfo.icon}
              </div>
              
              {/* 文件后缀 */}
              {file.type !== 'directory' && file.type !== 'parent_dir' && (
                <div className="text-xs text-muted-foreground/70 font-mono uppercase font-medium">
                  {file.filename.split('.').pop() || 'FILE'}
                </div>
              )}
            </div>

            {/* 文件信息 */}
            <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
              {/* 文件名和选择框行 */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* 文件名 */}
                  <h3 className="font-medium text-foreground text-base leading-5 truncate group-hover:text-primary transition-colors mb-1">
                    {file.display_name}
                  </h3>
                  
                  {/* 文件大小和日期 */}
                  <div className="flex items-center gap-2">
                    {/* 文件大小 */}
                    {file.type !== 'directory' && file.type !== 'parent_dir' && file.size !== undefined && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-2.5 py-1 rounded-md whitespace-nowrap flex-shrink-0">
                        <HardDrive className="w-3 h-3" />
                        <span className="font-medium">{formatFileSize(file.size)}</span>
                      </div>
                    )}
                    
                    {/* 修改时间 */}
                    {file.modified_time && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-2.5 py-1 rounded-md whitespace-nowrap flex-shrink-0">
                        <Calendar className="w-3 h-3" />
                        <span className="font-medium">{new Date(file.modified_time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 选择框容器 - 固定宽度，与菜单按钮对齐 */}
                <div className="w-6 flex justify-center flex-shrink-0">
                  {isSelectable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-accent/50 transition-all duration-200 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelection(file.filename, e);
                      }}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* 公有/私有和锁定状态及菜单行 */}
              <div className="flex items-center justify-between gap-2 mt-auto">
                {/* 左侧：状态标签 */}
                <div className="flex items-center gap-1.5">
                  {/* 公有/私有标签 */}
                  {(file.type === 'file' || file.type === 'directory') && file.is_public !== undefined && (
                    <Badge
                      variant={file.is_public ? "secondary" : "outline"}
                      className="text-xs cursor-pointer hover:opacity-80 transition-opacity whitespace-nowrap flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (file.type === 'file' && onChangePermission) {
                          onChangePermission(file.filename, !file.is_public);
                        } else if (file.type === 'directory' && onChangeDirectoryPermission && file.is_public !== undefined) {
                          onChangeDirectoryPermission(file.filename, file.is_public);
                        }
                      }}
                      title={`点击切换为${file.is_public ? '私有' : '公开'}`}
                    >
                      {file.is_public ? "公开" : "私有"}
                    </Badge>
                  )}

                  {/* 锁定状态标签 */}
                  {(file.type === 'file' || file.type === 'directory') && file.locked !== undefined && onToggleLock && (
                    <Badge
                      variant={file.locked ? "destructive" : "outline"}
                      className="text-xs cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLock(file.filename, file.type === 'directory', file.locked || false);
                      }}
                      title={`点击${file.locked ? '解锁' : '锁定'}`}
                    >
                      {file.locked ? (
                        <>
                          <Lock className="w-3 h-3" />
                          已锁定
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3 h-3" />
                          未锁定
                        </>
                      )}
                    </Badge>
                  )}
                </div>

                {/* 右侧：操作菜单 */}
                {file.type !== 'parent_dir' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-accent/50 transition-all duration-200 rounded opacity-60 hover:opacity-100 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownload(file.filename);
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {file.type === 'directory' ? '下载目录' : '下载'}
                      </DropdownMenuItem>
                      {file.type !== 'directory' && (
                        <>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onCopyLink(file.filename);
                            }}
                          >
                            <Link className="h-4 w-4 mr-2" />
                            复制链接
                          </DropdownMenuItem>
                          {onShare && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onShare(file.filename);
                              }}
                            >
                              <Share2 className="h-4 w-4 mr-2" />
                              分享
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                      {onToggleLock && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLock(file.filename, file.type === 'directory', file.locked || false);
                          }}
                        >
                          {file.locked ? (
                            <>
                              <Unlock className="h-4 w-4 mr-2" />
                              解锁
                            </>
                          ) : (
                            <>
                              <Lock className="h-4 w-4 mr-2" />
                              锁定
                            </>
                          )}
                        </DropdownMenuItem>
                      )}
                      {onRename && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onRename(file.filename);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          重命名
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(file.filename);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AnimatedCard>
  );
}