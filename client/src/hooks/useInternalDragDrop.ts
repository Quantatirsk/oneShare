import { useState, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { FileServerAPI } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { FileItem } from '@/types';

interface DragState {
  isDragging: boolean;
  draggedItem: FileItem | null;
  dragOverTarget: string | null;
}

interface UseInternalDragDropProps {
  files: FileItem[];
  onRefresh: () => void;
}

export function useInternalDragDrop({ onRefresh }: UseInternalDragDropProps) {
  const { config } = useAppStore();
  const { toast } = useToast();
  const [api] = useState(() => new FileServerAPI(config));
  
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedItem: null,
    dragOverTarget: null,
  });

  // 更新 API 配置
  api.updateConfig(config);

  const handleDragStart = useCallback((e: React.DragEvent, file: FileItem) => {
    // 防止拖拽父目录
    if (file.type === 'parent_dir') {
      e.preventDefault();
      return;
    }

    setDragState({
      isDragging: true,
      draggedItem: file,
      dragOverTarget: null,
    });

    // 设置拖拽数据
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'internal-drag',
      fileName: file.filename,
      fileType: file.type,
    }));

    e.dataTransfer.effectAllowed = 'move';

    
    // 创建拖拽预览
    const dragPreview = document.createElement('div');
    dragPreview.className = 'bg-background border border-border rounded px-3 py-2 shadow-lg flex items-center gap-2';
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-1000px';
    dragPreview.style.pointerEvents = 'none';
    dragPreview.innerHTML = `
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        ${file.type === 'directory' 
          ? '<path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>'
          : '<path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"></path>'
        }
      </svg>
      <span>${file.display_name}</span>
    `;
    
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 0, 0);
    
    // 清理拖拽预览
    setTimeout(() => {
      document.body.removeChild(dragPreview);
    }, 0);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetFile: FileItem) => {
    e.preventDefault();
    
    // 只允许拖拽到目录
    if (targetFile.type !== 'directory' && targetFile.type !== 'parent_dir') {
      return;
    }

    // 不能拖拽到自己
    if (dragState.draggedItem?.filename === targetFile.filename) {
      return;
    }
    
    // 不能将目录拖拽到其子目录
    if (dragState.draggedItem && dragState.draggedItem.type === 'directory') {
      // 检查目标是否是源的子目录
      if (targetFile.filename.startsWith(dragState.draggedItem.filename + '/')) {
        return;
      }
    }

    e.dataTransfer.dropEffect = 'move';
    
    if (dragState.dragOverTarget !== targetFile.filename) {
      setDragState(prev => ({
        ...prev,
        dragOverTarget: targetFile.filename,
      }));
    }
  }, [dragState.draggedItem]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // 检查是否真的离开了目标元素
    const relatedTarget = e.relatedTarget as Element;
    const currentTarget = e.currentTarget as Element;
    
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setDragState(prev => ({
        ...prev,
        dragOverTarget: null,
      }));
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetFile: FileItem) => {
    e.preventDefault();
    
    if (!dragState.draggedItem) return;

    try {
      // 检查拖拽数据
      const rawData = e.dataTransfer.getData('text/plain');
      const dragData = JSON.parse(rawData);
      
      if (dragData.type !== 'internal-drag') {
        return; // 不是内部拖拽，让外部拖拽处理
      }

      let targetPath: string;
      
      if (targetFile.type === 'parent_dir') {
        // 移动到上级目录
        const currentPath = useAppStore.getState().currentPath;
        const pathParts = currentPath.split('/').filter(Boolean);
        targetPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
      } else {
        // 移动到目标目录
        targetPath = targetFile.filename;
      }
      
      // 检查是否将目录拖拽到自身
      const sourcePathParts = dragState.draggedItem.filename.split('/');
      const targetPathParts = targetPath.split('/');
      
      // 如果目标路径与源路径相同，或者源路径是目标路径的父目录，则跳过移动操作
      if (dragState.draggedItem.filename === targetPath || 
          (dragState.draggedItem.type === 'directory' && 
           targetPathParts.length > sourcePathParts.length && 
           targetPath.startsWith(dragState.draggedItem.filename + '/'))) {
        console.log('跳过移动：不能将目录移动到自身或其子目录');
        return;
      }

      // 执行移动操作
      const result = await api.moveUnifiedFiles([dragState.draggedItem.filename], targetPath);
      
      if (result.success) {
        toast({
          title: "移动成功",
          description: `已移动到 ${targetPath}`,
          duration: 1500,
        });

        // 刷新文件列表
        onRefresh();
      } else {
        throw new Error(result.error || "移动失败");
      }
      
    } catch (error) {
      console.error('Move failed:', error);
      toast({
        title: "移动失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
    } finally {
      setDragState({
        isDragging: false,
        draggedItem: null,
        dragOverTarget: null,
      });
    }
  }, [dragState.draggedItem, api, toast, onRefresh]);

  const handleDragEnd = useCallback(() => {
    setDragState({
      isDragging: false,
      draggedItem: null,
      dragOverTarget: null,
    });
  }, []);

  return {
    dragState,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}