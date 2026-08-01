import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Edit3, 
  Eye, 
  Copy, 
  Save,
  X,
  ExternalLink,
  Wand2,
  ChevronDown,
  FileText,
  Sparkles,
  Type
} from 'lucide-react';
import { CollaborativeMonacoEditor } from './CollaborativeMonacoEditor';
import { MobileTextEditor } from './MobileTextEditor';
import { ModernMarkdownViewer } from './ModernMarkdownViewer';
import { FileStatusIndicator, type FileStatus } from './FileStatusIndicator';
import { CollaborationIndicator, type CollaborationStatus } from './CollaborationIndicator';
import { useToast } from '@/hooks/use-toast';
import { FileServerAPI } from '@/lib/api';
import { WebSocketClient, type FileSystemEvent } from '@/lib/websocket';
import { isModifierPressed, isMobile, isTouchDevice } from '@/lib/platform';
import { useAppStore } from '@/stores/appStore';
import { isCodeFile, isMarkdownFile, isTextFile } from '@/constants/fileExtensions';
import { cn } from '@/lib/utils';
import { generateText, streamText } from '@/lib/aiClient';
import { getOrCreateShare, createShareUrl } from '@/lib/shareUtils';
import type { AppConfig } from '@/types';

// Utility function to convert string content to File object
const createFileFromContent = (content: string, filename: string): File => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  return new File([blob], filename, { type: 'text/plain' });
};

// 主题持久化存储键
const THEME_STORAGE_KEY = 'monaco-editor-theme';

interface UnifiedFileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  config: AppConfig;
  isNewFile?: boolean;
  isReadOnly?: boolean;
  onFileUpdate?: () => void;
  wsClient?: WebSocketClient;
  isPublic?: boolean;
  initialContent?: string;
}

