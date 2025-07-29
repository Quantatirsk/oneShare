import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  onSave: (content: string) => Promise<void>;
  debounceMs?: number;
  enabled?: boolean;
}

export function useAutoSave({ onSave, debounceMs = 2000, enabled = true }: UseAutoSaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedContent, setLastSavedContent] = useState<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // 清理定时器
  const clearAutoSaveTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // 执行自动保存
  const performAutoSave = useCallback(async (content: string) => {
    if (!enabled) return;
    
    setSaveStatus('saving');
    try {
      await onSave(content);
      setSaveStatus('saved');
      setLastSavedContent(content);
      
      // 2秒后将状态重置为idle
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    } catch (error) {
      setSaveStatus('error');
      toast({
        title: "自动保存失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
      
      // 5秒后将状态重置为idle
      setTimeout(() => {
        setSaveStatus('idle');
      }, 5000);
    }
  }, [enabled, onSave, toast]);

  // 触发自动保存（带防抖）
  const triggerAutoSave = useCallback((content: string) => {
    if (!enabled || content === lastSavedContent) {
      return;
    }

    clearAutoSaveTimeout();
    
    timeoutRef.current = setTimeout(() => {
      performAutoSave(content);
    }, debounceMs);
  }, [enabled, lastSavedContent, debounceMs, clearAutoSaveTimeout, performAutoSave]);

  // 立即保存（不防抖）
  const saveImmediately = useCallback(async (content: string) => {
    clearAutoSaveTimeout();
    await performAutoSave(content);
  }, [clearAutoSaveTimeout, performAutoSave]);

  // 设置初始保存内容
  const setInitialContent = useCallback((content: string) => {
    setLastSavedContent(content);
    setSaveStatus('idle');
  }, []);

  // 检查是否有未保存的更改
  const hasUnsavedChanges = useCallback((content: string) => {
    return content !== lastSavedContent;
  }, [lastSavedContent]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      clearAutoSaveTimeout();
    };
  }, [clearAutoSaveTimeout]);

  return {
    saveStatus,
    triggerAutoSave,
    saveImmediately,
    setInitialContent,
    hasUnsavedChanges,
    clearAutoSaveTimeout
  };
}