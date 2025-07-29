import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Zap, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { RequirementAnalysisResult } from '@/lib/agents/RequirementAnalyzer';
import type { ConversationStage } from '@/lib/agents/ConversationManager';

interface RequirementAnalysisCardProps {
  analysis: RequirementAnalysisResult | null;
  stage: ConversationStage;
  onGenerate: () => void;
  onRegenerate?: () => void;
  isGenerating?: boolean;
  className?: string;
}

export function RequirementAnalysisCard({
  analysis,
  stage,
  onGenerate,
  onRegenerate,
  isGenerating = false,
  className = ""
}: RequirementAnalysisCardProps) {
  if (!analysis) {
    return null;
  }

  const isAnalyzing = stage === 'analyzing' || analysis.status === 'analyzing';
  const isCompleted = analysis.status === 'completed';
  const isError = analysis.status === 'error';
  const isReadyToGenerate = stage === 'ready_to_generate';
  const canGenerate = isReadyToGenerate && !isGenerating;

  const getStatusIcon = () => {
    if (isAnalyzing) {
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    }
    if (isError) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    if (isCompleted) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    return <Sparkles className="w-4 h-4 text-primary" />;
  };

  const getStatusText = () => {
    if (isAnalyzing) return '分析中...';
    if (isError) return '分析失败';
    if (isCompleted) return '分析完成';
    return '需求分析';
  };

  const getStatusColor = () => {
    if (isAnalyzing) return 'bg-blue-50 border-blue-200';
    if (isError) return 'bg-red-50 border-red-200';
    if (isCompleted) return 'bg-green-50 border-green-200';
    return 'bg-primary/5 border-primary/20';
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={analysis.id}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 25,
          duration: 0.3
        }}
        className={`relative rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden ${getStatusColor()} ${className}`}
      >
        {/* 背景装饰 */}
        <motion.div
          animate={{
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10"
        />

        {/* 主要内容 */}
        <div className="relative p-4">
          {/* 头部状态区 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className="text-sm font-medium">{getStatusText()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {new Date(analysis.timestamp).toLocaleTimeString()}
              </Badge>
              {isCompleted && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 500 }}
                >
                  <Badge className="text-xs bg-green-100 text-green-800 border-green-200">
                    AI 分析
                  </Badge>
                </motion.div>
              )}
            </div>
          </div>

          {/* 用户需求 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mb-3"
          >
            <div className="text-xs text-muted-foreground mb-1">用户需求</div>
            <div className="text-sm bg-muted/30 rounded-lg p-2 border-l-2 border-primary/30">
              {analysis.userRequirement}
            </div>
          </motion.div>

          {/* 分析结果 */}
          <AnimatePresence>
            {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3"
              >
                <div className="flex items-center justify-center py-6">
                  <div className="text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-8 h-8 mx-auto mb-2"
                    >
                      <Sparkles className="w-8 h-8 text-primary" />
                    </motion.div>
                    <p className="text-sm text-muted-foreground">AI 正在深度分析您的需求...</p>
                    <div className="flex justify-center mt-2">
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="w-1 h-1 bg-primary rounded-full mx-1"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                        className="w-1 h-1 bg-primary rounded-full mx-1"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                        className="w-1 h-1 bg-primary rounded-full mx-1"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {isError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3"
              >
                <div className="text-xs text-muted-foreground mb-1">错误信息</div>
                <div className="text-sm bg-red-50 text-red-700 rounded-lg p-2 border border-red-200">
                  {analysis.error || '未知错误'}
                </div>
              </motion.div>
            )}

            {isCompleted && analysis.analysis && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-4"
              >
                <div className="text-xs text-muted-foreground mb-2">AI 分析结果</div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="prose prose-sm max-w-none"
                >
                  <div 
                    className="text-sm leading-relaxed bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-100"
                    dangerouslySetInnerHTML={{ 
                      __html: analysis.analysis.replace(/\n/g, '<br/>') 
                    }}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 操作按钮区 */}
          <AnimatePresence>
            {isCompleted && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
                className="flex items-center gap-2"
              >
                <Button
                  onClick={onGenerate}
                  disabled={!canGenerate || isGenerating}
                  className="flex-1 relative overflow-hidden bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 hover:from-purple-600 hover:via-indigo-600 hover:to-blue-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    <span className="font-medium">
                      {isGenerating ? '生成中...' : 'Generate'}
                    </span>
                  </motion.div>
                  
                  {/* 按钮内部光效 */}
                  <motion.div
                    animate={{
                      x: ['-100%', '100%']
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "linear"
                    }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  />
                </Button>

                {onRegenerate && (
                  <Button
                    onClick={onRegenerate}
                    variant="outline"
                    size="sm"
                    disabled={isGenerating}
                    className="px-3"
                  >
                    重新分析
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 错误状态的重试按钮 */}
          <AnimatePresence>
            {isError && onRegenerate && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex justify-center"
              >
                <Button
                  onClick={onRegenerate}
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  重新分析
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 进度指示器 */}
        {isAnalyzing && (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 2, ease: "easeInOut" }}
            className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary to-primary/50 origin-left"
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}