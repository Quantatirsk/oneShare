import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // 循环滚动逻辑：配合虚拟列表实现无缝循环
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const cardHeight = 64; // 60px 卡片高度 + 4px 间距
      const duplicateCount = 3; // 与虚拟列表的重复数量保持一致
      const visibleCards = Math.floor(container.clientHeight / cardHeight);
      const centerPosition = Math.floor(visibleCards / 2);
      
      // 计算在扩展列表中的位置：原始索引 + 前置重复卡片数量
      const virtualCurrentIndex = currentIndex + duplicateCount;
      
      // 计算目标滚动位置：让选中卡片显示在中心
      const targetScrollTop = (virtualCurrentIndex - centerPosition) * cardHeight;
      
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    }
  }, [currentIndex, prompts.length]);

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
    <div className="mt-6 space-y-3 creative-prompts-section">
      <div className="text-center">
        <h3 className="text-xs font-semibold text-foreground mb-0.5">✨ 创意提示</h3>
        <p className="text-xs text-muted-foreground opacity-80">滚动查看，点击选择</p>
      </div>

      {/* 卡片滑动容器 */}
      <div className="relative flex flex-col items-center">
        <div 
          ref={scrollContainerRef}
          className="relative h-[192px] w-full overflow-y-auto scrollbar-hide"
        >
          <div
            className="flex flex-col px-1"
          >
            {/* 创建循环滚动的虚拟列表：前面添加最后几个卡片，后面添加前几个卡片 */}
            {(() => {
              const duplicateCount = 3; // 前后各重复3个卡片以实现无缝循环
              const extendedPrompts = [
                // 前置：最后几个卡片
                ...prompts.slice(-duplicateCount).map((prompt, idx) => ({
                  ...prompt,
                  id: `pre-${prompt.id}`,
                  virtualIndex: prompts.length - duplicateCount + idx,
                  isVirtual: true
                })),
                // 原始卡片
                ...prompts.map((prompt, idx) => ({
                  ...prompt,
                  virtualIndex: idx,
                  isVirtual: false
                })),
                // 后置：前几个卡片
                ...prompts.slice(0, duplicateCount).map((prompt, idx) => ({
                  ...prompt,
                  id: `post-${prompt.id}`,
                  virtualIndex: idx,
                  isVirtual: true
                }))
              ];

              return extendedPrompts.map((prompt) => {
                const realIndex = prompt.virtualIndex;
                const isSelected = realIndex === currentIndex;
                
                return (
                  <div
                    key={prompt.id}
                    className="mb-1"
                  >
                    <CompactPromptCard
                      prompt={{ 
                        ...prompt, 
                        relativeIndex: realIndex - currentIndex, 
                        absoluteIndex: realIndex 
                      }}
                      category={categories[prompt.category as keyof typeof categories]}
                      isSelected={isSelected}
                      onClick={() => handleCardClick(realIndex)}
                    />
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* 指示器 */}
        <div className="flex gap-0.5 mt-2">
          {prompts.map((_, index) => (
            <motion.div
              key={index}
              className={`w-1 h-1 border transition-all duration-300 cursor-pointer ${
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
  // 计算距离选中卡片的距离，用于缩放和阴影效果
  const distance = Math.abs(prompt.relativeIndex);
  const scaleLevel = isSelected ? 1.02 : 1; // 只有选中卡片有缩放效果，其他卡片保持一致尺寸
  const opacityLevel = isSelected ? 1 : Math.max(1 - distance * 0.08, 0.75); // 轻微透明度变化
  
  // 阴影层级：选中卡片有更强的阴影
  const shadowClass = isSelected 
    ? 'shadow-lg shadow-primary/20' 
    : distance === 1 
      ? 'shadow-sm' 
      : 'shadow-none';

  return (
    <motion.div
      whileTap={{ scale: isSelected ? 0.99 : 0.98 }}
      whileHover={{ 
        scale: isSelected ? 1.02 : 1.01, // 选中卡片hover时保持相同大小，避免超出容器
        transition: { duration: 0.2 }
      }}
      className={`relative cursor-pointer border bg-background h-[60px] w-full ${
        isSelected 
          ? 'border-primary bg-primary/5' 
          : 'border-border hover:bg-muted/30 hover:border-border/80'
      } ${shadowClass}`}
      style={{
        transform: `scale(${scaleLevel})`,
        opacity: opacityLevel,
        transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      animate={{
        scale: scaleLevel,
        opacity: opacityLevel,
      }}
      transition={{
        scale: { duration: 0 }, // 缩放立即生效，无延迟
        opacity: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } // 透明度保持平滑过渡
      }}
      onClick={onClick}
    >
      {/* Content */}
      <div className="relative p-1.5 h-full flex">
        {/* Category badge - 右上角 */}
        {category && (
          <div className="absolute top-1 right-1 z-10">
            <Badge 
              variant="outline" 
              className="h-4 px-1 text-xs bg-background/80 backdrop-blur-sm"
            >
              <span className="text-xs mr-0.5">{category.icon}</span>
              {category.label}
            </Badge>
          </div>
        )}
        
        {/* Icon */}
        <div className={`flex-shrink-0 w-6 h-6 bg-muted border border-border flex items-center justify-center mr-2 ${
          isSelected ? 'bg-primary/10 border-primary/30' : ''
        }`}>
          <span className="text-xs">
            {prompt.icon}
          </span>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center pr-16">
          <h4 className={`text-xs font-semibold mb-1 line-clamp-1 transition-colors ${
            isSelected ? 'text-primary' : 'text-foreground'
          }`}>
            {prompt.title}
          </h4>
          <p className="text-xs text-muted-foreground line-clamp-2 opacity-90">
            {prompt.subtitle}
          </p>
        </div>


        {/* Selection line effect */}
        <div className={`absolute left-0 inset-y-0 w-0.5 transition-all duration-300 ${
          isSelected ? 'bg-primary' : 'bg-transparent'
        }`} />
      </div>
    </motion.div>
  );
};

export default CreativePromptsSection;