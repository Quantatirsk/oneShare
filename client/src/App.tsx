import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FolderPlus,
  FilePlus,
  Settings,
  Code,
  Keyboard,
  Grid3X3,
  List,
  Info,
  Plus,
  ChevronDown,
  Video,
  Download,
  Globe,
  Share2,
} from 'lucide-react';


import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { FileTable } from '@/components/FileTable';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { UploadProgress } from '@/components/UploadProgress';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ApiDocDialog } from '@/components/ApiDocDialog';
import { ShortcutsDialog } from '@/components/ShortcutsDialog';
import { PasteIndicator } from '@/components/PasteIndicator';
import { InputDialog } from '@/components/InputDialog';
import { UnifiedFileDialog } from '@/components/UnifiedFileDialog';
import { FloatingBatchActions } from '@/components/FloatingBatchActions';
import { UrlDownloadProgress } from '@/components/UrlDownloadProgress';
import { UrlInputModal } from '@/components/UrlInputModal';
import { AppFeaturesDialog } from '@/components/AppFeaturesDialog';
import { DirectoryPermissionDialog } from '@/components/DirectoryPermissionDialog';
import { LinkPasteDialog } from '@/components/LinkPasteDialog';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';

import { useAppStore } from '@/stores/appStore';
import { FileServerAPI } from '@/lib/api';
import { WebSocketClient, type FileSystemEvent } from '@/lib/websocket';
import { useFileService } from '@/hooks/useFileService';
import { normalizePath, cn } from '@/lib/utils';
import { processFilesForUpload, generateUniqueDirectoryName } from '@/lib/fileUtils';
import { useToast } from '@/hooks/use-toast';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { usePasteUpload } from '@/hooks/usePasteUpload';
import { useInternalDragDrop } from '@/hooks/useInternalDragDrop';
import { isTextFile } from '@/constants/fileExtensions';
import { getUrlDownloadManager } from '@/lib/urlDownloadManager';
import { getOrCreateShare, createShareUrl } from '@/lib/shareUtils';

// Utility function to convert string content to File object
const createFileFromContent = (content: string, filename: string): File => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  return new File([blob], filename, { type: 'text/plain' });
};
import { generateSmartFilename } from '@/lib/smartFileNaming';
import type { FileItem, SortConfig } from '@/types';
import type { DownloadTask } from '@/lib/urlDownloadManager';

// 获取文件扩展名的辅助函数
const getFileExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop() || 'bin' : 'bin';
};

