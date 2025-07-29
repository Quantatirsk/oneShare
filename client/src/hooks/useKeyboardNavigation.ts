import { useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';
import { isMac } from '@/lib/platform';
import type { FileItem } from '@/types';

interface UseKeyboardNavigationProps {
  files: FileItem[];
  onFileClick: (file: FileItem) => void;
  onDirectoryClick: (path: string) => void;
  onDelete: (fileName: string) => void;
  onCopyLink: (fileName: string) => void;
  onDownload?: (fileName: string) => void;
  onShare?: (fileName: string) => void;
  onCreateFile?: () => void;
  onCreateDirectory?: () => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onRefresh?: () => void;
  onToggleViewMode?: () => void;
  onShowSettings?: () => void;
  onShowShortcuts?: () => void;
}

export function useKeyboardNavigation({
  files,
  onFileClick,
  onDirectoryClick,
  onDelete,
  onCopyLink,
  onDownload,
  onShare,
  onCreateFile,
  onCreateDirectory,
  onSelectAll,
  onClearSelection,
  onRefresh,
  onToggleViewMode,
  onShowSettings,
  onShowShortcuts,
}: UseKeyboardNavigationProps) {
  const { currentCursorIndex, setCursorIndex } = useAppStore();
  const scrollTimeoutRef = useRef<number | null>(null);

  const isInputFocused = useCallback(() => {
    const activeElement = document.activeElement;
    
    // 检查是否在输入元素中
    if (
      activeElement?.tagName === 'INPUT' ||
      activeElement?.tagName === 'TEXTAREA' ||
      activeElement?.tagName === 'SELECT' ||
      (activeElement instanceof HTMLElement && activeElement.isContentEditable)
    ) {
      return true;
    }
    
    // 检查是否在 Monaco 编辑器中
    if (activeElement?.closest('.monaco-editor')) {
      return true;
    }
    
    // 检查是否有打开的 Dialog（shadcn/ui dialog）
    if (document.querySelector('[data-state="open"][role="dialog"]')) {
      return true;
    }
    
    // 检查是否有其他模态框打开
    if (document.querySelector('.modal[style*="display: flex"]') || 
        document.querySelector('[data-state="open"][role="alertdialog"]') ||
        document.querySelector('[data-state="open"][role="sheet"]')) {
      return true;
    }
    
    // 检查是否有打开的下拉菜单
    if (document.querySelector('[data-state="open"][role="menu"]') ||
        document.querySelector('[data-state="open"][role="listbox"]')) {
      return true;
    }
    
    return false;
  }, []);

  const scrollToActiveItem = useCallback(() => {
    if (currentCursorIndex >= 0 && currentCursorIndex < files.length) {
      const row = document.querySelector(`[data-row-index="${currentCursorIndex}"]`);
      if (row) {
        // 获取表格内容容器
        const tableContainer = document.getElementById('file-table-body');
        if (tableContainer) {
          // 获取行和容器的位置信息
          const rowRect = row.getBoundingClientRect();
          const containerRect = tableContainer.getBoundingClientRect();
          
          // 检查行是否在可视区域内
          if (rowRect.top < containerRect.top || rowRect.bottom > containerRect.bottom) {
            // 计算滚动位置，确保行在可视区域内
            if (rowRect.top < containerRect.top) {
              // 如果行在容器上方，滚动到行的顶部
              tableContainer.scrollTop += (rowRect.top - containerRect.top);
            } else {
              // 如果行在容器下方，滚动到行的底部
              tableContainer.scrollTop += (rowRect.bottom - containerRect.bottom);
            }
          }
        } else {
          // 如果找不到容器，回退到默认行为
          row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }
  }, [currentCursorIndex, files.length]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isInputFocused()) return;

    const filesCount = files.length;
    if (filesCount === 0) return;

    // 方向键导航
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();

      if (e.key === 'ArrowLeft') {
        // 返回上级目录
        const parentRow = files.find(file => file.type === 'parent_dir');
        if (parentRow) {
          onDirectoryClick('..');
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        // 进入当前选中的目录
        if (currentCursorIndex >= 0 && currentCursorIndex < filesCount) {
          const activeFile = files[currentCursorIndex];
          if (activeFile.type === 'directory') {
            onDirectoryClick(activeFile.filename);
          } else if (activeFile.type === 'parent_dir') {
            onDirectoryClick('..');
          }
        }
        return;
      }

      // 上下键处理
      let newIndex = currentCursorIndex;
      
      if (newIndex === -1) {
        newIndex = 0;
      } else {
        if (e.key === 'ArrowUp') {
          newIndex = newIndex <= 0 ? filesCount - 1 : newIndex - 1;
        } else if (e.key === 'ArrowDown') {
          newIndex = newIndex >= filesCount - 1 ? 0 : newIndex + 1;
        }
      }
      
      setCursorIndex(newIndex);
      
      // 清除之前的定时器
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
      // 设置新的定时器，确保DOM更新后再滚动
      scrollTimeoutRef.current = window.setTimeout(scrollToActiveItem, 10);
      return;
    }

    // 全局快捷键（不需要选中文件）
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;
    const altKey = e.altKey;
    const shiftKey = e.shiftKey;
    
    // 新建文件快捷键: Ctrl+N (需要防止浏览器默认行为)
    if ((e.key === 'n' || e.key === 'N') && modifierKey && !altKey && !shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      onCreateFile?.();
      return;
    }
    
    // 新建目录快捷键: Ctrl+Shift+N (需要防止浏览器默认行为)
    if ((e.key === 'n' || e.key === 'N') && modifierKey && shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      onCreateDirectory?.();
      return;
    }
    
    // 全选快捷键: Ctrl+A
    if (e.key === 'a' && modifierKey && !altKey && !shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      onSelectAll?.();
      return;
    }
    
    // 清除选择快捷键: Esc
    if (e.key === 'Escape') {
      e.preventDefault();
      onClearSelection?.();
      return;
    }
    
    // 刷新快捷键: F5 (移除 Ctrl+R)
    if (e.key === 'F5') {
      e.preventDefault();
      onRefresh?.();
      return;
    }
    
    // 切换视图模式快捷键: Ctrl+Shift+V
    if (e.key === 'V' && modifierKey && shiftKey) {
      e.preventDefault();
      onToggleViewMode?.();
      return;
    }
    
    // 显示设置快捷键: Ctrl+,
    if (e.key === ',' && modifierKey && !altKey && !shiftKey) {
      e.preventDefault();
      onShowSettings?.();
      return;
    }
    
    // 显示快捷键帮助: Ctrl+/ 或 F1
    if ((e.key === '/' && modifierKey && !altKey && !shiftKey) || e.key === 'F1') {
      e.preventDefault();
      onShowShortcuts?.();
      return;
    }
    
    // 当前选中文件的快捷键
    if (currentCursorIndex >= 0 && currentCursorIndex < filesCount) {
      const activeFile = files[currentCursorIndex];

      if (e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (activeFile.type === 'directory') {
          onDirectoryClick(activeFile.filename);
        } else if (activeFile.type === 'parent_dir') {
          onDirectoryClick('..');
        } else {
          onFileClick(activeFile);
        }
      } else if ((e.key === 'd' && modifierKey) || e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (activeFile.type !== 'parent_dir') {
          onDelete(activeFile.filename);
        }
      } else if (e.key === 'c' && modifierKey && !altKey && !shiftKey) {
        e.preventDefault();
        if (activeFile.type === 'file') {
          onCopyLink(activeFile.filename);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeFile.type === 'directory') {
          onDirectoryClick(activeFile.filename);
        } else if (activeFile.type === 'parent_dir') {
          onDirectoryClick('..');
        } else {
          onFileClick(activeFile);
        }
      } else if (e.key === 's' && modifierKey && altKey) {
        e.preventDefault();
        if (activeFile.type === 'file') {
          onShare?.(activeFile.filename);
        }
      } else if (e.key === 's' && modifierKey && !altKey && !shiftKey) {
        e.preventDefault();
        if (activeFile.type === 'file') {
          onDownload?.(activeFile.filename);
        }
      }
    }
  }, [
    files,
    currentCursorIndex,
    setCursorIndex,
    onFileClick,
    onDirectoryClick,
    onDelete,
    onCopyLink,
    onDownload,
    onShare,
    onCreateFile,
    onCreateDirectory,
    onSelectAll,
    onClearSelection,
    onRefresh,
    onToggleViewMode,
    onShowSettings,
    onShowShortcuts,
    isInputFocused,
    scrollToActiveItem,
  ]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // 清理定时器
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleKeyDown]);

  // 当文件列表变化时，确保光标位置有效
  useEffect(() => {
    if (files.length > 0 && (currentCursorIndex >= files.length || currentCursorIndex < 0)) {
      setCursorIndex(Math.min(Math.max(0, currentCursorIndex), files.length - 1));
    }
  }, [files.length, currentCursorIndex, setCursorIndex]);
  
  // 当光标索引变化时，确保元素可见
  useEffect(() => {
    if (currentCursorIndex >= 0 && currentCursorIndex < files.length) {
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = window.setTimeout(scrollToActiveItem, 10);
    }
    
    return () => {
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [currentCursorIndex, files.length, scrollToActiveItem]);
}