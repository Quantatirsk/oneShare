import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, X, Edit3, RotateCcw, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TEMPLATE_CATEGORIES } from '@/data/templates';
import { ModernMarkdownViewer } from '@/components/ModernMarkdownViewer';
import { LottieLoader } from '@/components/common/LottieAnimations';
import { ThinkingModal } from '@/components/common/ThinkingModal';
import { RequirementEditDialog } from './RequirementEditDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { extractCleanCode } from '@/utils/codeCleaningUtils';
import { TemplateDock } from './TemplateDock';
import { CreativePromptsSection } from './CreativePromptsSection';
import { 
  useConversationState, 
  useTemplateState, 
  useUIState,
  useCodeState,
  useAPIState
} from '@/contexts/CreatePageContext';

interface ChatInterfaceProps {
  chatMessagesRef: React.RefObject<HTMLDivElement>;
  onClearChat: () => void;
  onStartGeneration: (editedContent?: string) => void;
  onSendMessage?: (message: string) => void;
  onRetryAnalysis?: (message: string) => void;
  onResetConversation?: () => void;
  onRetryCodeGeneration?: () => void;
  onReviewCode?: (code: string, messageId: string) => void;
  onTemplateSelect?: (template: any) => void;
}

// 随机动词数组
const RANDOM_VERBS = [
  'Vibing', 'Coding', 'Crafting', 'Building', 'Creating', 'Designing', 
  'Developing', 'Implementing', 'Constructing', 'Generating', 'Composing', 
  'Assembling', 'Formulating', 'Architecting', 'Engineering', 'Fabricating',
  'Producing', 'Synthesizing', 'Orchestrating', 'Materializing', 'Executing',
  'Processing', 'Transforming', 'Optimizing', 'Refining', 'Polishing',
  'Enhancing', 'Evolving', 'Innovating', 'Revolutionizing', 'Pioneering',
  'Effecting', 'Applying', 'Editing', 'Modifying', 'Adjusting', 'Adapting'
];

