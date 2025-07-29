import React from 'react';
import { motion } from 'framer-motion';
import { Template, TEMPLATE_CATEGORIES } from '@/data/templates';
import { LottieLoader } from '@/components/common/LottieAnimations';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

interface TemplateDockItemProps {
  template: Template;
  isSelected: boolean;
  onClick: () => void;
  index: number;
  isLoading?: boolean;
}

export const TemplateDockItem: React.FC<TemplateDockItemProps> = ({
  template,
  isSelected,
  onClick,
  index,
  isLoading = false
}) => {
  const category = TEMPLATE_CATEGORIES[template.category];

  return (
    <Tooltip.Provider delayDuration={100}>
      <Tooltip.Root delayDuration={100} disableHoverableContent>
        <Tooltip.Trigger asChild>
          <motion.button
            initial={{ scale: 0, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 30,
              delay: index * 0.03
            }}
            whileHover={{ 
              scale: 1.1,
              y: -2,
              transition: { type: "spring", stiffness: 600, damping: 25 }
            }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={cn(
              "relative flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
              "transition-all duration-200 ease-out group",
              isSelected 
                ? "bg-gradient-to-br from-blue-500/40 via-purple-500/30 to-pink-500/40 backdrop-blur-md border-2 border-white/70 shadow-xl" 
                : "bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 hover:border-white/30"
            )}
            style={{
              boxShadow: isSelected 
                ? '0 12px 30px -8px rgba(59, 130, 246, 0.5), 0 8px 20px -4px rgba(0, 0, 0, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.3)'
                : '0 4px 12px -2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
          >
            {/* Selection indicator */}
            {isSelected && (
              <>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 600 }}
                  className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full shadow-lg"
                />
                {/* Pulsing ring effect */}
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.7, 0.3, 0.7]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute inset-0 rounded-xl border-2 border-blue-400/50 pointer-events-none"
                />
              </>
            )}
            
            {/* Template icon */}
            {isLoading ? (
              <LottieLoader size={16} className="text-white" />
            ) : (
              <span className="text-lg leading-none group-hover:scale-110 transition-transform duration-200">
                {category?.icon || '📝'}
              </span>
            )}
            
            {/* Inner glow effect */}
            <div className={cn(
              "absolute inset-0 rounded-xl pointer-events-none",
              isSelected 
                ? "bg-gradient-to-br from-white/20 via-blue-400/10 to-purple-400/10 opacity-70" 
                : "bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-50"
            )} />
          </motion.button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content 
            side="top" 
            sideOffset={12}
            hideWhenDetached
            avoidCollisions
            className="z-[9999] px-3 py-2 text-xs font-medium text-white bg-black/90 backdrop-blur-md border border-white/20 rounded-lg shadow-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=top]:slide-in-from-bottom-2"
          >
            <div className="text-center">
              <div className="font-medium">{template.title}</div>
              <div className="text-white/60 text-xs">{category?.label}</div>
            </div>
            <Tooltip.Arrow className="fill-black/90" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

export default TemplateDockItem;