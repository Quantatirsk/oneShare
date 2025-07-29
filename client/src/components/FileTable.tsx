import React from 'react';
import { 
  File, 
  Folder, 
  ArrowUp, 
  Download, 
  Link, 
  Trash2,
  ArrowUpDown,
  ArrowUp as SortUp,
  ArrowDown as SortDown,
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
  Lock,
  Unlock,
  Edit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/stores/appStore';
import { formatFileSize } from '@/lib/utils';
import { FileCard } from '@/components/FileCard';
import type { FileItem, SortConfig } from '@/types';

// 获取文件扩展名的辅助函数
const getFileExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop() || 'bin' : 'bin';
};

interface FileTableProps {
  files: FileItem[];
  selectedFiles: Set<string>;
  onFileClick: (file: FileItem) => void;
  onDirectoryClick: (path: string) => void;
  onDownload: (fileName: string) => void;
  onCopyLink: (fileName: string) => void;
  onShare?: (fileName: string) => void;
  onDelete: (fileName: string) => void;
  onRename?: (fileName: string) => void;
  onChangePermission?: (fileName: string, isPublic: boolean) => void;
  onChangeDirectoryPermission?: (dirPath: string, currentPermission: boolean) => void;
  onToggleLock?: (fileName: string, isDirectory: boolean, currentLocked: boolean) => void;
  onSort: (column: SortConfig['column']) => void;
  onToggleSelection: (filename: string, event: React.MouseEvent) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
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
}

