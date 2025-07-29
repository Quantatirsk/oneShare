import { useEffect, useCallback, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { isValidUrl } from '@/lib/urlHandler';
import { getUrlDownloadManager } from '@/lib/urlDownloadManager';
import { useToast } from '@/hooks/use-toast';

interface UsePasteUploadProps {
  onFileUpload: (files: File[]) => void;
  onFileListRefresh?: () => void;
  onLinkDetected?: (url: string) => void;
  onTextDetected?: (textContent: string) => void;
}

export function usePasteUpload({ onFileUpload, onFileListRefresh, onLinkDetected, onTextDetected }: UsePasteUploadProps) {
  const { config } = useAppStore();
  const { toast } = useToast();
  const [showPasteIndicator, setShowPasteIndicator] = useState(false);

  const isInputFocused = useCallback(() => {
    const activeElement = document.activeElement;
    return (
      activeElement?.tagName === 'INPUT' ||
      activeElement?.tagName === 'TEXTAREA' ||
      (activeElement instanceof HTMLElement && activeElement.isContentEditable) ||
      activeElement?.closest('.modal-content') ||
      activeElement?.closest('.monaco-editor')
    );
  }, []);

  const handleTextContent = useCallback(async (textContent: string) => {
    try {
      // 检查是否为URL
      if (isValidUrl(textContent)) {
        // 如果有链接检测回调，则触发对话框
        if (onLinkDetected) {
          onLinkDetected(textContent);
          return;
        }

        // 兼容性：如果没有回调，使用原有的处理方式
        toast({
          title: "检测到URL",
          description: "开始处理URL内容，请查看下载进度...",
          duration: 1500,
        });

        // 使用URL下载管理器处理URL，这样可以显示进度
        const downloadManager = getUrlDownloadManager(config);
        await downloadManager.startDownload(textContent);

        // 刷新文件列表
        if (onFileListRefresh) {
          onFileListRefresh();
        }
      } else {
        // 普通文本内容，触发文本检测回调
        if (onTextDetected) {
          onTextDetected(textContent);
          return;
        }
        
        // 兼容性：如果没有文本检测回调，使用原有逻辑
        const timestamp = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/[\s\-:\/]/g, '');
        const fileName = `paste-${timestamp}.md`;
        const file = new File([textContent], fileName, { type: 'text/plain' });
        onFileUpload([file]);
      }
    } catch (error) {
      console.error('处理粘贴内容失败:', error);
      toast({
        title: "处理失败",
        description: error instanceof Error ? error.message : "处理粘贴内容时发生错误",
        variant: "destructive",
        duration: 3000,
      });

      // 发生错误时，降级为普通文本处理
      if (onTextDetected) {
        onTextDetected(textContent);
      } else {
        const timestamp = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/[\s\-:\/]/g, '');
        const fileName = `paste-${timestamp}.md`;
        const file = new File([textContent], fileName, { type: 'text/plain' });
        onFileUpload([file]);
      }
    }
  }, [config, toast, onFileUpload, onFileListRefresh, onLinkDetected, onTextDetected]);

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    // 检查是否在输入框中
    if (isInputFocused()) {
      return;
    }

    // 检查配置
    if (!config.serverAddress || !config.authToken) {
      return;
    }

    e.preventDefault();

    // 显示粘贴指示器
    setShowPasteIndicator(true);
    setTimeout(() => setShowPasteIndicator(false), 1500);

    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    let hasText = false;
    let textContent = '';

    // 处理剪贴板内容
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      } else if (item.kind === 'string' && item.type === 'text/plain') {
        hasText = true;
        item.getAsString((text) => {
          textContent = text;
        });
      }
    }

    // 处理文件
    if (files.length > 0) {
      onFileUpload(files);
      return;
    }

    // 处理文本内容
    if (hasText) {
      // 等待文本内容被设置
      setTimeout(async () => {
        if (textContent.trim()) {
          await handleTextContent(textContent.trim());
        }
      }, 100);
    }
  }, [config, isInputFocused, onFileUpload, handleTextContent]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  return { showPasteIndicator };
}