function App() {
  const {
    config,
    files,
    currentPath,
    sortConfig,
    uploadProgress,
    isLoading,
    selectedFiles,
    viewMode,
    setFiles,
    setCurrentPath,
    setSortConfig,
    setUploadProgress,
    toggleFileSelection,
    clearSelection,
    selectAll,
    setViewMode,
  } = useAppStore();

  // 移动端检测
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768; // 768px是md断点
      setIsMobile(mobile);
      
      // 移动端强制使用网格视图
      if (mobile && viewMode === 'list') {
        setViewMode('grid');
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [viewMode, setViewMode]);

  const { toast } = useToast();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [wsClient] = React.useState(() => new WebSocketClient(config));
  const { 
    refreshFileList, 
    deleteFile, 
    changeFilePermission, 
    batchDeleteFiles, 
    batchChangePermission 
  } = useFileService();
  const [showSettings, setShowSettings] = React.useState(false);
  const [wsConnectionStatus, setWsConnectionStatus] = React.useState<string>('DISCONNECTED');
  const [showApiDoc, setShowApiDoc] = React.useState(false);
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [showUrlInput, setShowUrlInput] = React.useState(false);
  const [urlInputType, setUrlInputType] = React.useState<'media' | 'file' | 'webpage'>('media');
  const [showAppFeatures, setShowAppFeatures] = React.useState(false);
  
  // 确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);
  
  // 输入对话框状态
  const [inputDialog, setInputDialog] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    placeholder?: string;
    defaultValue?: string;
    onConfirm: (value: string) => void;
  } | null>(null);
  
  // 文件对话框状态
  const [fileDialog, setFileDialog] = useState<{
    isOpen: boolean;
    filename: string;
    isNewFile?: boolean;
    isReadOnly?: boolean;
    initialContent?: string;
  } | null>(null);

  // URL下载进度状态
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([]);

  // 目录权限对话框状态
  const [directoryPermissionDialog, setDirectoryPermissionDialog] = useState<{
    isOpen: boolean;
    dirPath: string;
    currentPermission: boolean;
    loading: boolean;
  } | null>(null);

  const [linkPasteDialog, setLinkPasteDialog] = useState<{
    isOpen: boolean;
    url: string;
  }>({
    isOpen: false,
    url: ''
  });

  // 添加一个 ref 来追踪是否已经加载过文件列表
  const initialLoadRef = useRef(false);
  
  // Use ref to get latest currentPath value
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  // 用于防抖文件列表刷新的 ref
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();


  // 新的统一文件列表加载函数 - 现在使用FileService
  const loadUnifiedFileList = useCallback(async (skipLoading = false, targetPath?: string) => {
    if (!config.serverAddress) {
      toast({
        title: "配置错误",
        description: "请先配置服务器设置",
        variant: "destructive",
        duration: 1500,
      });
      return;
    }

    await refreshFileList(skipLoading, targetPath);
  }, [config.serverAddress, refreshFileList, toast]);

  const handleFileUpload = useCallback(async (acceptedFiles: File[]) => {
    if (!config.serverAddress || !config.authToken) {
      toast({
        title: "配置错误",
        description: "请先配置服务器设置",
        variant: "destructive",
        duration: 1500,
      });
      return;
    }

    // 处理文件重名，传递当前文件列表避免额外的API请求
    const processedFiles = await processFilesForUpload(
      acceptedFiles, 
      api, 
      currentPath,
      files
    );
    const totalFiles = processedFiles.length;
    let uploadedFiles = 0;
    const totalSize = processedFiles.reduce((acc, file) => acc + file.size, 0);
    let totalUploaded = 0;
    const startTime = Date.now();

    // 分片上传阈值：5MB
    const CHUNK_THRESHOLD = 5 * 1024 * 1024; // 5MB
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB 分片大小

    setUploadProgress({
      percent: 0,
      bytesUploaded: 0,
      totalBytes: totalSize,
      timeElapsed: 0,
      speed: 0,
    });

    for (const file of processedFiles) {
      try {
        let fileName = file.finalName;
        if (currentPath) {
          fileName = `${currentPath}/${file.finalName}`;
        }
        fileName = normalizePath(fileName);

        const isPublic = false;
        
        // 根据文件大小选择上传方式
        if (file.size > CHUNK_THRESHOLD) {
          // 大文件使用分片上传
          const result = await api.uploadFileWithChunks(
            file,
            fileName,
            CHUNK_SIZE,
            isPublic,
            [], // tags
            "", // description
            "", // notes
            (progress, _uploadedChunks, _totalChunks) => {
              // 分片上传进度回调
              const fileProgress = (progress / 100) * file.size;
              const currentTotalUploaded = totalUploaded + fileProgress;
              
              const currentTime = Date.now();
              const timeElapsed = currentTime - startTime;
              const speed = currentTotalUploaded / (timeElapsed / 1000);

              setUploadProgress({
                percent: (currentTotalUploaded / totalSize) * 100,
                bytesUploaded: currentTotalUploaded,
                totalBytes: totalSize,
                timeElapsed,
                speed,
              });
            }
          );
          
          if (!result.success) {
            throw new Error(result.error || '分片上传失败');
          }
        } else {
          // 小文件使用普通上传
          await api.uploadUnifiedFile(file, fileName, isPublic);
        }

        uploadedFiles++;
        totalUploaded += file.size;

        const currentTime = Date.now();
        const timeElapsed = currentTime - startTime;
        const speed = totalUploaded / (timeElapsed / 1000);

        setUploadProgress({
          percent: (totalUploaded / totalSize) * 100,
          bytesUploaded: totalUploaded,
          totalBytes: totalSize,
          timeElapsed,
          speed,
        });

        if (totalFiles <= 3 || uploadedFiles === totalFiles) {
          const uploadMethod = file.size > CHUNK_THRESHOLD ? '分片上传' : '上传';
          toast({
            title: "上传成功",
            description: `文件 ${file.finalName} ${uploadMethod}成功`,
            duration: 1500,
          });
        }
      } catch (error) {
        toast({
          title: "上传失败",
          description: `文件 ${file.finalName}: ${error instanceof Error ? error.message : "未知错误"}`,
          variant: "destructive",
          duration: 1500,
        });
      }
    }

    if (totalFiles > 3) {
      toast({
        title: "批量上传完成",
        description: `成功上传 ${uploadedFiles}/${totalFiles} 个文件`,
        duration: 1500,
      });
    }

    // Complete progress and hide after 1 second
    setUploadProgress({
      percent: 100,
      bytesUploaded: totalSize,
      totalBytes: totalSize,
      timeElapsed: Date.now() - startTime,
      speed: 0,
    });

    setTimeout(() => setUploadProgress(null), 1000);
    loadUnifiedFileList(true, currentPath);
  }, [config, api, toast, setUploadProgress, loadUnifiedFileList, files, currentPath]);

  const handleDirectoryClick = useCallback((path: string) => {
    
    
    if (path === '..') {
      // 处理上级目录
      if (currentPath) {
        const parts = currentPath.split('/').filter(Boolean); // 过滤空字符串
        parts.pop(); // 移除最后一个部分
        const targetPath = parts.join('/');
        setCurrentPath(targetPath);
        // 使用更新后的路径直接加载，避免状态更新延迟
        loadUnifiedFileList(true, targetPath);
      } else {
        // 已经在根目录，无需操作
        loadUnifiedFileList(true, '');
      }
    } else if (path === '') {
      // 处理主页图标点击，直接跳转到根目录
      setCurrentPath('');
      loadUnifiedFileList(true, '');
    } else {
      // 处理从面包屑点击的路径
      // 面包屑生成的路径是相对于根目录的，不需要再拼接当前路径
      const targetPath = normalizePath(path);
      
      // 更新状态并加载文件列表
      setCurrentPath(targetPath);
      loadUnifiedFileList(true, targetPath);
    }
  }, [currentPath, setCurrentPath, loadUnifiedFileList]);

  const handleFileClick = useCallback(async (file: FileItem) => {
    if (isTextFile(file.filename)) {
      // 检查文件是否被锁定
      if (file.locked) {
        toast({
          title: "文件已锁定",
          description: `文件 "${file.filename}" 已被锁定，只能查看，无法编辑`,
          variant: "default",
          duration: 2000,
        });
        // 锁定的文件以只读模式打开
        setFileDialog({
          isOpen: true,
          filename: file.filename,
          isReadOnly: true,
        });
      } else {
        // 文本文件显示统一对话框
        setFileDialog({
          isOpen: true,
          filename: file.filename,
        });
      }
    } else {
      // 非文本文件直接打开
      const directUrl = api.buildUnifiedDirectUrl(file.filename);
      window.open(directUrl, '_blank');
    }
  }, [api, toast]);

  const handleDownload = useCallback(async (fileName: string) => {
    // 检查是否为目录
    const file = files.find(f => f.filename === fileName);
    const isDirectory = file?.type === 'directory';
    
    try {
      if (isDirectory) {
        // 目录使用批量下载API
        const blob = await api.batchDownload([fileName]);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName.split('/').pop() || fileName}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast({
          title: "下载成功",
          description: "目录打包下载完成",
          duration: 1500,
        });
      } else {
        // 文件使用直接下载链接
        const directUrl = api.buildUnifiedDirectUrl(fileName);
        // 添加下载参数强制服务器返回下载响应头
        const downloadUrl = `${directUrl}${directUrl.includes('?') ? '&' : '?'}download=1`;
        
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName.split('/').pop() || fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        toast({
          title: "开始下载",
          description: "文件下载已开始",
          duration: 1500,
        });
      }
    } catch (error) {
      toast({
        title: "下载失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
    }
  }, [api, toast, files]);

  const handleCopyLink = useCallback(async (fileName: string) => {
    const directUrl = api.buildUnifiedDirectUrl(fileName);
    try {
      await navigator.clipboard.writeText(directUrl);
      toast({
        title: "已复制到剪贴板",
        description: "文件直链已复制",
        duration: 1500,
      });
    } catch (error) {
      toast({
        title: "复制失败",
        variant: "destructive",
        duration: 1500,
      });
    }
  }, [api, toast]);

  const handleShare = useCallback(async (fileName: string) => {
    try {
      // 通过后端API获取或创建固定的分享链接
      // 获取文件信息判断是否为公共文件
      const file = files.find(f => f.filename === fileName);
      const isPublic = file?.is_public || false;
      const shareInfo = await getOrCreateShare(api, fileName, isPublic);
      const shareUrl = createShareUrl(shareInfo.id, fileName);
      
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "分享链接已复制",
        description: "您可以分享给他人访问",
        duration: 2000,
      });

      // 等待0.5秒后在新窗口打开链接
      setTimeout(() => {
        window.open(shareUrl, '_blank');
      }, 200);
    } catch (error) {
      toast({
        title: "分享失败",
        description: error instanceof Error ? error.message : "创建分享链接失败",
        variant: "destructive",
        duration: 1500,
      });
    }
  }, [api, toast, files]);



  const handleDeleteConfirmed = useCallback(async (fileName: string) => {
    try {
      await deleteFile(fileName);
      clearSelection();
    } catch (error) {
      // 错误处理已经在deleteFile中完成
    }
  }, [deleteFile, clearSelection]);

  const showDeleteConfirm = useCallback((fileName: string) => {
    // 检查文件是否被锁定
    const file = files.find(f => f.filename === fileName);
    if (file && file.locked) {
      toast({
        title: "无法删除",
        description: `${file.type === 'directory' ? '目录' : '文件'} "${fileName}" 已被锁定，无法删除`,
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: "确认删除",
      description: `确定要删除 "${fileName}" 吗？此操作不可撤销。`,
      onConfirm: () => handleDeleteConfirmed(fileName),
    });
  }, [handleDeleteConfirmed, files, toast]);

  const handleRename = useCallback((fileName: string) => {
    // 检查文件是否被锁定
    const file = files.find(f => f.filename === fileName);
    if (file && file.locked) {
      toast({
        title: "无法重命名",
        description: `${file.type === 'directory' ? '目录' : '文件'} "${fileName}" 已被锁定，无法重命名`,
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    // 获取文件名（不包含路径）
    const baseName = fileName.split('/').pop() || fileName;
    
    setInputDialog({
      isOpen: true,
      title: "重命名",
      description: `请输入新的${file?.type === 'directory' ? '目录' : '文件'}名称`,
      placeholder: "新名称",
      defaultValue: baseName,
      onConfirm: async (newName: string) => {
        if (!newName.trim()) {
          toast({
            title: "重命名失败",
            description: "名称不能为空",
            variant: "destructive",
            duration: 1500,
          });
          return;
        }

        // 构建新的完整路径
        const pathParts = fileName.split('/');
        pathParts[pathParts.length - 1] = newName.trim();
        const newFileName = pathParts.join('/');

        if (newFileName === fileName) {
          toast({
            title: "重命名取消",
            description: "名称未发生变化",
            duration: 1500,
          });
          return;
        }

        try {
          await api.renameUnifiedFile(fileName, newFileName);
          toast({
            title: "重命名成功",
            description: `已重命名为 "${newName.trim()}"`,
            duration: 1500,
          });
          loadUnifiedFileList(true, currentPath);
        } catch (error) {
          toast({
            title: "重命名失败",
            description: error instanceof Error ? error.message : "未知错误",
            variant: "destructive",
            duration: 1500,
          });
        }
      },
    });
  }, [files, toast, api, loadUnifiedFileList]);

  const handleSort = useCallback((column: SortConfig['column']) => {
    const direction = sortConfig.column === column && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ column, direction });

    // Sort files locally
    const sortedFiles = [...files].sort((a, b) => {
      if (a.type === 'parent_dir') return -1;
      if (b.type === 'parent_dir') return 1;
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;

      let aValue: any, bValue: any;

      switch (column) {
        case 'name':
          aValue = a.display_name.toLowerCase();
          bValue = b.display_name.toLowerCase();
          break;
        case 'type':
          aValue = a.type === 'directory' ? '目录' : getFileExtension(a.filename);
          bValue = b.type === 'directory' ? '目录' : getFileExtension(b.filename);
          break;
        case 'size':
          aValue = a.size || 0;
          bValue = b.size || 0;
          break;
        case 'created':
          aValue = new Date(a.upload_time || 0);
          bValue = new Date(b.upload_time || 0);
          break;
        case 'date':
          aValue = new Date(a.modified_time || a.upload_time || 0);
          bValue = new Date(b.modified_time || b.upload_time || 0);
          break;
        case 'permission':
          // 权限排序：公开=1, 私有=0, undefined=-1
          aValue = a.is_public === undefined ? -1 : (a.is_public ? 1 : 0);
          bValue = b.is_public === undefined ? -1 : (b.is_public ? 1 : 0);
          break;
      }

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    setFiles(sortedFiles);
  }, [files, sortConfig, setSortConfig, setFiles]);

  const handleCreateDirectoryConfirmed = useCallback(async (dirName: string) => {
    try {
      // 生成唯一目录名
      const uniqueDirName = generateUniqueDirectoryName(dirName, files);
      
      let fullPath = uniqueDirName;
      if (currentPath) {
        fullPath = `${currentPath}/${uniqueDirName}`;
      }
      fullPath = normalizePath(fullPath);

      await api.createUnifiedDirectory(fullPath);
      toast({
        title: "创建成功",
        description: `目录 ${uniqueDirName} 创建成功`,
        duration: 1500,
      });
      loadUnifiedFileList(true, currentPath);
    } catch (error) {
      toast({
        title: "创建失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
    }
  }, [files, api, toast, loadUnifiedFileList]);

  const handleCreateDirectory = useCallback(() => {
    setInputDialog({
      isOpen: true,
      title: "创建目录",
      description: "请输入目录名称",
      placeholder: "目录名称",
      onConfirm: handleCreateDirectoryConfirmed,
    });
  }, [handleCreateDirectoryConfirmed]);

  const handleCreateFile = useCallback(() => {
    setFileDialog({
      isOpen: true,
      filename: "未命名.md",
      isNewFile: true,
    });
  }, []);

  // 处理不同类型的URL输入
  const handleMediaDownload = useCallback(() => {
    setUrlInputType('media');
    setShowUrlInput(true);
  }, []);

  const handleFileDownload = useCallback(() => {
    setUrlInputType('file');
    setShowUrlInput(true);
  }, []);

  const handleWebpageExtract = useCallback(() => {
    setUrlInputType('webpage');
    setShowUrlInput(true);
  }, []);

  const handleTextPasted = useCallback(async (textContent: string) => {
    // 显示分析中的提示
    toast({
      title: "智能分析中...",
      description: "正在分析内容并生成文件名",
      duration: 2000,
    });

    try {
      // 使用AI智能分析生成文件名
      const { filename, suggestion } = await generateSmartFilename(textContent, files);
      
      // 构建完整路径
      let fullPath = filename;
      if (currentPath) {
        fullPath = `${currentPath}/${filename}`;
      }
      
      // 直接保存文件
      const isPublic = false;
      const file = createFileFromContent(textContent, fullPath);
      await api.uploadUnifiedFile(file, fullPath, isPublic);
      
      // 显示成功提示，包含AI分析结果
      const confidenceText = suggestion.confidence === 'high' ? '🤖 AI分析' : 
                            suggestion.confidence === 'medium' ? '🔍 智能检测' : '📝 默认命名';
      
      toast({
        title: "粘贴成功",
        description: `${confidenceText} - 文件 ${filename} 已创建`,
        duration: 2000,
      });
      
      // 刷新文件列表
      loadUnifiedFileList(true, currentPath);
      
      // 打开文件编辑对话框（现在作为现有文件）
      setFileDialog({
        isOpen: true,
        filename: fullPath,
        isNewFile: false,
      });
      
    } catch (error) {
      console.error('智能文件命名失败:', error);
      
      // Fallback: 使用原有的简单命名策略
      const timestamp = new Date().toLocaleString('zh-CN', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit', 
        hour12: false 
      }).replace(/[\s\-:/]/g, '');
      
      const fallbackFilename = `paste-${timestamp}.txt`;
      
      try {
        let fullPath = fallbackFilename;
        if (currentPath) {
          fullPath = `${currentPath}/${fallbackFilename}`;
        }
        
        const isPublic = false;
        const file = createFileFromContent(textContent, fullPath);
        await api.uploadUnifiedFile(file, fullPath, isPublic);
        
        toast({
          title: "粘贴成功",
          description: `文件 ${fallbackFilename} 已创建`,
          duration: 1500,
        });
        
        loadUnifiedFileList(true, currentPath);
        
        setFileDialog({
          isOpen: true,
          filename: fullPath,
          isNewFile: false,
        });
        
      } catch (saveError) {
        toast({
          title: "粘贴失败",
          description: saveError instanceof Error ? saveError.message : "保存粘贴内容失败",
          variant: "destructive",
          duration: 1500,
        });
      }
    }
  }, [api, currentPath, toast, loadUnifiedFileList, files]);
  
  const handleCloseFileDialog = useCallback(() => {
    setFileDialog(null);
  }, []);

  // 批量操作处理函数
  const handleToggleSelection = useCallback((filename: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.shiftKey && selectedFiles.size > 0) {
      // Shift+点击：选择范围
      const currentIndex = files.findIndex(f => f.filename === filename);
      const lastSelectedIndex = files.findIndex(f => selectedFiles.has(f.filename));
      
      if (currentIndex !== -1 && lastSelectedIndex !== -1) {
        const start = Math.min(currentIndex, lastSelectedIndex);
        const end = Math.max(currentIndex, lastSelectedIndex);
        
        const newSelection = new Set(selectedFiles);
        for (let i = start; i <= end; i++) {
          if (files[i].type !== 'parent_dir') {
            newSelection.add(files[i].filename);
          }
        }
        useAppStore.getState().setSelectedFiles(newSelection);
        return;
      }
    }
    
    // 直接切换选择状态，无需按键修饰符
    toggleFileSelection(filename);
  }, [files, selectedFiles, toggleFileSelection]);

  const handleSelectAll = useCallback(() => {
    selectAll();
  }, [selectAll]);

  const handleClearSelection = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleBatchDownload = useCallback(async (filenames: string[]) => {
    try {
      if (filenames.length === 1) {
        // 单个文件/目录直接下载
        await handleDownload(filenames[0]);
        return;
      }

      // 多个文件打包下载
      const blob = await api.batchDownload(filenames);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `files_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "批量下载成功",
        description: `已下载 ${filenames.length} 个项目`,
        duration: 1500,
      });
    } catch (error) {
      toast({
        title: "批量下载失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
    }
  }, [api, toast, handleDownload]);

  const handleBatchDelete = useCallback((filenames: string[]) => {
    setConfirmDialog({
      isOpen: true,
      title: "确认批量删除",
      description: `确定要删除这 ${filenames.length} 个项目吗？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          await batchDeleteFiles(filenames);
          clearSelection();
        } catch (error) {
          // 错误处理已经在batchDeleteFiles中完成
        }
      },
    });
  }, [batchDeleteFiles, clearSelection]);



  // 添加权限切换处理函数
  const handleChangeFilePermission = useCallback(async (filename: string, isPublic: boolean) => {
    try {
      await changeFilePermission(filename, isPublic);
    } catch (error) {
      // 错误处理已经在changeFilePermission中完成
    }
  }, [changeFilePermission]);

  // 处理文件/目录锁定切换
  const handleToggleLock = useCallback(async (fileName: string, isDirectory: boolean, currentLocked: boolean) => {
    try {
      const newLocked = !currentLocked;
      let result;
      
      if (isDirectory) {
        result = await api.setDirectoryLock(fileName, newLocked);
      } else {
        result = await api.setFileLock(fileName, newLocked);
      }
      
      if (result.success) {
        toast({
          title: `${newLocked ? '锁定' : '解锁'}成功`,
          description: `${isDirectory ? '目录' : '文件'}已${newLocked ? '锁定' : '解锁'}`,
          duration: 1500,
        });
        loadUnifiedFileList(true, currentPath); // 刷新文件列表
      } else {
        throw new Error(result.error || `${newLocked ? '锁定' : '解锁'}失败`);
      }
    } catch (error) {
      const action = !currentLocked ? '锁定' : '解锁';
      toast({
        title: `${action}失败`,
        description: error instanceof Error ? error.message : '未知错误',
        variant: "destructive",
        duration: 1500,
      });
    }
  }, [api, toast, loadUnifiedFileList]);

  // 显示目录权限设置对话框
  const handleShowDirectoryPermissionDialog = useCallback((dirPath: string, currentPermission: boolean) => {
    setDirectoryPermissionDialog({
      isOpen: true,
      dirPath,
      currentPermission,
      loading: false,
    });
  }, []);

  // 目录权限确认处理函数
  const handleConfirmDirectoryPermission = useCallback(async (
    isPublic: boolean, 
    applyToChildren: boolean
  ) => {
    if (!directoryPermissionDialog) return;

    // 设置加载状态
    setDirectoryPermissionDialog(prev => prev ? { ...prev, loading: true } : null);

    try {
      const result = await api.setDirectoryPermission(
        directoryPermissionDialog.dirPath, 
        isPublic, 
        applyToChildren
      );
      
      if (result.success) {
        toast({
          title: "目录权限修改成功",
          description: result.message || `目录已设置为${isPublic ? '公开' : '私有'}${applyToChildren ? '，并已应用到所有子项目' : ''}`,
          duration: 2000,
        });
        
        // 关闭对话框
        setDirectoryPermissionDialog(null);
        
        // 刷新文件列表
        loadUnifiedFileList(true, currentPath);
      } else {
        throw new Error(result.error || '目录权限修改失败');
      }
    } catch (error) {
      toast({
        title: "目录权限修改失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 2000,
      });
      
      // 重置加载状态但保持对话框打开
      setDirectoryPermissionDialog(prev => prev ? { ...prev, loading: false } : null);
    }
  }, [api, toast, loadUnifiedFileList, directoryPermissionDialog]);

  // 关闭目录权限对话框
  const handleCloseDirectoryPermissionDialog = useCallback(() => {
    setDirectoryPermissionDialog(null);
  }, []);

  const handleBatchChangePermission = useCallback(async (filenames: string[], isPublic: boolean) => {
    try {
      await batchChangePermission(filenames, isPublic);
      clearSelection();
    } catch (error) {
      // 错误处理已经在batchChangePermission中完成
    }
  }, [batchChangePermission, clearSelection]);

  const handleBatchLock = useCallback(async (filenames: string[], locked: boolean) => {
    try {
      const result = await api.batchSetLock(filenames, locked);
      
      // 检查是否有成功锁定/解锁的文件（即使result.success为false，可能是部分成功）
      const successCount = result.data?.success_count || 0;
      const failedCount = (result.data?.total_count || filenames.length) - successCount;
      
      if (successCount > 0) {
        if (failedCount === 0) {
          toast({
            title: `批量${locked ? '锁定' : '解锁'}成功`,
            description: `已${locked ? '锁定' : '解锁'} ${successCount} 个项目`,
            duration: 1500,
          });
        } else {
          toast({
            title: `部分${locked ? '锁定' : '解锁'}成功`,
            description: `成功 ${successCount} 个，失败 ${failedCount} 个`,
            variant: "destructive",
            duration: 2000,
          });
        }
      } else {
        throw new Error(result.error || `批量${locked ? '锁定' : '解锁'}失败`);
      }
      
      clearSelection();
      loadUnifiedFileList(true, currentPath); // 刷新文件列表
    } catch (error) {
      toast({
        title: `批量${locked ? '锁定' : '解锁'}失败`,
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
    }
  }, [api, toast, clearSelection, loadUnifiedFileList]);

  // Initialize hooks after all function definitions
  const { showPasteIndicator } = usePasteUpload({ 
    onFileUpload: handleFileUpload,
    onFileListRefresh: () => loadUnifiedFileList(true, currentPath),
    onLinkDetected: (url: string) => {
      setLinkPasteDialog({ isOpen: true, url });
    },
    onTextDetected: handleTextPasted
  });
  const { dragState, handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd } = 
    useInternalDragDrop({ files, onRefresh: () => loadUnifiedFileList(true, currentPath) });

  // Keyboard navigation
  useKeyboardNavigation({
    files,
    onFileClick: handleFileClick,
    onDirectoryClick: handleDirectoryClick,
    onDelete: showDeleteConfirm,
    onCopyLink: handleCopyLink,
    onDownload: handleDownload,
    onShare: handleShare,
    onCreateFile: handleCreateFile,
    onCreateDirectory: handleCreateDirectory,
    onSelectAll: handleSelectAll,
    onClearSelection: handleClearSelection,
    onRefresh: () => loadUnifiedFileList(true, currentPath),
    onToggleViewMode: () => setViewMode(viewMode === 'list' ? 'grid' : 'list'),
    onShowSettings: () => setShowSettings(true),
    onShowShortcuts: () => setShowShortcuts(true),
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileUpload,
    noClick: true,
    noKeyboard: true,
  });

  // Update API config when store config changes
  useEffect(() => {
    api.updateConfig(config);
    wsClient.updateConfig(config);
  }, [config, api, wsClient]);

  // 监听URL下载任务变化
  useEffect(() => {
    if (!config.serverAddress) {
      return;
    }
    

    const downloadManager = getUrlDownloadManager(config);
    
    // 立即设置WebSocket客户端，无论是否已连接
    downloadManager.setWebSocketClient(wsClient);
    
    const unsubscribe = downloadManager.subscribe((tasks) => {
      setDownloadTasks(tasks);
    });

    return unsubscribe;
  }, [config, wsClient]);

  // WebSocket connection and event handling
  useEffect(() => {
    if (!config.serverAddress) {
      return;
    }
    

    // 连接WebSocket
    wsClient.connect().catch(console.error);

    // 设置事件监听器
    const handleConnectionStatus = () => {
      setWsConnectionStatus(wsClient.getConnectionState());
    };

    const handleFileSystemEvent = (event: FileSystemEvent) => {
      console.log('File system event:', event);
      
      // 根据事件类型显示通知
      switch (event.type) {
        case 'file_created': {
          // 显示文件创建通知
          const action = event.file_info?.action;
          let actionText = '创建';
          if (action === 'upload' || action === 'chunk_upload') {
            actionText = '上传';
          } else if (action === 'mkdir') {
            actionText = '创建';
          } else if (action === 'cobalt_download') {
            actionText = '下载';
          }
          
          toast({
            title: `文件已${actionText}`,
            description: `${event.file_path} 已被${actionText}`,
            duration: 1500,
          });
          break;
        }
        
        case 'file_updated':
          // 文件更新通知由UnifiedFileDialog内部处理，这里不显示Toast
          // 只在控制台记录
          console.log(`文件更新: ${event.file_path}`);
          break;
        
        case 'file_renamed':
          toast({
            title: "文件已重命名",
            description: `${event.old_path} → ${event.new_path}`,
            duration: 1500,
          });
          break;
        
        case 'file_deleted':
          toast({
            title: "文件已删除",
            description: `${event.file_path} 已被删除`,
            duration: 1500,
          });
          break;
        
        case 'batch_operation':
          toast({
            title: `🔄 批量${event.operation === 'delete' ? '删除' : event.operation}`,
            description: `${event.files?.length || 0} 个文件已处理`,
            duration: 1500,
          });
          break;
      }

      // 如果事件影响当前目录，刷新文件列表
      const currentDir = currentPathRef.current || "";
      const affectedDirs = [
        event.directory,
        ...(event.affected_directories || [])
      ].filter(dir => dir !== undefined); // 允许空字符串，只过滤undefined

      // 如果没有明确指定影响的目录，尝试从文件路径推断
      if (affectedDirs.length === 0 && event.file_path) {
        const filePath = event.file_path;
        const fileDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
        affectedDirs.push(fileDir);
        console.log(`从文件路径推断影响目录: '${fileDir}'`);
      }

      // 如果还是没有影响目录且有旧路径（重命名操作），从旧路径推断
      if (affectedDirs.length === 0 && event.old_path) {
        const oldPath = event.old_path;
        const oldDir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
        affectedDirs.push(oldDir);
        console.log(`从旧文件路径推断影响目录: '${oldDir}'`);
      }

      // 如果还是没有影响目录且有新路径（重命名操作），从新路径推断
      if (affectedDirs.length === 0 && event.new_path) {
        const newPath = event.new_path;
        const newDir = newPath.includes('/') ? newPath.substring(0, newPath.lastIndexOf('/')) : '';
        affectedDirs.push(newDir);
        console.log(`从新文件路径推断影响目录: '${newDir}'`);
      }

      console.log(`WebSocket事件处理: 当前目录='${currentDir}', 影响目录=[${affectedDirs.map(d => `'${d}'`).join(', ')}]`);

      // 判断是否需要刷新文件列表
      let shouldRefresh = false;
      
      if (affectedDirs.length === 0) {
        // 如果仍然没有指定影响的目录，默认刷新（保守策略）
        shouldRefresh = true;
        console.log("没有指定影响目录，默认刷新文件列表");
      } else {
        // 检查当前目录是否在影响列表中
        shouldRefresh = affectedDirs.includes(currentDir);
      }

      if (shouldRefresh) {
        console.log("目录匹配，刷新文件列表");
        
        // 清除之前的延迟刷新任务
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
        
        // 根据事件类型决定刷新延迟时间
        let delay = 200; // 默认200ms，更快响应
        
        // 对于文件更新事件，立即刷新（通常是编辑器保存等操作）
        if (event.type === 'file_updated') {
          delay = 50;
        }
        // 对于批量操作，稍微延迟一点等待所有操作完成
        else if (event.type === 'batch_operation') {
          delay = 300;
        }
        
        // 使用防抖机制避免过于频繁的刷新
        refreshTimeoutRef.current = setTimeout(() => {
          loadUnifiedFileList(true, currentPath);
          refreshTimeoutRef.current = undefined;
        }, delay);
      } else {
        console.log("目录不匹配，不刷新");
      }
    };

    // 跟踪是否已经订阅过，避免重复订阅
    let hasSubscribed = false;

    // 连接成功后订阅目录的处理函数
    const handleConnected = () => {
      handleConnectionStatus();
      
      if (!hasSubscribed) {
        const currentDir = currentPathRef.current || "";
        console.log(`WebSocket连接成功，订阅目录: '${currentDir}'`);
        wsClient.subscribeToDirectory(currentDir);
        hasSubscribed = true;
      }
    };

    wsClient.on('connected', handleConnected);
    wsClient.on('disconnected', handleConnectionStatus);
    wsClient.on('error', handleConnectionStatus);
    wsClient.on('file_system_event', handleFileSystemEvent);

    // 状态更新
    handleConnectionStatus();

    // 如果已经连接，立即订阅
    if (wsClient.isConnected() && !hasSubscribed) {
      const currentDir = currentPathRef.current || "";
      console.log(`WebSocket已连接，订阅目录: '${currentDir}'`);
      wsClient.subscribeToDirectory(currentDir);
      hasSubscribed = true;
    }

    return () => {
      // 清理WebSocket事件监听器
      wsClient.off('connected', handleConnected);
      wsClient.off('disconnected', handleConnectionStatus);
      wsClient.off('error', handleConnectionStatus);
      wsClient.off('file_system_event', handleFileSystemEvent);
      
      // 清理防抖定时器
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = undefined;
      }
    };
  }, [config.serverAddress, config.authToken, wsClient, toast, loadUnifiedFileList]);

  // 当路径改变时，订阅新目录
  useEffect(() => {
    if (wsClient.isConnected()) {
      wsClient.subscribeToDirectory(currentPath || "");
    }
  }, [currentPath, wsClient]);

  // Load initial file list using unified API
  useEffect(() => {
    // 使用 setTimeout 确保在状态完全初始化后再加载文件列表
    // 这样可以避免重复请求，同时确保列表能够正确加载
    const timer = setTimeout(() => {
      if (config.serverAddress && !initialLoadRef.current) {
        initialLoadRef.current = true;
        loadUnifiedFileList(false, ''); // 明确指定根目录
      }
    }, 0);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.serverAddress, config.authToken]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background" {...getRootProps()}>
      <input {...getInputProps()} />
      
      {/* Header */}
      <header className={cn(
        "shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        isMobile ? "h-14" : "h-12"
      )}>
        <div className={cn(
          "h-full flex items-center",
          isMobile ? "px-2" : "px-4"
        )}>
          <div className="w-full flex flex-row items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center flex-wrap gap-2 sm:gap-4">
              <button 
                onClick={() => window.location.href = '/'}
                className="text-xl font-semibold text-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-2"
              >
                <Share2 size={20} />
                OneShare
              </button>
              
              <Breadcrumbs currentPath={currentPath} onNavigate={handleDirectoryClick} />
              
              {/* WebSocket连接状态指示器 - 移动端隐藏文字 */}
              {!isMobile && (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    wsConnectionStatus === 'CONNECTED' ? 'bg-green-500' : 
                    wsConnectionStatus === 'CONNECTING' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <span className="text-xs text-muted-foreground">
                    {wsConnectionStatus === 'CONNECTED' ? '在线' : 
                     wsConnectionStatus === 'CONNECTING' ? '连接中' : '离线'}
                  </span>
                </div>
              )}
              {isMobile && (
                <div className={`w-2 h-2 rounded-full ${
                  wsConnectionStatus === 'CONNECTED' ? 'bg-green-500' : 
                  wsConnectionStatus === 'CONNECTING' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              {/* 三个独立的链接处理按钮 */}
              <Button 
                variant="outline" 
                size="sm" 
                className="px-2 sm:px-3"
                onClick={handleMediaDownload}
                title="流媒体下载"
              >
                <Video className="w-4 h-4" />
                <span className="hidden sm:inline sm:ml-1">流媒体</span>
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="px-2 sm:px-3"
                onClick={handleFileDownload}
                title="文件下载"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline sm:ml-1">下载</span>
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="px-2 sm:px-3"
                onClick={handleWebpageExtract}
                title="网页提取"
              >
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline sm:ml-1">提取</span>
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="default" size="sm" className="px-2 sm:px-3">
                    <Plus className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">新建</span>
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={handleCreateFile}>
                    <FilePlus className="w-4 h-4 mr-2" />
                    新建文件
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCreateDirectory}>
                    <FolderPlus className="w-4 h-4 mr-2" />
                    新建目录
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => document.getElementById('file-upload')?.click()}>
                    <Upload className="w-4 h-4 mr-2" />
                    上传文件
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => document.getElementById('dir-upload')?.click()}>
                    <FolderPlus className="w-4 h-4 mr-2" />
                    上传目录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <div className="flex gap-1 ml-2">
                {/* 视图切换按钮 - 移动端隐藏，因为移动端固定使用网格视图 */}
                {!isMobile && (
                  <div className="flex items-center bg-gray-100 rounded-lg p-1 mr-1">
                    <Button
                      variant={viewMode === 'list' ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="h-7 px-1.5"
                      title="列表视图"
                    >
                      <List className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="h-7 px-1.5"
                      title="网格视图"
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} title="设置">
                  <Settings className="w-4 h-4" />
                </Button>
                
                {/* 移动端隐藏一些非必要的辅助按钮 */}
                {!isMobile && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => setShowApiDoc(true)} title="API文档">
                      <Code className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setShowAppFeatures(true)} title="功能介绍">
                      <Info className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setShowShortcuts(true)} title="快捷键">
                      <Keyboard className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">加载中...</div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <div className="text-lg mb-2">当前目录为空</div>
              <div className="text-sm">请上传文件</div>
            </div>
          </div>
        ) : (
          <div className="h-full">
            <FileTable
              files={files}
              selectedFiles={selectedFiles}
              onFileClick={handleFileClick}
              onDirectoryClick={handleDirectoryClick}
              onDownload={handleDownload}
              onCopyLink={handleCopyLink}
              onShare={handleShare}
              onDelete={showDeleteConfirm}
              onRename={handleRename}
              onChangePermission={handleChangeFilePermission}
              onChangeDirectoryPermission={handleShowDirectoryPermissionDialog}
              onToggleLock={handleToggleLock}
              onSort={handleSort}
              onToggleSelection={handleToggleSelection}
              onSelectAll={handleSelectAll}
              onClearSelection={handleClearSelection}
              buildDirectUrl={(fileName: string) => api.buildUnifiedDirectUrl(fileName)}
              dragState={dragState}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          </div>
        )}
      </main>

      {/* Drag Overlay */}
      {isDragActive && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-background border-2 border-dashed border-primary rounded-lg p-8 text-center">
            <Upload className="w-12 h-12 mx-auto mb-4 text-primary" />
            <div className="text-xl font-medium mb-2">拖拽文件到此处上传</div>
            <div className="text-sm text-muted-foreground">
              支持多文件上传，每个文件最大 5000MB
            </div>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        id="file-upload"
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleFileUpload(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />
      
      <input
        id="dir-upload"
        type="file"
        multiple
        // @ts-expect-error 自定义属性在TypeScript类型中不存在
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleFileUpload(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />

      {/* Upload Progress */}
      {uploadProgress && <UploadProgress progress={uploadProgress} />}


      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* API Documentation Dialog */}
      <ApiDocDialog
        isOpen={showApiDoc}
        onClose={() => setShowApiDoc(false)}
      />

      {/* Shortcuts Help Dialog */}
      <ShortcutsDialog
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          description={confirmDialog.description}
          confirmText={confirmDialog.title === "分享文件" ? "复制私有链接" : "删除"}
          variant={confirmDialog.title === "分享文件" ? "default" : "destructive"}
        />
      )}

      {/* Input Dialog */}
      {inputDialog && (
        <InputDialog
          isOpen={inputDialog.isOpen}
          onClose={() => setInputDialog(null)}
          onConfirm={inputDialog.onConfirm}
          title={inputDialog.title}
          description={inputDialog.description}
          placeholder={inputDialog.placeholder}
          defaultValue={inputDialog.defaultValue}
        />
      )}

      {/* Directory Permission Dialog */}
      {directoryPermissionDialog && (
        <DirectoryPermissionDialog
          isOpen={directoryPermissionDialog.isOpen}
          onClose={handleCloseDirectoryPermissionDialog}
          onConfirm={handleConfirmDirectoryPermission}
          directoryName={directoryPermissionDialog.dirPath}
          currentPermission={directoryPermissionDialog.currentPermission}
          loading={directoryPermissionDialog.loading}
        />
      )}

      {/* Paste Indicator */}
      <PasteIndicator show={showPasteIndicator} />
      
      {/* Unified File Dialog */}
      {fileDialog && (
        <UnifiedFileDialog
          isOpen={fileDialog.isOpen}
          onClose={handleCloseFileDialog}
          filename={fileDialog.filename}
          config={config}
          isNewFile={fileDialog.isNewFile}
          isReadOnly={fileDialog.isReadOnly}
          onFileUpdate={() => loadUnifiedFileList(true, currentPath)}
          wsClient={wsClient}
          isPublic={false}
          initialContent={fileDialog.initialContent}
        />
      )}

      {/* URL Download Progress */}
      {downloadTasks.map((task) => (
        <UrlDownloadProgress
          key={task.id}
          url={task.url}
          filename={task.filename}
          progress={task.progress}
          downloadedBytes={task.downloadedBytes}
          totalBytes={task.totalBytes}
          isComplete={task.isComplete}
          isError={task.isError}
          errorMessage={task.errorMessage}
          onCancel={() => {
            const downloadManager = getUrlDownloadManager(config);
            downloadManager.cancelDownload(task.id);
          }}
          onClose={() => {
            const downloadManager = getUrlDownloadManager(config);
            downloadManager.removeTask(task.id);
          }}
        />
      ))}

      {/* URL Input Modal */}
      <UrlInputModal
        isOpen={showUrlInput}
        onClose={() => setShowUrlInput(false)}
        onFileListRefresh={() => loadUnifiedFileList(true, currentPath)}
        onLinkDetected={(url) => {
          setShowUrlInput(false);
          setLinkPasteDialog({ isOpen: true, url });
        }}
        type={urlInputType}
      />

      {/* App Features Dialog */}
      <AppFeaturesDialog
        isOpen={showAppFeatures}
        onClose={() => setShowAppFeatures(false)}
      />

      {/* Link Paste Dialog */}
      <LinkPasteDialog
        isOpen={linkPasteDialog.isOpen}
        onOpenChange={(open) => setLinkPasteDialog(prev => ({ ...prev, isOpen: open }))}
        url={linkPasteDialog.url}
        onPasteAsText={(text) => {
          // 直接粘贴为文本文件
          const timestamp = new Date().toLocaleString('zh-CN', { 
            year: 'numeric', month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit', second: '2-digit', 
            hour12: false 
          }).replace(/[\s\-:/]/g, '');
          const fileName = `paste-${timestamp}.md`;
          const file = new File([text], fileName, { type: 'text/plain' });
          handleFileUpload([file]);
        }}
        onProcessComplete={(result) => {
          // 提交任务后刷新文件列表
          loadUnifiedFileList(true, currentPath);
          toast({
            title: "任务已提交",
            description: result.filename ? `文件将保存为: ${result.filename}` : "操作已完成",
          });
        }}
      />

      {/* Floating Batch Actions */}
      <FloatingBatchActions
        selectedFiles={selectedFiles}
        files={files}
        onBatchDownload={handleBatchDownload}
        onBatchDelete={handleBatchDelete}
        onBatchChangePermission={handleBatchChangePermission}
        onBatchLock={handleBatchLock}
        onClearSelection={clearSelection}
      />

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />

    </div>
  );
}

export default App;