export function FileTable({
  files,
  selectedFiles,
  onFileClick,
  onDirectoryClick,
  onDownload,
  onCopyLink,
  onShare,
  onDelete,
  onRename,
  onChangePermission,
  onChangeDirectoryPermission,
  onToggleLock,
  onSort,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  buildDirectUrl,
  dragState,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd
}: FileTableProps) {
  const { currentCursorIndex, sortConfig, viewMode } = useAppStore();

  const getFileIcon = (file: FileItem) => {
    if (file.type === 'parent_dir') return <ArrowUp className="w-4 h-4 text-muted-foreground" />;
    if (file.type === 'directory') return <Folder className="w-4 h-4 text-blue-500" />;

    const extension = file.filename.split('.').pop()?.toLowerCase() || '';
    
    // 文本文件
    if (['txt', 'md', 'rtf', 'log', 'crt', 'pem', 'key', 'csr'].includes(extension)) {
      return <FileText className="w-4 h-4 text-gray-500" />;
    }
    
    // 图片文件
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension)) {
      return <FileImage className="w-4 h-4 text-purple-500" />;
    }
    
    // 视频文件
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'].includes(extension)) {
      return <FileVideo className="w-4 h-4 text-pink-500" />;
    }
    
    // 音频文件
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(extension)) {
      return <FileAudio className="w-4 h-4 text-green-500" />;
    }
    
    // 代码文件
    if (['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php'].includes(extension)) {
      return <FileCode className="w-4 h-4 text-yellow-500" />;
    }
    
    // JSON/配置文件
    if (['json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config'].includes(extension)) {
      return <FileJson className="w-4 h-4 text-orange-500" />;
    }
    
    // 可执行文件
    if (['exe', 'dll', 'so', 'dylib', 'app'].includes(extension)) {
      return <FileCog className="w-4 h-4 text-red-500" />;
    }
    
    // 压缩文件
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension)) {
      return <FileArchive className="w-4 h-4 text-brown-500" />;
    }
    
    // 电子表格
    if (['xlsx', 'xls', 'csv'].includes(extension)) {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
    }
    
    // 脚本文件
    if (['sh', 'bash', 'bat', 'cmd', 'ps1'].includes(extension)) {
      return <FileTerminal className="w-4 h-4 text-cyan-500" />;
    }

    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  const getSortIcon = (column: SortConfig['column']) => {
    if (sortConfig.column !== column) {
      return <ArrowUpDown className="w-3 h-3 ml-1 text-muted-foreground" />;
    }
    return sortConfig.direction === 'asc' 
      ? <SortUp className="w-3 h-3 ml-1" />
      : <SortDown className="w-3 h-3 ml-1" />;
  };

  const handleRowClick = (index: number) => {
    useAppStore.getState().setCursorIndex(index);
  };

  const handleFileNameClick = (file: FileItem, index: number) => {
    useAppStore.getState().setCursorIndex(index);
    
    if (file.type === 'directory') {
      onDirectoryClick(file.filename);
    } else if (file.type === 'parent_dir') {
      onDirectoryClick('..');
    } else {
      onFileClick(file);
    }
  };

  // 网格视图渲染
  if (viewMode === 'grid') {
    return (
      <div className="h-full flex flex-col border border-border rounded-lg overflow-hidden">
        {/* 网格视图内容 */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4">
          {files.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                没有文件
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {(() => {
                // 分离目录和文件
                const directories = files.filter(f => f.type === 'directory' || f.type === 'parent_dir');
                const regularFiles = files.filter(f => f.type !== 'directory' && f.type !== 'parent_dir');
                
                return (
                  <>
                    {/* 目录区域 */}
                    {directories.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">目录</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
                          {directories.map((file, index) => (
                            <FileCard
                              key={file.filename}
                              file={file}
                              index={index}
                              isSelected={selectedFiles.has(file.filename)}
                              onFileClick={onFileClick}
                              onDirectoryClick={onDirectoryClick}
                              onDownload={onDownload}
                              onCopyLink={onCopyLink}
                              onShare={onShare}
                              onDelete={onDelete}
                              onRename={onRename}
                              onChangePermission={onChangePermission}
                              onChangeDirectoryPermission={onChangeDirectoryPermission}
                              onToggleSelection={onToggleSelection}
                              onToggleLock={onToggleLock}
                              buildDirectUrl={buildDirectUrl}
                              dragState={dragState}
                              onDragStart={onDragStart}
                              onDragOver={onDragOver}
                              onDragLeave={onDragLeave}
                              onDrop={onDrop}
                              onDragEnd={onDragEnd}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* 文件区域 */}
                    {regularFiles.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">文件</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
                          {regularFiles.map((file, index) => (
                            <FileCard
                              key={file.filename}
                              file={file}
                              index={directories.length + index}
                              isSelected={selectedFiles.has(file.filename)}
                              onFileClick={onFileClick}
                              onDirectoryClick={onDirectoryClick}
                              onDownload={onDownload}
                              onCopyLink={onCopyLink}
                              onShare={onShare}
                              onDelete={onDelete}
                              onRename={onRename}
                              onChangePermission={onChangePermission}
                              onChangeDirectoryPermission={onChangeDirectoryPermission}
                              onToggleSelection={onToggleSelection}
                              onToggleLock={onToggleLock}
                              buildDirectUrl={buildDirectUrl}
                              dragState={dragState}
                              onDragStart={onDragStart}
                              onDragOver={onDragOver}
                              onDragLeave={onDragLeave}
                              onDrop={onDrop}
                              onDragEnd={onDragEnd}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 列表视图渲染（原始表格视图）
  return (
    <div className="h-full flex flex-col border border-border rounded-lg overflow-hidden">
      {/* 统一的滚动容器 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full table-fixed" style={{ minWidth: '1040px' }}>
          <colgroup>
            <col className="w-[40px]" />
            <col className="w-[40px]" />
            <col className="min-w-[200px] max-w-[400px] w-[40%]" />
            <col className="w-[80px]" />
            <col className="w-[80px]" />
            <col className="w-[100px]" />
            <col className="w-[100px]" />
            <col className="w-[180px]" />
            <col className="w-[180px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead className="bg-background border-b border-border sticky top-0 z-10">
            <tr>
              <th className="p-2 align-middle">
                <div className="flex items-center justify-center">
                  {(() => {
                    const selectableFiles = files.filter(f => f.type !== 'parent_dir');
                    const allSelected = selectableFiles.length > 0 && selectableFiles.every(f => selectedFiles.has(f.filename));
                    const someSelected = selectableFiles.some(f => selectedFiles.has(f.filename));
                    
                    return (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          if (allSelected) {
                            onClearSelection();
                          } else {
                            onSelectAll();
                          }
                        }}
                        disabled={selectableFiles.length === 0}
                      >
                        {allSelected ? (
                          <CheckSquare className="h-5 w-5 text-primary" />
                        ) : someSelected ? (
                          <CheckSquare className="h-5 w-5 text-primary opacity-50" />
                        ) : (
                          <Square className="h-5 w-5" />
                        )}
                      </Button>
                    );
                  })()}
                </div>
              </th>
              <th className="p-2"></th>
              <th 
                className="text-left p-2 font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                onClick={() => onSort('name')}
              >
                <div className="flex items-center">
                  路径
                  {getSortIcon('name')}
                </div>
              </th>
              <th 
                className="text-left p-2 font-medium cursor-pointer hover:bg-muted/70 transition-colors whitespace-nowrap"
                onClick={() => onSort('permission')}
              >
                <div className="flex items-center">
                  权限
                  {getSortIcon('permission')}
                </div>
              </th>
              <th className="text-center p-2 font-medium whitespace-nowrap">
                锁定
              </th>
              <th 
                className="text-left p-2 font-medium cursor-pointer hover:bg-muted/70 transition-colors whitespace-nowrap"
                onClick={() => onSort('type')}
              >
                <div className="flex items-center">
                  类型
                  {getSortIcon('type')}
                </div>
              </th>
              <th 
                className="text-left p-2 font-medium cursor-pointer hover:bg-muted/70 transition-colors whitespace-nowrap"
                onClick={() => onSort('size')}
              >
                <div className="flex items-center">
                  大小
                  {getSortIcon('size')}
                </div>
              </th>
              <th 
                className="text-left p-2 font-medium cursor-pointer hover:bg-muted/70 transition-colors whitespace-nowrap"
                onClick={() => onSort('created')}
              >
                <div className="flex items-center">
                  创建时间
                  {getSortIcon('created')}
                </div>
              </th>
              <th 
                className="text-left p-2 font-medium cursor-pointer hover:bg-muted/70 transition-colors whitespace-nowrap"
                onClick={() => onSort('date')}
              >
                <div className="flex items-center">
                  更新时间
                  {getSortIcon('date')}
                </div>
              </th>
              <th className="p-2 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {files.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-8 text-muted-foreground">
                  没有文件
                </td>
              </tr>
            ) : (
              files.map((file, index) => {
                    const isSelected = selectedFiles.has(file.filename);
                    const isSelectable = file.type !== 'parent_dir';
                    
                    return (
                      <tr 
                        key={file.filename} 
                        className={`group hover:bg-muted/50 transition-colors ${
                          currentCursorIndex === index ? 'bg-muted' : ''
                        } ${isSelected ? 'bg-primary/5' : ''}`}
                        onClick={() => handleRowClick(index)}
                        data-row-index={index}
                        draggable={file.type !== 'parent_dir' && !!onDragStart}
                        onDragStart={(e) => onDragStart?.(e, file, index)}
                        onDragOver={(e) => onDragOver?.(e, file)}
                        onDragLeave={(e) => onDragLeave?.(e)}
                        onDrop={(e) => onDrop?.(e, file)}
                        onDragEnd={onDragEnd}
                        style={dragState?.dragOverTarget === file.filename ? { backgroundColor: 'rgba(var(--primary), 0.1)' } : {}}
                      >
                        <td className="p-2 align-middle">
                          <div className="flex items-center justify-center">
                            {isSelectable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleSelection(file.filename, e);
                                }}
                              >
                                {isSelected ? (
                                  <CheckSquare className="h-5 w-5 text-primary" />
                                ) : (
                                  <Square className="h-5 w-5" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          {getFileIcon(file)}
                        </td>
                      <td className="p-2 truncate">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            {file.type === 'parent_dir' || file.type === 'directory' ? (
                              <span 
                                className="cursor-pointer hover:text-primary truncate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFileNameClick(file, index);
                                }}
                              >
                                {file.display_name}
                              </span>
                            ) : (
                              <a 
                                href={buildDirectUrl(file.filename)}
                                className="cursor-pointer hover:text-primary text-current no-underline truncate"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleFileNameClick(file, index);
                                }}
                              >
                                {file.display_name}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-2">
                        {(file.type === 'file' || file.type === 'directory') && file.is_public !== undefined && (
                          <Badge 
                            variant={file.is_public ? "secondary" : "outline"} 
                            className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
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
                      </td>
                      <td className="p-2 text-center">
                        {(file.type === 'file' || file.type === 'directory') && file.locked !== undefined && onToggleLock && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-accent/50 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleLock(file.filename, file.type === 'directory', file.locked || false);
                            }}
                            title={`点击${file.locked ? '解锁' : '锁定'}`}
                          >
                            {file.locked ? (
                              <Lock className="h-4 w-4 text-destructive" />
                            ) : (
                              <Unlock className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {file.type === 'parent_dir' ? '' : file.type === 'directory' ? '目录' : getFileExtension(file.filename)}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {file.type === 'directory' ? '-' : formatFileSize(file.size || 0)}
                      </td>
                      <td className="p-2 truncate whitespace-nowrap">
                        {file.upload_time ? new Date(file.upload_time).toLocaleString() : '-'}
                      </td>
                      <td className="p-2 truncate whitespace-nowrap">
                        {file.modified_time ? new Date(file.modified_time).toLocaleString() : 
                         file.upload_time ? new Date(file.upload_time).toLocaleString() : '-'}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {file.type !== 'parent_dir' && (
                            <>
                              {file.type !== 'directory' ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDownload(file.filename);
                                    }}
                                    title="下载"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onCopyLink(file.filename);
                                    }}
                                    title="复制链接"
                                  >
                                    <Link className="h-4 w-4" />
                                  </Button>
                                  {onShare && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onShare(file.filename);
                                      }}
                                      title="分享"
                                    >
                                      <Share2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {onRename && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRename(file.filename);
                                      }}
                                      title="重命名"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDelete(file.filename);
                                    }}
                                    title="删除"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDownload(file.filename);
                                    }}
                                    title="下载目录"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  <div className="w-8 h-8"></div>
                                  {onShare && <div className="w-8 h-8"></div>}
                                  {onRename ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRename(file.filename);
                                      }}
                                      title="重命名"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <div className="w-8 h-8"></div>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDelete(file.filename);
                                    }}
                                    title="删除"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}