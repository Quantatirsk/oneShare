import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import creativePromptsData from '@/assets/creative-prompts.json';
import { useConversationState } from '@/contexts/CreatePageContext';

// Types
interface PromptData {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  category: string;
  description: string;
  prompt: string;
  tags: string[];
}

interface CategoryInfo {
  label: string;
  icon: string;
}

interface CreativePromptsSectionProps {
  onPromptSelect: (prompt: string) => void;
}

export const CreativePromptsSection: React.FC<CreativePromptsSectionProps> = ({
  onPromptSelect
}) => {
  const { categories, prompts } = creativePromptsData;
  const [currentIndex, setCurrentIndex] = useState(0);
  const { setSelectedPrompt } = useConversationState();

  // 同步选中的提示词到Context - 只在组件初始化时设置一次
  // 避免频繁更新导致意外的副作用
  useEffect(() => {
    if (prompts[0]) {
      setSelectedPrompt(prompts[0].prompt);
    }
  }, [prompts, setSelectedPrompt]); // 移除currentIndex依赖
  
  // 当卡片切换时，延迟更新selectedPrompt，避免过于频繁的状态更新
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (prompts[currentIndex]) {
        setSelectedPrompt(prompts[currentIndex].prompt);
      }
    }, 100); // 100ms延迟
    
    return () => clearTimeout(timeoutId);
  }, [currentIndex, prompts, setSelectedPrompt]);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prompts.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < prompts.length - 1 ? prev + 1 : 0));
  };

  // 移除滚轮自动选中，避免卡顿和闪烁

  // 键盘导航支持 - 只在聚焦时生效，避免与输入框冲突
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 如果用户正在输入框中输入，不处理这些快捷键
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
      )) {
        return;
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          handlePrevious();
          break;
        case 'ArrowDown':
          event.preventDefault();
          handleNext();
          break;
        case 'Enter':
        case ' ':
          // 额外检查：确保用户真的想要发送创意提示
          // 而不是意外触发
          if (event.target === document.body || 
              (event.target as HTMLElement)?.closest('.creative-prompts-section')) {
            event.preventDefault();
            onPromptSelect(prompts[currentIndex].prompt);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, prompts, onPromptSelect]);

  const handleCardClick = (index: number) => {
    if (index === currentIndex) {
      // 点击中间的卡片，执行选择操作
      // 添加确认机制，确保用户真的想要发送
      console.log('🎯 [CreativePrompts] 用户点击发送创意提示:', prompts[index].prompt);
      onPromptSelect(prompts[index].prompt);
    } else {
      // 点击上下的卡片，切换到该卡片
      console.log('🔄 [CreativePrompts] 用户切换到卡片:', index);
      setCurrentIndex(index);
    }
  };

  return (
    <div className="mt-6 space-y-4 creative-prompts-section">
      <div className="text-center">
        <h3 className="text-sm font-semibold text-foreground mb-1">✨ 创意提示</h3>
        <p className="text-xs text-muted-foreground">滚动查看，点击选择</p>
      </div>

      {/* 卡片滑动容器 */}
      <div className="relative flex flex-col items-center">
        <div 
          className="relative h-[280px] w-full overflow-y-auto"
        >
          <div
            className="flex flex-col px-1"
          >
            {prompts.map((prompt, index) => (
              <div
                key={prompt.id}
                className="mb-1.5"
              >
                <CompactPromptCard
                  prompt={{ ...prompt, relativeIndex: index - currentIndex, absoluteIndex: index }}
                  category={categories[prompt.category as keyof typeof categories]}
                  isSelected={index === currentIndex}
                  onClick={() => handleCardClick(index)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 指示器 */}
        <div className="flex gap-1 mt-3">
          {prompts.map((_, index) => (
            <motion.div
              key={index}
              className={`w-1.5 h-1.5 border transition-all duration-300 cursor-pointer ${
                index === currentIndex ? 'bg-primary border-primary' : 'bg-transparent border-border'
              }`}
              onClick={() => setCurrentIndex(index)}
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface CompactPromptCardProps {
  prompt: PromptData & { relativeIndex: number; absoluteIndex: number };
  category?: CategoryInfo;
  isSelected: boolean;
  onClick: () => void;
}

const CompactPromptCard: React.FC<CompactPromptCardProps> = ({
  prompt,
  category,
  isSelected,
  onClick
}) => {
  return (
    <motion.div
      whileHover={{ 
        scale: isSelected ? 1.02 : 0.95,
        transition: { type: "spring", stiffness: 400, damping: 30 }
      }}
      whileTap={{ scale: 0.95 }}
      className={`relative cursor-pointer border bg-background transition-all duration-300 h-[80px] w-full ${
        isSelected 
          ? 'border-primary shadow-md' 
          : 'border-border hover:border-border/70'
      }`}
      onClick={onClick}
    >
      {/* Content */}
      <div className="relative p-2 h-full flex">
        {/* Icon */}
        <div className={`flex-shrink-0 w-8 h-8 bg-muted border border-border flex items-center justify-center mr-3 ${
          isSelected ? 'bg-primary/10 border-primary/30' : ''
        }`}>
          <span className="text-sm">
            {prompt.icon}
          </span>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h4 className={`text-sm font-semibold mb-1 line-clamp-1 transition-colors ${
            isSelected ? 'text-primary' : 'text-foreground'
          }`}>
            {prompt.title}
          </h4>
          <p className="text-xs text-muted-foreground line-clamp-1 mb-1">
            {prompt.subtitle}
          </p>
          {/* Category badge */}
          {category && (
            <div className="flex items-center gap-1">
              <span className="text-xs">{category.icon}</span>
              <span className="text-xs text-muted-foreground">
                {category.label}
              </span>
            </div>
          )}
        </div>

        {/* Selection indicator */}
        {isSelected && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 1]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="w-2 h-2 bg-primary"
            />
          </motion.div>
        )}

        {/* Selection line effect */}
        <div className={`absolute left-0 inset-y-0 w-1 transition-all duration-300 ${
          isSelected ? 'bg-primary' : 'bg-transparent'
        }`} />
      </div>
    </motion.div>
  );
};

export default CreativePromptsSection;