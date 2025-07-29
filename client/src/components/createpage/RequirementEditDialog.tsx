import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Edit3, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface RequirementEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent: string;
  onSave: (newContent: string) => void;
  isLoading?: boolean;
}

export const RequirementEditDialog: React.FC<RequirementEditDialogProps> = ({
  open,
  onOpenChange,
  initialContent,
  onSave,
  isLoading = false
}) => {
  const [content, setContent] = useState(initialContent);
  const [hasChanges, setHasChanges] = useState(false);

  // 同步初始内容
  useEffect(() => {
    setContent(initialContent);
    setHasChanges(false);
  }, [initialContent, open]);

  // 检测内容变化
  useEffect(() => {
    setHasChanges(content !== initialContent);
  }, [content, initialContent]);

  // 键盘快捷键处理
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') {
        e.preventDefault();
        if (hasChanges && !isLoading) {
          handleSave();
        }
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    }
  }, [hasChanges, isLoading]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const handleSave = () => {
    if (hasChanges && !isLoading) {
      onSave(content);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      // 显示确认对话框或者直接重置
      setContent(initialContent);
      setHasChanges(false);
    }
    onOpenChange(false);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col border-0 shadow-2xl bg-gradient-to-b from-white to-gray-50/50 p-0 gap-0">
        {/* 顶部标题栏 - 无边框设计 */}
        <div className="px-8 py-6 bg-gradient-to-r from-gray-50/80 to-white backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <Edit3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-gray-900">编辑需求分析</DialogTitle>
                <p className="text-sm text-gray-500 mt-0.5">
                  完善分析内容，确保生成的代码符合期望
                </p>
              </div>
            </div>
            
            {hasChanges && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg"
              >
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-amber-700">未保存</span>
              </motion.div>
            )}
          </div>
        </div>

        {/* 主要编辑区域 */}
        <div className="flex-1 px-8 py-6 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="h-full"
          >
            <Textarea
              value={content}
              onChange={handleTextareaChange}
              placeholder="请输入需求分析内容..."
              className="h-full min-h-[400px] resize-none border-0 bg-white/80 backdrop-blur-sm shadow-inner ring-1 ring-gray-200/50 focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all duration-200 text-base leading-relaxed p-6"
              disabled={isLoading}
              autoFocus
            />
          </motion.div>
        </div>

        {/* 底部状态栏和操作区 */}
        <div className="px-8 py-6 bg-gradient-to-r from-white to-gray-50/80 backdrop-blur-sm">
          {/* 状态信息 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-6">
              {/* 字符数统计 */}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>字符数:</span>
                <span className="font-mono font-medium">{content.length.toLocaleString()}</span>
              </div>
              
              {/* 快捷键提示 */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">⌘S</kbd>
                  <span>保存</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">Esc</kbd>
                  <span>取消</span>
                </div>
              </div>
            </div>
            
            {hasChanges && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                <span>有未保存的更改</span>
              </div>
            )}
          </div>
          
          {/* 操作按钮 */}
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={handleCancel}
              disabled={isLoading}
              className="px-6 hover:bg-gray-100"
            >
              取消
            </Button>
            
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isLoading}
              className="px-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all duration-200 border-0"
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                保存更改
              </motion.div>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequirementEditDialog;