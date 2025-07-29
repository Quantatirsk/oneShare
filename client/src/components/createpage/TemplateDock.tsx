import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Template, getTemplatesByCategory } from '@/data/templates';
import { useTemplateState } from '@/contexts/CreatePageContext';
import { cn } from '@/lib/utils';

interface TemplateDockProps {
  onTemplateSelect: (template: Template) => void;
}

export const TemplateDock: React.FC<TemplateDockProps> = ({
  onTemplateSelect
}) => {
  const { templates } = useTemplateState();
  const [allTemplates, setAllTemplates] = useState<Template[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // 稳定的模板选择函数
  const selectTemplate = useCallback((template: Template) => {
    onTemplateSelect(template);
  }, [onTemplateSelect]);

  // 加载所有模板
  useEffect(() => {
    const loadAllTemplates = async () => {
      try {
        const loadedTemplates = await getTemplatesByCategory('all');
        setAllTemplates(loadedTemplates);
      } catch (error) {
        console.error('Failed to load templates for dock:', error);
      }
    };
    loadAllTemplates();
  }, []);

  // 同步全局选中的模板到当前索引
  useEffect(() => {
    if (templates.selected && allTemplates.length > 0) {
      const selectedIndex = allTemplates.findIndex(template => template.id === templates.selected?.id);
      if (selectedIndex !== -1 && selectedIndex !== currentIndex) {
        setCurrentIndex(selectedIndex);
      }
    }
  }, [templates.selected, allTemplates, currentIndex]);

  // 当前模板
  const currentTemplate = allTemplates[currentIndex];

  // 导航函数
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < allTemplates.length - 1;

  const goToPrevious = useCallback(() => {
    if (canGoPrevious) {
      const newIndex = currentIndex - 1;
      const newTemplate = allTemplates[newIndex];
      if (newTemplate) {
        selectTemplate(newTemplate);
      }
    }
  }, [canGoPrevious, currentIndex, allTemplates, selectTemplate]);

  const goToNext = useCallback(() => {
    if (canGoNext) {
      const newIndex = currentIndex + 1;
      const newTemplate = allTemplates[newIndex];
      if (newTemplate) {
        selectTemplate(newTemplate);
      }
    }
  }, [canGoNext, currentIndex, allTemplates, selectTemplate]);


  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && canGoPrevious) {
        event.preventDefault();
        goToPrevious();
      }
      if (event.key === 'ArrowRight' && canGoNext) {
        event.preventDefault();
        goToNext();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [canGoPrevious, canGoNext, goToPrevious, goToNext]);

  if (allTemplates.length === 0) {
    return null;
  }

  return (
    <div className="flex justify-center">
      <div className="flex items-center gap-3 w-full">
          {/* Left navigation arrow */}
          <motion.button
            whileHover={{ scale: canGoPrevious ? 1.1 : 1 }}
            whileTap={{ scale: 0.9 }}
            onClick={goToPrevious}
            disabled={!canGoPrevious}
            className={cn(
              "w-7 h-7 rounded-lg border flex items-center justify-center transition-all duration-200",
              canGoPrevious 
                ? "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700" 
                : "bg-gray-50/50 border-gray-100 text-gray-300 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>

          {/* Current template info */}
          <motion.div 
            key={currentTemplate?.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center min-w-0 flex-1 px-3"
          >
            <div className="text-gray-400 text-xs tabular-nums mb-0.5">
              {currentIndex + 1}/{allTemplates.length}
            </div>
            <div className="text-gray-900 text-sm font-medium truncate max-w-[200px] leading-tight">
              {currentTemplate?.title || '未知模板'}
            </div>
            <div className="text-gray-500 text-xs truncate max-w-[200px] leading-tight">
              {currentTemplate?.category} • {currentTemplate?.difficulty}
            </div>
          </motion.div>

          {/* Right navigation arrow */}
          <motion.button
            whileHover={{ scale: canGoNext ? 1.1 : 1 }}
            whileTap={{ scale: 0.9 }}
            onClick={goToNext}
            disabled={!canGoNext}
            className={cn(
              "w-7 h-7 rounded-lg border flex items-center justify-center transition-all duration-200",
              canGoNext 
                ? "bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-700" 
                : "bg-gray-50/50 border-gray-100 text-gray-300 cursor-not-allowed"
            )}
          >
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        </div>
    </div>
  );
};

export default TemplateDock;