// 获取随机动词的函数
const getRandomVerb = () => {
  return RANDOM_VERBS[Math.floor(Math.random() * RANDOM_VERBS.length)];
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  chatMessagesRef,
  onClearChat,
  onStartGeneration,
  onSendMessage,
  onRetryAnalysis,
  onResetConversation,
  onRetryCodeGeneration,
  onReviewCode,
  onTemplateSelect
}) => {
  const { conversation, editMessageContent, setMessages, setConversationStage } = useConversationState();
  const { templates, setSelectedTemplate } = useTemplateState();
  const { ui, setTemplateCardCollapsed } = useUIState();
  const { code, setCurrentCode, setLastRendered, setHasPreviewContent } = useCodeState();
  const { api } = useAPIState();
  const hasStreamingCode = code.isStreaming && code.streaming.trim().length > 0;
  
  // 调试：监控UI状态变化
  console.log('🔄 [ChatInterface] UI状态更新:', { currentlyReviewedMessageId: ui.currentlyReviewedMessageId });
  
  // 编辑对话框状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);
  
  // 模板移除确认对话框状态
  const [templateRemoveDialogOpen, setTemplateRemoveDialogOpen] = useState(false);
  
  // 随机动词状态 - 每次组件调用时随机赋值
  const [currentVerb] = useState(getRandomVerb());
  
  // ThinkingModal 展开状态 (用于处理展开回调)
  const [, setIsThinkingExpanded] = useState(false);
  
  // 当前生成任务使用的模型ID状态
  const [currentGenerationModelId, setCurrentGenerationModelId] = useState<string>('');
  
  // 监听生成阶段变化，记录使用的模型ID
  React.useEffect(() => {
    if (['generating', 'validating', 'repairing'].includes(conversation.stage)) {
      setCurrentGenerationModelId(api.selectedModel);
    }
  }, [conversation.stage, api.selectedModel]);
  
  // Only scroll for the code panel after the first code delta arrives.
  React.useEffect(() => {
    if (hasStreamingCode && chatMessagesRef.current) {
      console.log('🔥 [ChatInterface] Starting auto scroll to bottom for ThinkingModal');
      
      const scrollToBottom = (retryCount = 0) => {
        const container = chatMessagesRef.current;
        
        if (container) {
          const maxScrollTop = container.scrollHeight - container.clientHeight;
          
          console.log('🔥 [ChatInterface] Scroll to bottom attempt', retryCount, {
            containerScrollHeight: container.scrollHeight,
            containerClientHeight: container.clientHeight,
            maxScrollTop,
            currentScrollTop: container.scrollTop
          });
          
          // 滚动到最底部，让ThinkingModal显示在最下方
          container.scrollTo({
            top: maxScrollTop,
            behavior: 'smooth'
          });
          
          // 验证滚动结果
          setTimeout(() => {
            const actualScrollTop = container.scrollTop;
            console.log('🔥 [ChatInterface] After scroll - scrollTop:', actualScrollTop);
            console.log('🔥 [ChatInterface] Scroll to bottom success:', Math.abs(actualScrollTop - maxScrollTop) < 10);
            
            // 如果滚动失败，尝试强制滚动
            if (Math.abs(actualScrollTop - maxScrollTop) > 10) {
              console.log('🔥 [ChatInterface] Forcing immediate scroll to bottom...');
              container.scrollTop = maxScrollTop;
              setTimeout(() => {
                console.log('🔥 [ChatInterface] Force scroll result:', container.scrollTop);
              }, 100);
            }
          }, 500);
          
        } else if (retryCount < 15) {
          // 增加重试次数，确保容器可滚动
          console.log('🔥 [ChatInterface] Retrying scroll to bottom in 100ms...');
          setTimeout(() => scrollToBottom(retryCount + 1), 100);
        } else {
          console.log('🔥 [ChatInterface] ⚠️ Failed to scroll to bottom after 15 retries');
        }
      };
      
      // 立即尝试一次，然后延迟尝试
      scrollToBottom(0);
      setTimeout(() => scrollToBottom(0), 300);
    }
  }, [hasStreamingCode]);

  const handleTemplateRemove = () => {
    setSelectedTemplate(null);
    setTemplateCardCollapsed(false);
    setCurrentCode('');
    setLastRendered('');
    setHasPreviewContent(false);
    // 同时清空聊天记录
    onClearChat();
    setTemplateRemoveDialogOpen(false);
  };

  const handleTemplateRemoveClick = () => {
    setTemplateRemoveDialogOpen(true);
  };

  // 编辑消息处理函数
  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessage({ id: messageId, content });
    setEditDialogOpen(true);
  };


  // 判断是否为最新的代码消息
  const isLatestCodeMessage = (messageId: string) => {
    const codeMessages = conversation.messages.filter(msg => 
      msg.type === 'code' && msg.content.includes('```')
    );
    const isLatest = codeMessages.length > 0 && codeMessages[codeMessages.length - 1].id === messageId;
    console.log('🔍 [isLatestCodeMessage] 检查:', { 
      messageId, 
      isLatest, 
      totalCodeMessages: codeMessages.length,
      latestCodeMessageId: codeMessages.length > 0 ? codeMessages[codeMessages.length - 1].id : null
    });
    return isLatest;
  };

  // 处理查看历史代码
  const handleReviewCode = (messageContent: string, messageId: string) => {
    console.log('🔍 [ChatInterface] handleReviewCode 被调用:', { messageId });
    
    // 从消息内容中提取代码
    const code = extractCleanCode(messageContent, undefined, {
      removeCodeblocks: true,
      removeIntroText: true,
      trimWhitespace: true,
      preserveStructure: true,
      debugMode: false
    });
    
    if (code && onReviewCode) {
      console.log('🔍 [ChatInterface] 调用 onReviewCode:', { messageId, codeLength: code.length });
      onReviewCode(code, messageId);
    } else {
      console.log('🔍 [ChatInterface] 无法调用 onReviewCode:', { hasCode: !!code, hasCallback: !!onReviewCode });
    }
  };

  // 重试分析功能
  const handleRetryAnalysis = (currentMessageId: string) => {
    // 找到当前分析消息的索引
    const currentMessageIndex = conversation.messages.findIndex(m => m.id === currentMessageId);
    if (currentMessageIndex === -1) return;

    // 找到对应的用户消息（应该在分析消息之前）
    let userMessageIndex = -1;
    let userMessage = null;
    
    for (let i = currentMessageIndex - 1; i >= 0; i--) {
      if (conversation.messages[i].role === 'user') {
        userMessageIndex = i;
        userMessage = conversation.messages[i];
        break;
      }
    }

    if (!userMessage) return;

    console.log('🔄 [Retry] Starting retry process for message:', userMessage.content);

    // 删除从用户消息开始的所有消息（包括用户消息和分析消息）
    const messagesToKeep = conversation.messages.slice(0, userMessageIndex);
    setMessages(messagesToKeep);

    // 完全重置对话管理器状态
    if (onResetConversation) {
      console.log('🔄 [Retry] Resetting conversation manager...');
      onResetConversation();
    }

    // 重置对话状态为可以接收新分析的状态
    setConversationStage('idle');

    // 重新发送用户消息触发新的分析 - 使用专门的重试函数
    // 增加延迟确保状态更新完成
    setTimeout(() => {
      console.log('🔄 [Retry] About to retry analysis with message:', userMessage.content);
      console.log('🔄 [Retry] Current conversation stage:', conversation.stage);
      console.log('🔄 [Retry] onRetryAnalysis available:', !!onRetryAnalysis);
      
      if (onRetryAnalysis) {
        onRetryAnalysis(userMessage.content);
      } else {
        onSendMessage?.(userMessage.content);
      }
    }, 300); // 增加延迟确保状态更新完成
  };

  const handleSaveEdit = (newContent: string) => {
    if (editingMessage) {
      editMessageContent(editingMessage.id, newContent);
      setEditDialogOpen(false);
      setEditingMessage(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Chat Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">编辑记录</span>
          {/* Collapsed Template Badge */}
          <AnimatePresence>
            {templates.selected && ui.isTemplateCardCollapsed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: -20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="flex items-center"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setTemplateCardCollapsed(false)}
                  className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-md cursor-pointer transition-colors"
                >
                  <span className="text-xs">
                    {TEMPLATE_CATEGORIES[templates.selected.category]?.icon || '📝'}
                  </span>
                  <span className="text-xs font-medium text-primary truncate max-w-20">
                    {templates.selected.title}
                  </span>
                  <motion.div
                    whileHover={{ scale: 1.2 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTemplateRemoveClick();
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive transition-colors" />
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {conversation.messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearChat}
            className="text-xs h-6 px-2"
          >
            清空
          </Button>
        )}
      </div>
      
      {/* Template Card Section */}
      <AnimatePresence>
        {templates.selected && !ui.isTemplateCardCollapsed && (
          <motion.div
            initial={{ 
              opacity: 0, 
              height: 0,
              scale: 0.95
            }}
            animate={{ 
              opacity: 1, 
              height: 'auto',
              scale: 1
            }}
            exit={{ 
              opacity: 0, 
              height: 0,
              scale: 0.98
            }}
            transition={{ 
              type: "spring",
              damping: 25,
              stiffness: 250,
              duration: 0.3
            }}
            className="border-b bg-background p-3"
          >
            <motion.div
              className="relative rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden"
              whileHover={{ 
                scale: 1.01,
                transition: { type: "spring", stiffness: 400, damping: 30 }
              }}
            >
              {/* Subtle border gradient effect */}
              <motion.div
                animate={{
                  opacity: [0.3, 0.8, 0.3]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10"
              />
              
              {/* Content */}
              <div className="relative p-3">
                <div className="flex items-start gap-3">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="flex-shrink-0"
                  >
                    <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <span className="text-sm">
                        {TEMPLATE_CATEGORIES[templates.selected.category]?.icon || '📝'}
                      </span>
                    </div>
                  </motion.div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <motion.h4
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="text-sm font-semibold text-foreground truncate"
                      >
                        {templates.selected.title}
                      </motion.h4>
                      <motion.div
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-destructive/10 rounded-md flex-shrink-0"
                          onClick={handleTemplateRemove}
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-destructive transition-colors" />
                        </Button>
                      </motion.div>
                    </div>
                    
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className="text-xs text-muted-foreground mb-2 line-clamp-1"
                    >
                      {templates.selected.description}
                    </motion.p>
                    
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="flex items-center gap-2"
                    >
                      <Badge
                        variant="secondary"
                        className="text-xs px-2 py-0.5 h-5"
                      >
                        {TEMPLATE_CATEGORIES[templates.selected.category]?.label || templates.selected.category}
                      </Badge>
                      
                      <div className="flex items-center gap-1">
                        <motion.div
                          animate={{
                            scale: [1, 1.2, 1]
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                          className="w-1.5 h-1.5 rounded-full bg-green-500"
                        />
                        <span className="text-xs text-muted-foreground">
                          使用中
                        </span>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3" ref={chatMessagesRef}>
        {conversation.messages.length === 0 ? (
          <div className="h-full flex flex-col">
            {/* 只在没有选中模板时显示提示区域 */}
            {!templates.selected && (
              <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
                <div>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-2xl">💬</span>
                  </div>
                  <p className="text-sm font-medium">
                    开始与AI对话来创建您的应用！
                  </p>
                  <p className="text-xs mt-2 opacity-70">
                    输入您的想法，让AI帮您实现
                  </p>
                </div>
              </div>
            )}
            
            {/* Template Guide or Creative Prompts */}
            {templates.selected ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="mt-4 space-y-3"
              >
                {/* Template Customization Guide */}
                <div className="relative overflow-hidden rounded-lg border bg-gradient-to-br from-primary/5 via-primary/3 to-transparent">
                  <motion.div
                    animate={{
                      opacity: [0.3, 0.6, 0.3]
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10"
                  />
                  
                  <div className="relative p-4">
                    <div className="text-center mb-4">
                      <h2 className="text-sm font-semibold text-foreground mb-1">🎯 模板定制模式</h2>
                      <p className="text-xs text-muted-foreground">
                        浏览模板并选择您喜欢的开始创作
                      </p>
                    </div>
                    
                    {/* TemplateDock integrated here */}
                    <div className="mb-4 p-3 rounded-md bg-background/50 border border-primary/10">
                      <TemplateDock onTemplateSelect={onTemplateSelect || (() => {})} />
                    </div>
                    
                    <div className="space-y-3">
                      <div className="p-3 rounded-md bg-background/50 border border-primary/10">
                        <h4 className="text-xs font-medium text-foreground mb-2 flex items-center gap-1">
                          ✨ 定制建议
                        </h4>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>• 描述您希望修改的功能或样式</p>
                          <p>• 说明您的具体使用场景</p>
                          <p>• 提及您想要的交互效果</p>
                        </div>
                      </div>
                      
                      <div className="p-3 rounded-md bg-background/50 border border-primary/10">
                        <h4 className="text-xs font-medium text-foreground mb-2 flex items-center gap-1">
                          🔧 示例需求
                        </h4>
                        <div className="space-y-1">
                          <button
                            onClick={() => {
                              const prompt = `基于当前模板，请帮我调整主题及配色方案，使得页面变得更加鲜活，并增加响应式设计支持，让不同设备都可以完美展示。`;
                              onSendMessage?.(prompt);
                            }}
                            className="w-full p-2 text-xs text-left bg-background hover:bg-muted rounded-md transition-colors border border-border/50 hover:border-primary/30"
                          >
                            🎨 调整为主题风格 + 响应式设计
                          </button>
                          <button
                            onClick={() => {
                              const prompt = `段永平的投资理念可以总结为： 买股票就是买公司，专注于商业模式和企业文化，追求长期价值，并保持耐心和对市场波动的理性。他强调要像购买一家非上市公司一样去评估上市公司，注重公司的长期盈利能力和可持续发展。他还特别推崇巴菲特的投资哲学，认为理解商业模式和企业文化是投资成功的关键。 以下是段永平的一些核心投资语录，以及对其理念的解读：\n\n买股票就是买公司: 这句话强调投资的本质是购买一家公司的所有权，而不是在市场上买卖股票的符号。 投资者应该像购买一家非上市公司一样去评估上市公司，忽略短期市场波动，关注公司的内在价值和长期发展潜力。 段永平认为，上市只是提供了一种退出的便利，并不改变投资的本质.﻿ 商业模式和企业文化是关键: 段永平非常重视公司的商业模式，认为好的商业模式能够为公司带来持续的盈利。 他认为，商业模式好坏的关键在于是否有“护城河”，能够抵御竞争。 同时，他也非常重视企业文化，认为强大的企业文化能够吸引和留住人才，保证公司的健康发展.﻿ 长期投资，耐心等待: 段永平认为，投资是长期的事情，需要耐心等待机会，并长期持有好公司。 他强调，要像购买一家公司一样，持有10年甚至20年也不会后悔，才能真正理解长期投资的意义。 他认为，短期市场波动是正常的，投资者应该专注于公司的基本面，忽略市场的短期噪音.﻿ 聚焦能力圈，不懂不投: 段永平强调，投资者应该专注于自己理解的领域，不懂的行业和公司不要轻易涉足。 他认为，搞懂一个生意需要很长时间，不要因为看到一些概念就轻易跳进不熟悉的领域。 他认为，投资的关键在于理解生意，无他.﻿ 保持理性，控制风险: 段永平强调，投资要保持理性，不要被市场情绪所裹挟。 他认为，过度追求短期收益很容易导致投资失败，投资者应该控制风险，避免过度杠杆和投机行为。 他认为，没目标时钱在手里好过乱投亏钱.﻿ 学习巴菲特，但也要有自己的思考: 段永平非常推崇巴菲特，认为巴菲特的投资理念是正确的道路。 但他同时强调，要根据自己的情况进行投资，不要盲目模仿。 他认为，借鉴巴菲特的经验，也要结合自身的理解和判断，形成自己独特的投资风格。 \n\n---\n\n请将以上内容填充到模板里。`;
                              onSendMessage?.(prompt);
                            }}
                            className="w-full p-2 text-xs text-left bg-background hover:bg-muted rounded-md transition-colors border border-border/50 hover:border-primary/30"
                          >
                            📈 填充替换内容 - 段永平的投资哲学
                          </button>
                          <button
                            onClick={() => {
                              const prompt = `请在页面包含大量信息的区块右上角添加tooltip icon，支持点击后获取该区块内容的insights，利用LLM进行流式回复展示（中文），可以用markdown组件渲染回复内容。另外在整个页面添加一个全局Chat按钮，点击后弹出侧边栏，支持用户输入问题并获取流式AI回复。`;
                              onSendMessage?.(prompt);
                            }}
                            className="w-full p-2 text-xs text-left bg-background hover:bg-muted rounded-md transition-colors border border-border/50 hover:border-primary/30"
                          >
                            🚀 功能新增：AI交互及问答
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Remove Template Button */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                      className="mt-4 pt-3 border-t border-primary/10"
                    >
                      <button
                        onClick={handleTemplateRemove}
                        className="w-full px-3 py-2 text-xs rounded-md border border-indigo-200 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white transition-all duration-200 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-indigo-500/25"
                      >
                        <span className="text-sm">✨</span>
                        不使用模板，我要自己创作
                      </button>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Creative Prompts - Only show when no template selected */
              <CreativePromptsSection 
                onPromptSelect={(prompt) => {
                  // 只有用户主动点击选中的卡片时才发送消息
                  // 切换卡片只是为了浏览，不应该自动发送
                  console.log('📤 [ChatInterface] 准备发送创意提示:', prompt);
                  if (onSendMessage) {
                    onSendMessage(prompt);
                  }
                }}
              />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {conversation.messages.map((message) => (
              <div key={message.id} className="space-y-2">
                {message.role === 'user' ? (
                  <div className="w-full flex justify-end">
                    <div className="inline-block max-w-[75%] p-2.5 rounded-lg bg-primary text-primary-foreground">
                      <div className="text-xs leading-relaxed text-justify user-message-markdown">
                        <ModernMarkdownViewer content={message.content} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="w-full">
                      {message.type === 'thinking' && (
                        <details
                          className="rounded-md border border-sky-200 bg-sky-50/60 text-xs text-slate-700"
                          open={message.isStreaming || undefined}
                        >
                          <summary className="cursor-pointer px-3 py-2 font-medium text-sky-800">
                            {message.isStreaming ? '正在思考...' : '思考过程'}
                          </summary>
                          <div className="border-t border-sky-200 px-3 py-2 whitespace-pre-wrap leading-relaxed">
                            {message.content}
                          </div>
                        </details>
                      )}

                      {/* 分析消息使用原有的 Markdown 卡片样式 */}
                      {message.type === 'analysis' && (
                        <div className="rounded-lg bg-blue-50 border border-blue-200">
                          <div className="p-2.5">
                            <div className="overview-markdown text-xs">
                              <ModernMarkdownViewer content={message.content} />
                            </div>
                            {message.isStreaming && (
                              <div className="flex items-center gap-1 mt-2">
                                <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></div>
                                <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                                <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                                <span className="text-xs text-blue-600 ml-1">分析中...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* 代码消息的特殊处理 - 始终显示代码消息，让按钮状态能正确工作 */}
                      {(() => {
                        const isCodeMessage = message.type === 'code' && message.content.includes('```');
                        console.log('🔍 [代码消息渲染检查]', { 
                          messageId: message.id, 
                          isCodeMessage,
                          messageType: message.type,
                          hasCodeBlocks: message.content.includes('```'),
                          stage: conversation.stage
                        });
                        return isCodeMessage;
                      })() && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <ThinkingModal
                            isVisible={true}
                            content={extractCleanCode(message.content, undefined, {
                              removeCodeblocks: true,
                              removeIntroText: false, // 展示时保留上下文
                              trimWhitespace: true,
                              preserveStructure: true,
                              debugMode: false
                            })}
                            title="生成完成"
                            isGenerating={false}
                            type="code"
                            className="mb-2"
                            enableAdaptive={false}
                            enableSmoothScroll={false}
                            modelId={message.modelId}
                            onExpandChange={(expanded) => {
                              setIsThinkingExpanded(expanded);
                              if (expanded) {
                                // 展开时滚动到聊天区域底部
                                setTimeout(() => {
                                  const container = chatMessagesRef.current;
                                  if (container) {
                                    const maxScrollTop = container.scrollHeight - container.clientHeight;
                                    container.scrollTo({
                                      top: maxScrollTop,
                                      behavior: 'smooth'
                                    });
                                  }
                                }, 350); // 等待展开动画完成（300ms动画 + 50ms缓冲）
                              }
                            }}
                          />
                          
                          {/* 代码生成按钮 - 根据是否为最新代码消息显示不同按钮 */}
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="mt-3 flex justify-center"
                          >
                            {(() => {
                              const isCurrentlyReviewed = ui.currentlyReviewedMessageId === message.id;
                              const isLatestCode = isLatestCodeMessage(message.id);
                              const hasReviewState = ui.currentlyReviewedMessageId !== null;
                              
                              // 调试日志
                              console.log(`🔘 [按钮状态] 消息${message.id}:`, {
                                isCurrentlyReviewed,
                                isLatestCode,
                                hasReviewState,
                                reviewedMessageId: ui.currentlyReviewedMessageId,
                                messageId: message.id
                              });
                              
                              // 历史代码被Review：显示"当前版本"按钮（禁用状态）
                              if (isCurrentlyReviewed && !isLatestCode) {
                                return (
                                  <Button
                                    disabled={true}
                                    className="h-9 px-4 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 text-white border-0 shadow-lg cursor-default"
                                    title="当前显示的版本"
                                  >
                                    <motion.div className="flex items-center justify-center gap-2">
                                      <Eye className="w-4 h-4" />
                                      <span className="font-medium">当前版本</span>
                                    </motion.div>
                                  </Button>
                                );
                              }
                              
                              // 最新代码消息的按钮逻辑
                              if (isLatestCode) {
                                // 如果有历史版本正在被Review（即有Review状态但不是自己被Review）
                                if (hasReviewState && !isCurrentlyReviewed) {
                                  // 显示Review按钮
                                  return (
                                    <Button
                                      onClick={() => handleReviewCode(message.content, message.id)}
                                      disabled={false}
                                      className="h-9 px-4 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 hover:from-blue-600 hover:via-indigo-600 hover:to-purple-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                                      title="查看这个版本的代码"
                                    >
                                      <motion.div
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="flex items-center justify-center gap-2"
                                      >
                                        <Eye className="w-4 h-4" />
                                        <span className="font-medium">Review</span>
                                      </motion.div>
                                    </Button>
                                  );
                                } else {
                                  // 无Review状态或自己被Review：显示重新生成按钮
                                  return (
                                    <Button
                                      onClick={onRetryCodeGeneration}
                                      disabled={['generating', 'validating', 'repairing'].includes(conversation.stage)}
                                      className="h-9 px-4 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 hover:from-orange-600 hover:via-red-600 hover:to-pink-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                                      title="重新生成代码"
                                    >
                                      <motion.div
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="flex items-center justify-center gap-2"
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                        <span className="font-medium">重新生成</span>
                                      </motion.div>
                                    </Button>
                                  );
                                }
                              }
                              
                              // 历史代码消息：显示Review按钮
                              return (
                                <Button
                                  onClick={() => handleReviewCode(message.content, message.id)}
                                  disabled={false}
                                  className="h-9 px-4 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 hover:from-blue-600 hover:via-indigo-600 hover:to-purple-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                                  title="查看这个版本的代码"
                                >
                                  <motion.div
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="flex items-center justify-center gap-2"
                                  >
                                    <Eye className="w-4 h-4" />
                                    <span className="font-medium">Review</span>
                                  </motion.div>
                                </Button>
                              );
                            })()}
                          </motion.div>
                        </motion.div>
                      )}
                      
                      {/* 只有普通消息才显示传统样式 */}
                      {message.type !== 'analysis' && message.type !== 'thinking' && !(message.type === 'code' && message.content.includes('```')) && (
                        <div className="rounded-lg bg-muted">
                          <div className="p-2.5">
                            <p className="text-xs leading-relaxed">{message.content}</p>
                          </div>
                        </div>
                      )}
                      
                      {/* Edit + Generate + Retry 按钮 - 只在需求分析完成后显示 */}
                      {message.type === 'analysis' && 
                       message.role === 'assistant' && 
                       !message.isStreaming && 
                       conversation.stage === 'ready_to_generate' && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className="mt-3 flex gap-2"
                        >
                          {/* Edit 按钮 */}
                          <Button
                            variant="outline"
                            onClick={() => handleEditMessage(message.id, message.content)}
                            disabled={conversation.stage !== 'ready_to_generate'}
                            className="flex-1 max-w-[25%] h-9 border-primary/20 hover:border-primary/40 hover:bg-primary/5"
                          >
                            <motion.div
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className="flex items-center justify-center gap-1"
                            >
                              <Edit3 className="w-4 h-4" />
                              <span className="font-medium hidden sm:inline">Edit</span>
                            </motion.div>
                          </Button>

                          {/* Generate 按钮 */}
                          <Button
                            onClick={() => onStartGeneration(message.content)}
                            disabled={conversation.stage !== 'ready_to_generate'}
                            className="flex-1 h-9 bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 hover:from-purple-600 hover:via-indigo-600 hover:to-blue-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                          >
                            <motion.div
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className="flex items-center justify-center gap-2"
                            >
                              {conversation.stage !== 'ready_to_generate' ? (
                                <LottieLoader size={16} />
                              ) : (
                                <ArrowUp className="w-4 h-4" />
                              )}
                              <span className="font-medium">
                                Generate
                              </span>
                            </motion.div>
                          </Button>

                          {/* Retry 按钮 */}
                          <Button
                            onClick={() => handleRetryAnalysis(message.id)}
                            disabled={conversation.stage !== 'ready_to_generate'}
                            className="h-9 w-9 p-0 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 hover:from-orange-600 hover:via-red-600 hover:to-pink-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                            title="重新分析"
                          >
                            <motion.div
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className="flex items-center justify-center"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </motion.div>
                          </Button>
                        </motion.div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {/* Code output appears only after the first code delta; thinking renders in its own message. */}
            {hasStreamingCode && (
              <div className="space-y-3">
                {/* 传统的生成提示 */}
                <div className="flex justify-start">
                  <div className="bg-muted p-3 rounded-lg">
                    <div className="flex items-center gap-3">
                      <LottieLoader size={20} />
                      <span className="text-xs">正在生成代码...</span>
                    </div>
                  </div>
                </div>
                
                {/* ThinkingModal 显示流式代码 - 使用随机动词标题 */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 30 }}
                >
                  <ThinkingModal
                    isVisible={true}
                    content={code.streaming || code.current || ''}
                    title={code.isStreaming ? `${currentVerb}...` : "代码生成完成"}
                    isGenerating={code.isStreaming}
                    type="code"
                    className="mb-4"
                    enableSmoothScroll={false}
                    enableAdaptive={true}
                    showPerformanceStats={true}
                    modelId={currentGenerationModelId}
                    onExpandChange={(expanded) => {
                      setIsThinkingExpanded(expanded);
                      if (expanded) {
                        // 展开时滚动到聊天区域底部
                        setTimeout(() => {
                          const container = chatMessagesRef.current;
                          if (container) {
                            const maxScrollTop = container.scrollHeight - container.clientHeight;
                            container.scrollTo({
                              top: maxScrollTop,
                              behavior: 'smooth'
                            });
                          }
                        }, 350); // 等待展开动画完成（300ms动画 + 50ms缓冲）
                      }
                    }}
                  />
                  
                  {/* 代码生成重试按钮 - 生成中和生成完成都显示 */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-3 flex justify-center"
                  >
                    <Button
                      onClick={onRetryCodeGeneration}
                      disabled={false}
                      className="h-9 px-4 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 hover:from-orange-600 hover:via-red-600 hover:to-pink-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
                      title={code.isStreaming ? "停止并重新生成" : "重新生成代码"}
                    >
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center justify-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span className="font-medium">
                          {code.isStreaming ? "重新生成" : "重新生成"}
                        </span>
                      </motion.div>
                    </Button>
                  </motion.div>
                </motion.div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 需求编辑对话框 */}
      <RequirementEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        initialContent={editingMessage?.content || ''}
        onSave={handleSaveEdit}
        isLoading={false}
      />

      {/* 模板移除确认对话框 */}
      <ConfirmDialog
        open={templateRemoveDialogOpen}
        onOpenChange={setTemplateRemoveDialogOpen}
        title="移除模板"
        description="移除模板将清空当前的对话记录、代码内容和预览结果。是否继续？"
        confirmText="确认移除"
        cancelText="取消"
        onConfirm={handleTemplateRemove}
        onCancel={() => setTemplateRemoveDialogOpen(false)}
        variant="destructive"
      />
    </div>
  );
};

export default React.memo(ChatInterface);
