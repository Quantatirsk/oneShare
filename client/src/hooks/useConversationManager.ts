import { useCallback, useRef, useEffect } from 'react';
import { conversationManager } from '@/lib/agents/ConversationManager';
import { useToast } from '@/hooks/use-toast';
import { generateRandomFileName, generateSmartFileName } from '@/utils/fileUtils';
import { CreatePageState, Message } from './useCreatePageState';
import { extractCleanCode, type CodeLanguage } from '@/utils/codeCleaningUtils';

interface UseConversationManagerProps {
  state: CreatePageState;
  actions: any;
  rightPanelMode: string;
  previewContainerRef: React.RefObject<HTMLDivElement>;
  renderPreview: (code: string, codeLang: 'tsx' | 'html', forceRender?: boolean) => Promise<void>;
}

export function useConversationManager({
  state,
  actions,
  rightPanelMode,
  previewContainerRef,
  renderPreview
}: UseConversationManagerProps) {
  const { toast } = useToast();
  const streamingAccumulatorRef = useRef<string>('');
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // 初始化对话管理器
  useEffect(() => {
    conversationManager.setCallbacks({
      onStageChange: (stage) => {
        actions.setConversationStage(stage);
        if (stage === 'generating') {
          actions.setIsStreaming(true);
          actions.setStreamingCode('');
          streamingAccumulatorRef.current = '';
          
          // 只有在首次生成时才清空代码和预览
          const conversationStats = conversationManager.getConversationStats();
          const isFirstGeneration = conversationStats.conversationRounds === 0;
          
          if (isFirstGeneration) {
            actions.setCurrentCode('');
            actions.setLastRendered('');
            actions.setPreviewHasContent(false);
            
            // 清空预览容器，显示加载动画
            if (previewContainerRef.current) {
              previewContainerRef.current.innerHTML = '';
            }
          }
        } else if (stage === 'completed' || stage === 'error') {
          actions.setIsStreaming(false);
          actions.setStreamingCode('');
        }
      },
      onAnalysisChunk: (analysis: any) => {
        // 更新或创建流式分析消息
        actions.setMessages((prev: Message[]) => {
          const existingIndex = prev.findIndex((msg: Message) => msg.analysisId === analysis.id && msg.role === 'assistant');
          if (existingIndex >= 0) {
            // 更新现有消息
            const newMessages = [...prev];
            newMessages[existingIndex] = {
              ...newMessages[existingIndex],
              content: analysis.analysis,
              isStreaming: true
            };
            return newMessages;
          } else {
            // 创建新消息
            const newMessage: Message = {
              id: analysis.id + '_analysis',
              role: 'assistant',
              content: analysis.analysis,
              timestamp: new Date(),
              type: 'analysis',
              isStreaming: true,
              analysisId: analysis.id
            };
            return [...prev, newMessage];
          }
        });
      },
      onAnalysisComplete: (analysis: any) => {
        // 标记分析消息为完成状态
        actions.setMessages((prev: Message[]) => 
          prev.map((msg: Message) => 
            msg.analysisId === analysis.id && msg.role === 'assistant'
              ? { ...msg, isStreaming: false }
              : msg
          )
        );
      },
      onCodeChunk: (chunk) => {
        // 如果还没有开始生成代码，先清空之前的内容
        if (streamingAccumulatorRef.current === '') {
          actions.setCurrentCode('');
          actions.setLastRendered('');
          actions.setPreviewHasContent(false);
          
          // 清空预览容器，显示加载动画
          if (previewContainerRef.current) {
            previewContainerRef.current.innerHTML = '';
          }
        }
        
        streamingAccumulatorRef.current += chunk;
        actions.setStreamingCode(streamingAccumulatorRef.current);
      },
      onCodeComplete: async (finalCode?: string) => {
        let code = finalCode || state.code.current;
        
        // 清理代码
        const cleanedCode = extractCleanCode(
          code, 
          state.code.language as CodeLanguage,
          { debugMode: false }
        );
        
        // 如果清理后的代码有效，使用清理后的版本
        if (cleanedCode && cleanedCode.trim().length > 0) {
          code = cleanedCode;
        }
        
        actions.setCurrentCode(code);
        actions.setStreamingCode('');
        actions.setIsStreaming(false);
        streamingAccumulatorRef.current = '';
        
        // 生成新的文件名
        console.log('🤖 [ConversationManager] 开始AI分析生成文件名...');
        try {
          const baseFileName = await generateSmartFileName(code);
          const newFileName = `${baseFileName}.${state.code.language}`;
          actions.setFileName(newFileName);
          console.log('🤖 [ConversationManager] AI生成文件名成功:', { baseFileName, newFileName });
        } catch (error) {
          console.error('🤖 [ConversationManager] AI生成文件名失败，使用默认方案:', error);
          const baseFileName = generateRandomFileName();
          const newFileName = `${baseFileName}.${state.code.language}`;
          actions.setFileName(newFileName);
          console.log('🤖 [ConversationManager] 使用默认文件名:', { baseFileName, newFileName });
        }
        
        // 自动渲染预览
        setTimeout(() => {
          if (code.trim()) {
            renderPreview(code, state.code.language, true);
          }
        }, 200);
      },
      onError: (error: string) => {
        toast({
          title: "操作失败",
          description: error,
          variant: "destructive",
          duration: 3000,
        });
        actions.setIsStreaming(false);
        actions.setStreamingCode('');
        streamingAccumulatorRef.current = '';
      }
    });

    // 设置选中的模板和代码语言
    if (state.templates.selected) {
      conversationManager.setSelectedTemplate(state.templates.selected);
    }
    conversationManager.setCodeLang(state.code.language);
  }, [state.templates.selected, state.code.language, actions, toast, renderPreview, previewContainerRef]);

  // Auto-scroll to top when template is selected to show the indicator (only for chat area)
  useEffect(() => {
    if (state.templates.selected && chatMessagesRef.current && rightPanelMode === 'chat') {
      chatMessagesRef.current.scrollTop = 0;
    }
  }, [state.templates.selected, rightPanelMode]);

  const handleSendMessage = useCallback(async (message: string) => {
    if (!message.trim() || state.conversation.stage === 'analyzing' || state.conversation.stage === 'generating') {
      return;
    }

    // 添加用户消息到聊天记录
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
      type: 'conversation'
    };
    
    actions.addMessage(userMessage);
    actions.setInputText('');

    try {
      await conversationManager.startRequirementAnalysis(message, state.api.selectedModel);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: "发送失败",
        description: "请检查网络连接或稍后重试",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [state.conversation.stage, state.api.selectedModel, actions, toast]);

  const handleStartGeneration = useCallback(async () => {
    try {
      await conversationManager.startCodeGeneration(state.code.current, state.api.selectedModel);
    } catch (error) {
      console.error('Failed to start code generation:', error);
    }
  }, [state.code.current, state.api.selectedModel]);

  const handleClearChat = useCallback(() => {
    conversationManager.reset();
    actions.resetConversation();
    actions.setFileName('');
    
    // 清空预览容器
    if (previewContainerRef.current) {
      previewContainerRef.current.innerHTML = '';
    }
  }, [actions, previewContainerRef]);

  return {
    chatMessagesRef,
    handleSendMessage,
    handleStartGeneration,
    handleClearChat
  };
}