export function UnifiedFileDialog({ 
  isOpen, 
  onClose, 
  filename, 
  config, 
  isNewFile = false,
  isReadOnly = false,
  onFileUpdate,
  wsClient: externalWsClient,
  isPublic = false,
  initialContent = ''
}: UnifiedFileDialogProps) {
  const { toast } = useToast();
  const { currentPath } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  const wsClient = React.useMemo(() => {
    return externalWsClient || new WebSocketClient(config);
  }, [externalWsClient, config]);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'preview' | 'edit'>(isNewFile ? 'edit' : 'preview');
  const [isModified, setIsModified] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [currentFilename, setCurrentFilename] = useState(filename);
  const [displayFilename, setDisplayFilename] = useState(() => filename.split('/').pop() || filename);
  
  // 提取文件名（去除路径）的辅助函数
  const getDisplayFilename = useCallback((fullPath: string) => {
    return fullPath.split('/').pop() || fullPath;
  }, []);
  // 添加一个状态来控制编辑相关UI的显示，避免因修改文件名导致闪烁
  const [showEditControls, setShowEditControls] = useState(false);
  // 添加当前主题状态
  const [currentTheme, setCurrentTheme] = useState(() => {
    // 从 localStorage 读取保存的主题,如果没有则使用默认主题
    return localStorage.getItem(THEME_STORAGE_KEY) || 'vs';
  });
  
  // 文件状态指示器
  const [fileStatus, setFileStatus] = useState<FileStatus>('synced');
  
  // 协作状态
  const [collaborationStatus, setCollaborationStatus] = useState<CollaborationStatus>({
    isMultiUser: false,
    userCount: 0
  });

  // AI 处理状态
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  
  // 内容解读弹窗状态
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analysisContent, setAnalysisContent] = useState('');
  const [isAnalysisProcessing, setIsAnalysisProcessing] = useState(false);
  const analysisContainerRef = useRef<HTMLDivElement>(null);


  // 文件类型检测
  const getFileInfo = useCallback((filename: string) => {
    const isCode = isCodeFile(filename);
    const isMarkdown = isMarkdownFile(filename);
    const isText = isTextFile(filename);
    
    return {
      isCode,
      isMarkdown,
      isText,
      isEditable: isCode || isMarkdown || isText,
      supportsPreview: isMarkdown || isText || isCode
    };
  }, []);

  const fileInfo = getFileInfo(currentFilename);

  // AI 功能函数
  const handleAutoNaming = useCallback(async () => {
    if (!editorContent.trim() || isAIProcessing) return;
    
    setIsAIProcessing(true);
    try {
      const content = editorContent.substring(0, 2000);
      // 根据内容特征判断合适的扩展名
      const hasMarkdown = editorContent.includes('#') || editorContent.includes('**') || editorContent.includes('`');
      const suggestedExtension = hasMarkdown ? '.md' : '.txt';
      
      const prompt = `${content}\n\n请分析以上内容并为其生成一个简洁、描述性的文件名（包含扩展名，总长度不超过30个字符），后缀名可以是md/txt/py/js/java/tsx等代码后缀，不允许使用pdf/docx/xlsx等作为后缀。直接返回文件名：`;
      const messages = [{ role: 'user' as const, content: prompt }];
      
      const result = await generateText(messages);
      
      if (result) {
        // 清理文件名，移除多余的引号和不安全字符
        let suggestedName = result.trim()
          .replace(/^["']|["']$/g, '') // 移除开头和结尾的引号
          .replace(/[<>:"/\\|?*]/g, '') // 移除文件系统不安全字符
          .replace(/\s+/g, '-') // 空格替换为连字符
          .substring(0, 50); // 限制总长度
        
        // 确保文件名有扩展名
        if (!suggestedName.includes('.')) {
          suggestedName += suggestedExtension;
        }
        
        if (!suggestedName || suggestedName === suggestedExtension) {
          // 如果AI生成失败，使用内容的第一行
          const firstLine = editorContent.split('\n')[0];
          if (firstLine.startsWith('#')) {
            suggestedName = firstLine.replace(/^#+\s*/, '').trim();
          } else {
            suggestedName = firstLine.trim().substring(0, 25);
          }
          suggestedName = suggestedName
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, '-') + suggestedExtension;
        }
        
        if (suggestedName) {
          setDisplayFilename(suggestedName);
          setIsModified(true);
          setFileStatus('modified');
          
          toast({
            title: "文件名已生成",
            description: `建议文件名: ${suggestedName}`,
            duration: 2000,
          });
        }
      }
    } catch (error) {
      toast({
        title: "自动命名失败",
        description: error instanceof Error ? error.message : "生成文件名时发生错误",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsAIProcessing(false);
    }
  }, [editorContent, isAIProcessing, fileInfo.isMarkdown, toast]);

  const handleAutoFormat = useCallback(async () => {
    if (!editorContent.trim() || isAIProcessing) return;
    
    setIsAIProcessing(true);
    
    // 保存原始内容
    const originalContent = editorContent;
    
    // 清空编辑区内容
    setEditorContent('');
    setIsModified(true);
    setFileStatus('modified');
    
    try {
      const prompt = `${originalContent}\n\n请帮我对以上文本内容进行排版，使其更加清晰易读。如果是代码，请保持代码格式，并确保代码块正确缩进。如果是文本，请使用适当的段落和列表格式。直接返回结果：`;
      const messages = [{ role: 'user' as const, content: prompt }];
      
      await streamText(
        messages,
        (chunk) => {
          setEditorContent(prev => prev + chunk);
        },
        () => {
          setIsAIProcessing(false);
          toast({
            title: "格式化完成",
            description: "内容已自动格式化",
            duration: 2000,
          });
        },
        (error) => {
          setIsAIProcessing(false);
          toast({
            title: "格式化失败",
            description: error,
            variant: "destructive",
            duration: 3000,
          });
        }
      );
    } catch (error) {
      setIsAIProcessing(false);
      toast({
        title: "格式化失败",
        description: error instanceof Error ? error.message : "格式化内容时发生错误",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [editorContent, isAIProcessing, toast]);

  const handleContentAnalysis = useCallback(async () => {
    if (!editorContent.trim() || isAnalysisProcessing) return;
    
    setShowAnalysisModal(true);
    setAnalysisContent('');
    setIsAnalysisProcessing(true);
    
    try {
      const content = editorContent.length > 20000 ? editorContent.substring(0, 20000) : editorContent;
      const prompt = `请仔细分析以下内容，提供深入的解读和分析，包括但不限于：主要观点、核心概念、逻辑结构、优缺点、可能的改进建议等。请使用Markdown格式，包含适当的emoji图标来增强可读性：\n\n${content}`;
      const messages = [{ role: 'user' as const, content: prompt }];
      
      await streamText(
        messages,
        (chunk) => {
          setAnalysisContent(prev => prev + chunk);
        },
        () => {
          setIsAnalysisProcessing(false);
        },
        (error) => {
          setIsAnalysisProcessing(false);
          toast({
            title: "分析失败",
            description: error,
            variant: "destructive",
            duration: 3000,
          });
        }
      );
    } catch (error) {
      setIsAnalysisProcessing(false);
      toast({
        title: "分析失败",
        description: error instanceof Error ? error.message : "分析内容时发生错误",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [editorContent, isAnalysisProcessing, toast]);

  // 自动滚动到分析内容的最新位置
  useEffect(() => {
    if (analysisContent && analysisContainerRef.current) {
      analysisContainerRef.current.scrollTop = analysisContainerRef.current.scrollHeight;
    }
  }, [analysisContent]);

  // 复制分析内容到剪贴板
  const copyAnalysisContent = useCallback(async () => {
    if (!analysisContent) return;

    try {
      await navigator.clipboard.writeText(analysisContent);
      toast({
        title: "复制成功",
        description: "分析内容已复制到剪贴板",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "复制失败",
        description: "无法复制分析内容",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [analysisContent, toast]);

  // 手动保存函数
  const saveFileContent = useCallback(async (content: string) => {
    if (!filename && !isNewFile) return;
    
    try {
      setFileStatus('saving');
      
      if (isNewFile) {
        // 新文件使用上传接口
        const file = createFileFromContent(content, filename);
        await api.uploadUnifiedFile(file, filename, isPublic);
      } else {
        // 现有文件使用内容更新接口
        await api.updateFileContent(filename, content);
      }
      
      // 立即更新本地状态，避免WebSocket通知触发冲突
      setContent(content);
      setIsModified(false);
      setFileStatus('synced');
      
      if (onFileUpdate) {
        onFileUpdate();
      }
    } catch (error) {
      setFileStatus('conflict');
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
      throw error;
    }
  }, [filename, isNewFile, api, setContent, setIsModified, setFileStatus, onFileUpdate, toast]);

  // Update API config when store config changes
  useEffect(() => {
    api.updateConfig(config);
    if (!externalWsClient) {
      wsClient.updateConfig(config);
    }
  }, [config, api, wsClient, externalWsClient]);

  // Load file content when dialog opens (but not for new files)
  useEffect(() => {
    if (isOpen && filename && !isNewFile) {
      loadFileContent();
    }
  }, [isOpen, filename, isNewFile]);

  // Reset states when filename changes
  useEffect(() => {
    setCurrentFilename(filename);
    setDisplayFilename(filename.split('/').pop() || filename);
    // 在文件加载时确定编辑控件是否显示，之后不再改变
    setShowEditControls(isNewFile || getFileInfo(filename).isEditable);
    if (isNewFile) {
      setMode('edit');
      setContent(initialContent);
      setEditorContent(initialContent);
      setIsModified(!!initialContent);
      setFileStatus(initialContent ? 'modified' : 'synced');
    } else {
      setMode('preview');
      setIsModified(false);
      setEditorContent('');
      setFileStatus('synced');
    }
  }, [filename, isNewFile, initialContent, getFileInfo]);


  const loadFileContent = useCallback(async () => {
    if (!filename) return;
    
    setIsLoading(true);
    try {
      const response = await api.getFileContent(filename);
      if (response.success && response.data) {
        const fileContent = response.data.content || '';
        setContent(fileContent);
        setEditorContent(fileContent);
        setIsModified(false);
        setFileStatus('synced');
      } else {
        throw new Error(response.error || '获取文件内容失败');
      }
    } catch (error) {
      toast({
        title: "加载失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [filename, api, toast, onClose]);

  const handleSave = useCallback(async () => {
    console.log('📁 handleSave 被调用:', { 
      isModified, 
      isNewFile, 
      filename, 
      displayFilename,
      editorContentLength: editorContent.length,
      contentLength: content.length
    });
    if (!isModified && !isNewFile) {
      console.log('❌ handleSave 退出: 没有修改且不是新文件');
      return;
    }
    
    // 如果只是内容变化，直接保存
    const originalDisplayName = getDisplayFilename(filename);
    if (!isNewFile && displayFilename === originalDisplayName && editorContent !== content) {
      await saveFileContent(editorContent);
      return;
    }
    
    try {
      // 构建路径：区分新建文件和现有文件
      let originalFullPath: string;
      let newFullPath: string;
      
      if (isNewFile) {
        // 新建文件：只使用文件名部分，构建完整路径
        originalFullPath = ''; // 新建文件没有原路径
        newFullPath = currentPath ? `${currentPath}/${displayFilename}` : displayFilename;
        
        // 检查是否存在同名文件并自动重命名
        try {
          const listResponse = await api.listUnifiedFiles(currentPath || '', isPublic ? 'public' : 'all');
          if (listResponse.success && listResponse.data?.files) {
            const existingFiles = listResponse.data.files;
            
            // 分离文件名和扩展名
            let currentName = displayFilename;
            let baseName = currentName;
            let extension = '';
            
            if (currentName.includes('.')) {
              const lastDotIndex = currentName.lastIndexOf('.');
              baseName = currentName.substring(0, lastDotIndex);
              extension = currentName.substring(lastDotIndex);
            }
            
            // 检查并自动生成新文件名
            let counter = 1;
            while (existingFiles.some(file => 
              file.type !== 'directory' && 
              file.type !== 'parent_dir' && 
              file.display_name === currentName)) {
              currentName = `${baseName}(${counter})${extension}`;
              counter++;
            }
            
            // 更新路径
            if (currentName !== displayFilename) {
              newFullPath = currentPath ? `${currentPath}/${currentName}` : currentName;
              // 更新currentFilename以保持路径一致性
              const pathParts = currentFilename.split('/');
              pathParts[pathParts.length - 1] = currentName;
              setCurrentFilename(pathParts.join('/'));
            }
          }
        } catch (error) {
          console.error('获取文件列表失败:', error);
        }
      } else {
        // 现有文件：构建路径
        originalFullPath = filename;
        const originalDisplayName = getDisplayFilename(filename);
        if (displayFilename !== originalDisplayName) {
          // 文件名发生了变化，构建新路径
          const pathParts = filename.split('/');
          pathParts[pathParts.length - 1] = displayFilename;
          newFullPath = pathParts.join('/');
        } else {
          // 文件名没有变化，使用原路径
          newFullPath = filename;
        }
      }
      
      // 检查是否只是文件名变化（针对现有文件）
      const originalDisplayName = getDisplayFilename(filename);
      const filenameChanged = !isNewFile && displayFilename !== originalDisplayName;
      const contentChanged = editorContent !== content || isNewFile;
      
      if (filenameChanged && !contentChanged) {
        // 只有文件名变化，执行重命名
        await api.renameUnifiedFile(originalFullPath, newFullPath);
        setContent(editorContent);
        setIsModified(false);
        
        toast({
          title: "重命名成功",
          description: `文件已重命名为 ${currentFilename}`,
          duration: 1500,
        });
      } else if (filenameChanged && contentChanged) {
        // 文件名和内容都变化，先保存内容到原文件，再重命名
        console.log('保存并重命名操作:', { originalFullPath, newFullPath, editorContent });
        const file = createFileFromContent(editorContent, originalFullPath);
        await api.uploadUnifiedFile(file, originalFullPath, isPublic);
        await api.renameUnifiedFile(originalFullPath, newFullPath);
        setContent(editorContent);
        setIsModified(false);
        
        toast({
          title: "保存成功",
          description: `文件已保存并重命名为 ${currentFilename}`,
          duration: 1500,
        });
      } else if (isNewFile) {
        // 新建文件，直接创建
        const file = createFileFromContent(editorContent, newFullPath);
        await api.uploadUnifiedFile(file, newFullPath, isPublic);
        setContent(editorContent);
        setIsModified(false);
        
        toast({
          title: "创建成功",
          description: `文件 ${currentFilename} 已创建`,
          duration: 1500,
        });
      } else {
        // 只有内容变化，使用统一文件上传API
        const file = createFileFromContent(editorContent, originalFullPath);
        await api.uploadUnifiedFile(file, originalFullPath, isPublic);
        setContent(editorContent);
        setIsModified(false);
        
        toast({
          title: "保存成功",
          description: `文件 ${currentFilename} 已保存`,
          duration: 1500,
        });
      }
      
      if (onFileUpdate) {
        onFileUpdate();
      }
      
      // 保存成功后自动关闭模态框
      onClose();
    } catch (error) {
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
    }
  }, [displayFilename, filename, editorContent, content, isModified, isNewFile, api, onFileUpdate, toast, currentPath, onClose, saveFileContent, getDisplayFilename]);

  const handleContentChange = useCallback((newContent: string) => {
    setEditorContent(newContent);
    // 检查内容是否有变化，或者文件名是否有变化
    const contentChanged = newContent !== content;
    const originalDisplayName = getDisplayFilename(filename);
    const filenameChanged = displayFilename !== originalDisplayName;
    const hasChanges = contentChanged || filenameChanged || isNewFile;
    setIsModified(hasChanges);
    
    // 更新文件状态
    if (hasChanges) {
      setFileStatus('modified');
    } else {
      setFileStatus('synced');
    }
    
    // 移除自动保存功能，现在只显示状态变化
  }, [content, displayFilename, filename, isNewFile, mode, fileInfo.isEditable, getDisplayFilename]);

  const handleFilenameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newDisplayName = e.target.value;
    setDisplayFilename(newDisplayName);
    
    // 只有当显示文件名真的发生变化时，才构建新的完整路径
    const originalDisplayName = getDisplayFilename(filename);
    const filenameChanged = newDisplayName !== originalDisplayName;
    const contentChanged = editorContent !== content;
    const hasChanges = filenameChanged || contentChanged || isNewFile;
    setIsModified(hasChanges);
    
    // 更新文件状态
    if (hasChanges) {
      setFileStatus('modified');
    } else {
      setFileStatus('synced');
    }
  }, [filename, editorContent, content, isNewFile, getDisplayFilename]);

  const handleDownload = useCallback(() => {
    if (isNewFile) {
      // 新建文件：下载当前编辑内容到本地
      const blob = new Blob([editorContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "下载成功",
        description: `文件 ${currentFilename} 已下载到本地`,
        duration: 1500,
      });
    } else {
      // 现有文件：从服务器下载
      const directUrl = api.buildUnifiedDirectUrl(filename);
      const a = document.createElement('a');
      a.href = directUrl;
      a.download = filename.split('/').pop() || filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast({
        title: "开始下载",
        description: "文件下载已开始",
        duration: 1500,
      });
    }
  }, [isNewFile, editorContent, currentFilename, filename, api, toast]);

  const handleCopyContent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editorContent);
      toast({
        title: "复制成功",
        description: "文件内容已复制到剪贴板",
        duration: 1500,
      });
    } catch (error) {
      toast({
        title: "复制失败",
        description: "无法访问剪贴板",
        variant: "destructive",
        duration: 1500,
      });
    }
  }, [editorContent, toast]);

  const handleOpenInBrowser = useCallback(async () => {
    if (isNewFile) {
      // 新建文件没有分享链接，使用下载行为
      handleDownload();
    } else {
      try {
        // 现有文件：获取或创建分享链接并在新标签页中打开
        const shareInfo = await getOrCreateShare(api, filename, isPublic);
        const shareUrl = createShareUrl(shareInfo.id, filename);
        window.open(shareUrl, '_blank');
        
        toast({
          title: "已在新标签页打开",
          description: "文件分享链接已在新标签页中打开",
          duration: 1500,
        });
      } catch (error) {
        toast({
          title: "打开失败",
          description: error instanceof Error ? error.message : "创建分享链接失败",
          variant: "destructive",
          duration: 1500,
        });
      }
    }
  }, [isNewFile, filename, api, isPublic, toast, handleDownload]);

  // 保存当前主题到 localStorage
  useEffect(() => {
    if (currentTheme) {
      localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
    }
  }, [currentTheme]);

  // 应用当前主题到所有编辑器实例
  const applyTheme = useCallback((themeId: string) => {
    const editors = document.querySelectorAll('.monaco-editor');
    editors.forEach(editor => {
      const instance = (editor as any).querySelector('.monaco-editor-background')?.__monaco_instance;
      if (instance) {
        instance.editor.setTheme(themeId);
      }
    });
    setCurrentTheme(themeId);
  }, []);

  // WebSocket文件订阅和协作编辑
  useEffect(() => {
    if (!isOpen || !filename || isNewFile) return;

    // 直接使用filename，因为它已经包含完整路径
    const fullPath = filename;
    let subscriptionSetup = false;
    
    const handleFileUpdated = async (event: FileSystemEvent) => {
      // 检查是否是当前文件的更新事件
      if (event.type === 'file_updated' && event.file_path === fullPath) {
        console.log(`文件更新通知: ${event.file_path}`);
        
        try {
          // 重新加载文件内容
          const response = await api.getFileContent(filename);
          if (response.success && response.data) {
            const newContent = response.data.content || '';
            
            // 如果当前是预览模式，直接更新内容
            if (mode === 'preview') {
              setContent(newContent);
              setEditorContent(newContent);
            } else {
              // 检查内容是否真的有变化（避免自己的保存触发冲突通知）
              const currentContentForComparison = editorContent || content;
              if (newContent === currentContentForComparison) {
                // 内容相同，只是自己的保存，更新状态但不显示通知
                setContent(newContent);
                setIsModified(false);
                setFileStatus('synced');
                return;
              }
              
              // 如果是编辑模式且内容确实不同，检查是否有未保存的更改
              if (!isModified || editorContent === content) {
                setContent(newContent);
                setEditorContent(newContent);
                setIsModified(false);
                setFileStatus('synced');
                
                // 在编辑模式下不显示Toast，只更新状态指示器
                console.log('文件内容已被其他用户更新，已同步到本地');
              } else {
                // 如果有本地更改，设置冲突状态
                setFileStatus('conflict');
                
                // 冲突情况仍然显示Toast提醒用户
                toast({
                  title: "文件冲突",
                  description: "文件已被其他用户修改，但你有未保存的更改",
                  variant: "destructive",
                  duration: 1500,
                });
              }
            }
          }
        } catch (error) {
          console.error('重新加载文件内容失败:', error);
        }
      }
    };

    // 确保WebSocket连接后再订阅
    const setupFileSubscription = async () => {
      if (subscriptionSetup) return;
      
      try {
        // 如果WebSocket未连接，先连接
        if (!wsClient.isConnected()) {
          await wsClient.connect();
        }
        
        // 订阅文件更新事件
        wsClient.subscribeToFile(fullPath);
        wsClient.on('file_system_event', handleFileUpdated);
        subscriptionSetup = true;
        console.log(`已订阅文件: ${fullPath}`);
      } catch (error) {
        console.error('WebSocket连接或文件订阅失败:', error);
      }
    };

    setupFileSubscription();

    return () => {
      if (subscriptionSetup) {
        wsClient.unsubscribeFromFile(fullPath);
        wsClient.off('file_system_event', handleFileUpdated);
      }
    };
  }, [isOpen, filename, isNewFile, currentPath]);

  // 全局快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检查是否在输入框中
      const activeElement = document.activeElement;
      const isInInput = activeElement?.tagName === 'INPUT' || 
                       activeElement?.tagName === 'TEXTAREA' ||
                       (activeElement instanceof HTMLElement && activeElement.isContentEditable);
      
      // 如果在 Monaco Editor 中，让它自己处理快捷键
      const isInMonaco = activeElement?.closest('.monaco-editor');
      
      // Ctrl+S/Cmd+S 保存 - 即使在Monaco Editor中也要处理
      if (e.key === 's' && isModifierPressed(e)) {
        e.preventDefault();
        console.log('🔧 快捷键处理:', { 
          showEditControls, 
          isModified, 
          isNewFile, 
          mode,
          filename,
          displayFilename,
          editorContentLength: editorContent.length
        });
        if (showEditControls && (isModified || isNewFile)) {
          console.log('🚀 调用 handleSave');
          handleSave();
        } else {
          console.log('❌ 不满足保存条件');
        }
        return;
      }
      
      // 只有在不是输入框且不在 Monaco Editor 中时才处理其他全局快捷键
      if (!isInInput && !isInMonaco) {
        // 空格键在预览模式下关闭模态框
        if (e.key === ' ' && mode === 'preview') {
          e.preventDefault();
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isModified, showEditControls, handleSave, mode, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={cn(
          "flex flex-col p-0 focus:outline-none gap-0",
          isMobile || isTouchDevice 
            ? "w-[100vw] h-[100vh] max-w-none rounded-none inset-0 translate-x-0 translate-y-0" 
            : "max-w-7xl h-[95vh]"
        )}
        onOpenAutoFocus={(e) => {
          if (!isNewFile) {
            e.preventDefault();
          }
        }}
      >
        {/* 顶部标题栏 */}
        <DialogHeader className={cn(
          "flex-shrink-0 border-b bg-muted/30",
          isMobile || isTouchDevice ? "px-2 py-3" : "px-3 sm:px-6 py-2"
        )}>
          <div className={cn(
            "flex items-center w-full",
            isMobile || isTouchDevice ? "flex-col gap-2" : ""
          )}>
            {/* 移动端：垂直布局 */}
            {isMobile || isTouchDevice ? (
              <>
                {/* 第一行：文件名和状态 */}
                <div className="w-full">
                  <DialogTitle className="text-base font-medium items-center gap-2 w-full flex">
                    <FileStatusIndicator status={fileStatus} className="mr-2" />
                    <Input
                      value={displayFilename}
                      onChange={handleFilenameChange}
                      className="text-base font-medium bg-transparent border-0 px-0 w-full"
                      placeholder="文件名"
                    />
                  </DialogTitle>
                </div>
                
                {/* 第二行：控制按钮 */}
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {showEditControls && (
                      <>
                        <Button
                          variant={mode === 'preview' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setMode('preview')}
                          className="h-8 px-2"
                        >
                          <Eye className="w-4 h-4 sm:mr-1" />
                          <span className="hidden sm:inline">预览</span>
                        </Button>
                        <Button
                          variant={mode === 'edit' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setMode('edit')}
                          className="h-8 px-2"
                        >
                          <Edit3 className="w-4 h-4 sm:mr-1" />
                          <span className="hidden sm:inline">编辑</span>
                        </Button>
                      </>
                    )}
                    <CollaborationIndicator status={collaborationStatus} className="ml-2 inline-flex items-center" />
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {showEditControls && mode === 'edit' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 px-2"
                            disabled={isAIProcessing}
                          >
                            <Wand2 className={cn("w-4 h-4 sm:mr-1", isAIProcessing && "animate-spin")} />
                            <span className="hidden sm:inline">AI</span>
                            <ChevronDown className="w-3 h-3 ml-1 hidden sm:inline" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={handleAutoNaming} disabled={isAIProcessing || !editorContent.trim()}>
                            <FileText className="w-4 h-4 mr-2" />
                            自动命名
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleAutoFormat} disabled={isAIProcessing || !editorContent.trim()}>
                            <Type className="w-4 h-4 mr-2" />
                            自动排版
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleContentAnalysis} disabled={isAIProcessing || !editorContent.trim()}>
                            <Sparkles className="w-4 h-4 mr-2" />
                            内容解读
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {showEditControls && (
                      <Button 
                        variant={isModified || isNewFile ? "default" : "secondary"}
                        size="sm" 
                        onClick={handleSave} 
                        disabled={!isModified && !isNewFile}
                        className="h-8 px-2"
                      >
                        <Save className="w-4 h-4 sm:mr-1" />
                        <span className="hidden sm:inline">保存</span>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleCopyContent} className="h-8 px-2">
                      <Copy className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">复制</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={onClose} className="h-8 w-8 p-0" title="关闭">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              /* 桌面端：水平布局 */
              <>
                {/* 左侧：文件名 - 占1/3 */}
                <div className="w-1/3 pr-4">
                  <DialogTitle className="text-base font-medium items-center gap-2 w-full flex">
                    <FileStatusIndicator status={fileStatus} className="mr-2" />
                    <Input
                      value={displayFilename}
                      onChange={handleFilenameChange}
                      className="text-base font-medium bg-transparent border-0 px-0 w-full"
                      placeholder="文件名"
                    />
                  </DialogTitle>
                </div>
                
                {/* 中央：模式切换按钮 - 占1/3 */}
                <div className="w-1/3 flex justify-center gap-4 items-center">
                  {/* 主题选择器 */}
                  <div className="flex items-center">
                    <Select value={currentTheme} onValueChange={applyTheme}>
                      <SelectTrigger className="h-8 w-[150px] text-sm bg-muted/50 border-0 focus:ring-primary">
                        <SelectValue placeholder="选择主题" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* 内置主题 */}
                        <SelectGroup>
                          <SelectLabel>内置主题</SelectLabel>
                          <SelectItem value="vs">Light (VS)</SelectItem>
                          <SelectItem value="vs-dark">Dark (VS)</SelectItem>
                          <SelectItem value="hc-black">High Contrast Black</SelectItem>
                          <SelectItem value="hc-light">High Contrast Light</SelectItem>
                        </SelectGroup>
                        
                        {/* 特色主题 */}
                        <SelectGroup>
                          <SelectLabel>特色主题</SelectLabel>
                          <SelectItem value="monokai">Monokai</SelectItem>
                          <SelectItem value="dracula">Dracula</SelectItem>
                          <SelectItem value="solarized-dark">Solarized Dark</SelectItem>
                          <SelectItem value="solarized-light">Solarized Light</SelectItem>
                          <SelectItem value="tomorrow-night">Tomorrow Night</SelectItem>
                          <SelectItem value="github">GitHub</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {showEditControls && (
                    <>
                      <div className="flex items-center bg-muted rounded-md p-0.5">
                        <Button
                          variant={mode === 'preview' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setMode('preview')}
                          className="h-8 px-3 text-sm"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          预览
                        </Button>
                        <Button
                          variant={mode === 'edit' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setMode('edit')}
                          className="h-8 px-3 text-sm"
                        >
                          <Edit3 className="w-4 h-4 mr-1" />
                          编辑
                        </Button>
                      </div>
                      <CollaborationIndicator status={collaborationStatus} className="ml-2 inline-flex items-center" />
                    </>
                  )}
                </div>

                {/* 右侧：操作按钮 - 占1/3 */}
                <div className="w-1/3 flex justify-end gap-2">
                  {showEditControls && mode === 'edit' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 px-3 text-sm"
                          disabled={isAIProcessing}
                        >
                          <Wand2 className={cn("w-4 h-4 mr-1", isAIProcessing && "animate-spin")} />
                          AI
                          <ChevronDown className="w-3 h-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleAutoNaming} disabled={isAIProcessing || !editorContent.trim()}>
                          <FileText className="w-4 h-4 mr-2" />
                          自动命名
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleAutoFormat} disabled={isAIProcessing || !editorContent.trim()}>
                          <Type className="w-4 h-4 mr-2" />
                          自动排版
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleContentAnalysis} disabled={isAIProcessing || !editorContent.trim()}>
                          <Sparkles className="w-4 h-4 mr-2" />
                          内容解读
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {showEditControls && (
                    <Button 
                      variant={isModified || isNewFile ? "default" : "secondary"}
                      size="sm" 
                      onClick={handleSave} 
                      disabled={!isModified && !isNewFile}
                      className="h-8 px-3 text-sm"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      保存
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleCopyContent} className="h-8 px-3 text-sm">
                    <Copy className="w-4 h-4 mr-1" />
                    复制
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleOpenInBrowser} className="h-8 w-8 p-0" title="在浏览器中打开">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={onClose} className="h-8 w-8 p-0" title="关闭">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogHeader>
        {/* 主内容区域 */}
        <div className={cn(
          "flex-1 min-h-0 bg-background",
          isMobile || isTouchDevice ? "overflow-hidden" : "rounded-md"
        )}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">加载中...</div>
            </div>
          ) : mode === 'edit' ? (
            // 根据设备类型选择编辑器
            isMobile || isTouchDevice ? (
              <MobileTextEditor
                value={editorContent}
                filename={currentFilename}
                onChange={handleContentChange}
                autoFocus={isNewFile}
                isReadonly={isReadOnly}
                className="h-full"
              />
            ) : (
              <CollaborativeMonacoEditor
                value={editorContent}
                filename={currentFilename}
                filePath={filename}
                config={config}
                wsClient={wsClient}
                isReadonly={isReadOnly}
                onSave={async (newContent: string) => {
                  // 更新编辑器内容
                  setEditorContent(newContent);
                  // 调用完整的保存逻辑
                  await handleSave();
                }}
                onChange={handleContentChange}
                autoFocus={isNewFile}
                theme={currentTheme} // 传递当前主题
                onCollaborationStatusChange={setCollaborationStatus}
              />
            )
          ) : (
            <div className="h-full overflow-auto">
              {fileInfo.isMarkdown ? (
                <ModernMarkdownViewer content={editorContent} className='overflow-auto h-full container max-w-screen-2xl px-10 py-4'/>
              ) : (
                <div className="h-full">
                  {/* 预览模式也使用移动端组件 */}
                  {isMobile || isTouchDevice ? (
                    <MobileTextEditor
                      value={editorContent}
                      filename={currentFilename}
                      isReadonly={true}
                      className="h-full"
                    />
                  ) : (
                    <CollaborativeMonacoEditor
                      value={editorContent}
                      filename={currentFilename}
                      filePath={filename}
                      config={config}
                      wsClient={wsClient}
                      onSave={async () => {}}
                      isReadonly={true}
                      theme={currentTheme} // 传递当前主题
                      onCollaborationStatusChange={setCollaborationStatus}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      {/* 内容分析弹窗 */}
      {showAnalysisModal && (
        <div 
          className="fixed inset-0 z-[1700]"
          onClick={() => setShowAnalysisModal(false)}
        >
          <div 
            className="fixed top-16 right-2 bottom-4 left-2 sm:left-auto sm:right-4 bg-background/95 dark:bg-slate-900/95 backdrop-blur-lg border dark:border-slate-700 rounded-2xl sm:w-[500px] sm:max-w-[90vw] shadow-2xl flex flex-col transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex-shrink-0 p-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  内容解读
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowAnalysisModal(false)}
                  className="h-8 w-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* 内容区域 */}
            <div 
              ref={analysisContainerRef}
              className="flex-1 overflow-y-auto scrollbar-hide p-4"
            >
              {!analysisContent && isAnalysisProcessing && (
                <div className="flex items-center gap-2 text-muted-foreground justify-center py-8">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
                  <span className="text-sm">AI 正在分析内容...</span>
                </div>
              )}
              {analysisContent && (
                <div className="prose prose-sm max-w-none dark:prose-invert text-slate-600 dark:text-slate-300 prose-headings:text-purple-600 dark:prose-headings:text-purple-400 text-sm leading-relaxed">
                  <ModernMarkdownViewer content={analysisContent + (isAnalysisProcessing ? ' ▊' : '')} className="analysis-markdown" />
                </div>
              )}
            </div>
            
            {/* 底部操作栏 */}
            {analysisContent && !isAnalysisProcessing && (
              <div className="flex-shrink-0 p-4 border-t flex justify-end gap-2">
                <Button
                  onClick={copyAnalysisContent}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  复制
                </Button>
                <Button
                  onClick={() => setShowAnalysisModal(false)}
                  variant="default"
                  size="sm"
                >
                  关闭
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
