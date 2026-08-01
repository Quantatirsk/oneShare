import { useCallback, useRef, useEffect } from 'react';
import { conversationManager } from '@/lib/agents/ConversationManager';
import { useToast } from '@/hooks/use-toast';
import { generateRandomFileName, generateSmartFileName } from '@/utils/fileUtils';
import { extractCleanCode, type CodeLanguage } from '@/utils/codeCleaningUtils';
import { 
  useConversationState, 
  useCodeState, 
  useTemplateState, 
  useAPIState,
  useUIState,
  Message 
} from '@/contexts/CreatePageContext';

interface UseConversationFlowProps {
  previewContainerRef: React.RefObject<HTMLDivElement>;
  renderPreview: (code: string, codeLang: 'tsx' | 'html', forceRender?: boolean) => Promise<import('@/hooks/useCodeRenderer').RenderOutcome>;
}

export function useConversationFlow({ 
  previewContainerRef,
  renderPreview,
}: UseConversationFlowProps) {
  const { toast } = useToast();
  const { conversation, addMessage, updateMessage, setConversationStage, resetConversation } = useConversationState();
  const { 
    code, 
    setCurrentCode, 
    setStreamingCode, 
    setFileName, 
    setLastRendered, 
    setHasPreviewContent, 
    setIsStreaming 
  } = useCodeState();
  const { templates } = useTemplateState();
  const { api } = useAPIState();
  const { setCurrentlyReviewedMessageId } = useUIState();
  
  const streamingAccumulatorRef = useRef<string>('');
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const callbacksSetRef = useRef<boolean>(false);
  const activeAnalysisRef = useRef<string | null>(null);
  const activeThinkingRef = useRef<{ id: string; content: string } | null>(null);
  const analysisMessagesRef = useRef<Map<string, { userMsgId: string; assistantMsgId: string }>>(new Map());

  useEffect(() => {
    conversationManager.setRenderer({
      validate: (source, language) => renderPreview(source, language, true),
    });
  }, [renderPreview]);

  // 初始化对话管理器 - 避免重复设置回调
  useEffect(() => {
    if (callbacksSetRef.current) {
      return; // 已经设置过回调，避免重复
    }

    console.log('Setting up conversationManager callbacks in useConversationFlow');
    conversationManager.setCallbacks({
      onStageChange: (stage) => {
        setConversationStage(stage);

        if (stage === 'analyzing' || stage === 'generating') {
          activeThinkingRef.current = null;
        } else if (activeThinkingRef.current) {
          updateMessage(activeThinkingRef.current.id, { isStreaming: false });
          activeThinkingRef.current = null;
        }
        
        if (stage === 'generating') {
          // Agent may emit thinking before the first code delta. Keep code UI hidden until then.
          setIsStreaming(false);
          setStreamingCode('');
          streamingAccumulatorRef.current = '';
          
          // 只有在首次生成时才清空代码和预览
          const conversationStats = conversationManager.getConversationStats();
          const isFirstGeneration = conversationStats.conversationRounds === 0;
          
          if (isFirstGeneration) {
            setCurrentCode('');
            setLastRendered('');
            setHasPreviewContent(false);
            
            // 清空预览容器，显示加载动画
            if (previewContainerRef.current) {
              previewContainerRef.current.innerHTML = '';
            }
          }
        } else if (stage === 'validating' || stage === 'completed' || stage === 'error') {
          setIsStreaming(false);
          setStreamingCode('');
        }
      },

      onAnalysisChunk: (_, analysis) => {
        // 检查是否为新的分析流
        if (activeAnalysisRef.current !== analysis.id) {
          activeAnalysisRef.current = analysis.id;
          
          // 创建助手消息（用户消息已在 handleSendMessage 中添加，不再重复添加）
          const assistantMessageId = `analysis-res-${analysis.id}`;
          
          // 存储消息ID映射（不再需要存储用户消息ID）
          analysisMessagesRef.current.set(analysis.id, {
            userMsgId: '', // 空字符串，因为用户消息已在handleSendMessage中添加
            assistantMsgId: assistantMessageId
          });
          
          const assistantMessage: Message = {
            id: assistantMessageId,
            role: 'assistant',
            content: analysis.analysis,
            timestamp: analysis.timestamp,
            type: 'analysis',
            isStreaming: true,
            analysisId: analysis.id,
            modelId: conversationManager.getCurrentModel() || api.selectedModel // 从ConversationManager获取实际使用的模型
          };
          
          addMessage(assistantMessage);
        } else {
          // 更新现有的助手消息
          const messageIds = analysisMessagesRef.current.get(analysis.id);
          if (messageIds) {
            updateMessage(messageIds.assistantMsgId, {
              content: analysis.analysis,
              isStreaming: true
            });
          }
        }
      },

      onThinkingChunk: (chunk) => {
        const activeThinking = activeThinkingRef.current;
        if (!activeThinking) {
          const id = `thinking-${Date.now()}`;
          activeThinkingRef.current = { id, content: chunk };
          addMessage({
            id,
            role: 'assistant',
            content: chunk,
            timestamp: new Date(),
            type: 'thinking',
            isStreaming: true,
            modelId: conversationManager.getCurrentModel() || api.selectedModel,
          });
          return;
        }

        activeThinking.content += chunk;
        updateMessage(activeThinking.id, { content: activeThinking.content, isStreaming: true });
      },

      onAnalysisComplete: (analysis, modelId?: string) => {
        // 标记流式完成
        const messageIds = analysisMessagesRef.current.get(analysis.id);
        if (messageIds) {
          updateMessage(messageIds.assistantMsgId, {
            content: analysis.analysis,
            isStreaming: false,
            modelId: modelId || conversationManager.getCurrentModel() || api.selectedModel // 确保分析完成时也有正确的模型ID
          });
        }
        
        // 清理活动的分析引用
        if (activeAnalysisRef.current === analysis.id) {
          activeAnalysisRef.current = null;
        }
      },

      onCodeChunk: (chunk) => {
        // 如果这是第一个chunk且accumulator为空，说明开始新的生成
        if (streamingAccumulatorRef.current === '') {
          setCurrentCode('');
          setLastRendered('');
          setHasPreviewContent(false);
          
          // 清空预览容器，显示加载动画
          if (previewContainerRef.current) {
            previewContainerRef.current.innerHTML = '';
          }
        }
        
        streamingAccumulatorRef.current += chunk;
        setIsStreaming(true);
        setStreamingCode(streamingAccumulatorRef.current);
        setCurrentCode(streamingAccumulatorRef.current);
      },

      onCodeComplete: async (modelId?: string) => {
        let finalCode = conversationManager.getCurrentCode();
        
        // 使用统一的代码清理工具
        const cleanedCode = extractCleanCode(
          finalCode, 
          code.language as CodeLanguage,
          { debugMode: false }
        );
        
        // 如果清理后的代码有效，使用清理后的版本
        if (cleanedCode && cleanedCode.trim().length > 0) {
          finalCode = cleanedCode;
        }
        
        // 从ConversationManager获取当前设置的语言，确保使用最新值
        const userSelectedLanguage = conversationManager.getCodeLang();
        console.log('🔄 [CodeComplete] 代码生成完成:', { 
          userSelectedLanguage, 
          codeLanguage: code.language,
          codeLength: finalCode.length 
        });
        setCurrentCode(finalCode);
        setLastRendered('');
        setHasPreviewContent(false);
        
        // 重置Review状态，因为有新代码生成
        setCurrentlyReviewedMessageId(null);
        
        // 添加生成的代码到消息历史
        const codeMessage: Message = {
          id: Date.now() + '',
          role: 'assistant',
          content: `\`\`\`${userSelectedLanguage}\n${finalCode}\n\`\`\``,
          timestamp: new Date(),
          type: 'code',
          modelId: modelId || api.selectedModel // 使用实际传递的模型ID，后备使用当前选择的模型
        };
        
        addMessage(codeMessage);
        
        // 生成新的文件名
        if (finalCode.trim()) {
          console.log('🤖 [CodeComplete] 开始AI分析生成文件名...');
          try {
            const baseFileName = await generateSmartFileName(finalCode);
            const newFileName = `${baseFileName}.${userSelectedLanguage}`;
            setFileName(newFileName);
            console.log('🤖 [CodeComplete] AI生成文件名成功:', { baseFileName, newFileName });
          } catch (error) {
            console.error('🤖 [CodeComplete] AI生成文件名失败，使用默认方案:', error);
            const baseFileName = generateRandomFileName();
            const newFileName = `${baseFileName}.${userSelectedLanguage}`;
            setFileName(newFileName);
            console.log('🤖 [CodeComplete] 使用默认文件名:', { baseFileName, newFileName });
          }
          
          // 移除手动渲染调用，交给 useCodeRenderer 的自动渲染逻辑处理
          // 避免与 useCodeRenderer 的 useEffect 产生重复渲染
          console.log('🎨 [CodeComplete] 代码设置完成，等待自动渲染');
        }
      },

      onRecovery: (attempt, failure) => {
        addMessage({
          id: `recovery-${Date.now()}-${attempt}`,
          role: 'assistant',
          content: `正在自动修复 ${attempt}/2：${failure.message}`,
          timestamp: new Date(),
          type: 'conversation',
          isStreaming: false,
          modelId: conversationManager.getCurrentModel() || api.selectedModel,
        });
      },

      onRecoveryExhausted: (failure) => {
        toast({ title: '自动修复已停止', description: failure.message, variant: 'destructive', duration: 4000 });
      },

      onError: (error) => {
        toast({
          title: "错误",
          description: error,
          variant: "destructive",
          duration: 2000,
        });
        
        const errorMessage: Message = {
          id: Date.now() + '',
          role: 'assistant',
          content: `❌ ${error}`,
          timestamp: new Date(),
          type: 'code'
        };
        addMessage(errorMessage);
      }
    });

    callbacksSetRef.current = true;
  }, []); // 空依赖数组，只设置一次

  // 单独的 effect 来更新模板和代码语言设置
  useEffect(() => {
    // 始终同步模板状态，包括 null 值（取消模板时）
    conversationManager.setSelectedTemplate(templates.selected);
    conversationManager.setCodeLang(code.language);
  }, [templates.selected, code.language]);

  // 自动滚动聊天消息到底部
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [conversation.messages, conversation.stage]);

  // 发送消息处理函数
  const handleSendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;


    // 立即添加用户消息到聊天历史
    const userMessage: Message = {
      id: Date.now() + '',
      role: 'user',
      content: message,
      timestamp: new Date(),
      type: 'conversation'
    };
    addMessage(userMessage);

    try {
      // 检查当前状态，决定是分析需求还是继续对话
      if (conversation.stage === 'completed' || (conversation.stage === 'error' && conversationManager.hasCodeSession())) {
        setConversationStage('generating');
        conversationManager.setCodeLang(code.language);
        return await conversationManager.continueConversation(message, api.selectedModel);
      }
      if (conversation.stage === 'idle' || conversation.stage === 'error') {
        // 立即设置状态为分析中，显示加载动画
        setConversationStage('analyzing');
        
        // 清理之前的分析状态
        activeAnalysisRef.current = null;
        analysisMessagesRef.current.clear();
        
        // 确保在需求分析前同步语言设置
        console.log('🔧 [SendMessage] 需求分析前同步语言设置:', code.language);
        conversationManager.setCodeLang(code.language);
        
        // 开始需求分析
        return await conversationManager.startRequirementAnalysis(message, api.selectedModel);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // 错误时重置状态
      setConversationStage('error');
      
      toast({
        title: "发送失败",
        description: "请检查网络连接或稍后重试",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [conversation.stage, api.selectedModel, code.language, toast, addMessage, setConversationStage]);

  // 开始代码生成的函数
  const handleStartGeneration = useCallback(async (editedContent?: string) => {
    try {
      // 确保在代码生成前同步语言设置
      conversationManager.setCodeLang(code.language);
      
      // 如果有编辑后的需求分析内容，先更新ConversationManager中的分析内容
      if (editedContent) {
        conversationManager.updateCurrentAnalysis(editedContent);
      }
      
      // 传递当前代码内容给代码生成流程
      return await conversationManager.startCodeGeneration(code.current, api.selectedModel);
    } catch (error) {
      console.error('Failed to start code generation:', error);
      toast({
        title: "生成失败",
        description: "代码生成启动失败，请稍后重试",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [code.current, code.language, api.selectedModel, toast]);

  const handleCancelGeneration = useCallback(() => {
    conversationManager.cancelActiveRequest();
  }, []);

  // 清空聊天记录
  const handleClearChat = useCallback(() => {
    conversationManager.reset();
    resetConversation();
    
    // 重置Review状态
    setCurrentlyReviewedMessageId(null);
    
    // 重新同步当前的模板和代码语言设置
    if (templates.selected) {
      conversationManager.setSelectedTemplate(templates.selected);
    }
    conversationManager.setCodeLang(code.language);
    
    // 清理所有引用
    activeAnalysisRef.current = null;
    analysisMessagesRef.current.clear();
    streamingAccumulatorRef.current = '';
    
    // 清空预览容器
    if (previewContainerRef.current) {
      previewContainerRef.current.innerHTML = '';
    }
  }, [resetConversation, previewContainerRef, templates.selected, code.language, setCurrentlyReviewedMessageId]);

  // 只重置对话管理器状态，不清除UI消息历史
  const handleResetConversationManager = useCallback(() => {
    console.log('🔄 [Reset] Resetting conversation manager state...');
    conversationManager.reset();
    
    // 重置Review状态
    setCurrentlyReviewedMessageId(null);
    
    // 重新同步当前的模板和代码语言设置
    if (templates.selected) {
      conversationManager.setSelectedTemplate(templates.selected);
    }
    conversationManager.setCodeLang(code.language);
    
    // 清理所有引用
    activeAnalysisRef.current = null;
    analysisMessagesRef.current.clear();
    streamingAccumulatorRef.current = '';
  }, [templates.selected, code.language, setCurrentlyReviewedMessageId]);

  // 专门用于重试的发送消息函数 - 强制触发分析
  const handleRetryMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;

    console.log('🔄 [RetryMessage] Force triggering requirement analysis for:', message);

    // 立即添加用户消息到聊天历史
    const userMessage: Message = {
      id: Date.now() + '',
      role: 'user',
      content: message,
      timestamp: new Date(),
      type: 'conversation'
    };
    addMessage(userMessage);

    try {
      // 强制设置状态为分析中，显示加载动画
      setConversationStage('analyzing');
      
      // 清理之前的分析状态
      activeAnalysisRef.current = null;
      analysisMessagesRef.current.clear();
      
      // 开始需求分析
      return await conversationManager.startRequirementAnalysis(message, api.selectedModel);
    } catch (error) {
      console.error('Failed to retry message:', error);
      
      // 错误时重置状态
      setConversationStage('error');
      
      toast({
        title: "重试失败",
        description: "请检查网络连接或稍后重试",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [api.selectedModel, toast, addMessage, setConversationStage]);

  // 重试代码生成函数 - 停止当前生成并重新开始
  const handleRetryCodeGeneration = useCallback(async () => {
    console.log('🔄 [RetryCodeGeneration] Retrying code generation...');

    try {
      // 如果正在生成，先停止
      if (conversation.stage === 'generating') {
        console.log('🔄 [RetryCodeGeneration] Stopping current generation...');
        conversationManager.cancelActiveRequest();
      }

      // 清理当前的流式状态和之前生成的代码
      streamingAccumulatorRef.current = '';
      setStreamingCode('');
      setIsStreaming(false);
      setCurrentCode(''); // 清空之前生成的代码
      
      // 重置Review状态，因为要重新生成代码
      setCurrentlyReviewedMessageId(null);
      
      // 保留之前渲染的内容，让预览区继续显示上一次的结果
      // setLastRendered(''); // 不清空 - 保持上一次渲染的内容显示
      // setHasPreviewContent(false); // 不重置 - 保持预览可见

      // 不清空预览容器，让它继续显示上一次的结果
      // if (previewContainerRef.current) {
      //   previewContainerRef.current.innerHTML = '';
      // }

      // 重置为生成中状态
      setConversationStage('generating');
      
      // 确保在代码生成前同步语言设置
      conversationManager.setCodeLang(code.language);
      
      // 重新开始代码生成，传递空字符串作为当前代码（从头开始生成）
      return await conversationManager.startCodeGeneration('', api.selectedModel);
    } catch (error) {
      console.error('Failed to retry code generation:', error);
      
      // 错误时重置状态
      setConversationStage('error');
      
      toast({
        title: "重新生成失败",
        description: "代码重新生成失败，请稍后重试",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [conversation.stage, code.language, api.selectedModel, toast, setConversationStage, setStreamingCode, setIsStreaming, setCurrentCode, setCurrentlyReviewedMessageId, previewContainerRef]);

  return {
    chatMessagesRef,
    handleSendMessage,
    handleStartGeneration,
    handleCancelGeneration,
    handleClearChat,
    handleResetConversationManager,
    handleRetryMessage,
    handleRetryCodeGeneration,
  };
}
