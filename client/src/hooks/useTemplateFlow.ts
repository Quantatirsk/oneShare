import { useCallback, useEffect, useState } from 'react';
import { Template, getTemplatesByCategory, reloadTemplates } from '@/data/templates';
import { conversationManager } from '@/lib/agents/ConversationManager';
import { 
  useTemplateState, 
  useCodeState, 
  useUIState,
  useConversationState 
} from '@/contexts/CreatePageContext';

interface UseTemplateFlowProps {
  previewContainerRef: React.RefObject<HTMLDivElement>;
}

export function useTemplateFlow({ previewContainerRef }: UseTemplateFlowProps) {
  const { 
    templates, 
    setSelectedTemplate, 
    setFilteredTemplates, 
    setTemplateCategory, 
    setTemplateCodeLangFilter,
    setTemplateIsLoading 
  } = useTemplateState();
  
  const { 
    setCurrentCode, 
    setCodeLanguage, 
    setLastRendered, 
    setHasPreviewContent 
  } = useCodeState();
  
  const { setTemplateCardCollapsed } = useUIState();
  
  const { conversation, resetConversation } = useConversationState();
  
  // 确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    template: Template | null;
  }>({ open: false, template: null });

  // 更新过滤的模板列表
  const updateFilteredTemplates = useCallback(async (category: string, codeLang: string) => {
    try {
      // 先重新加载模板以获取最新数据
      await reloadTemplates();
      let filteredTemplates = await getTemplatesByCategory(category);
      
      // Apply code language filter
      if (codeLang !== 'all') {
        filteredTemplates = filteredTemplates.filter(template => template.codeLang === codeLang);
      }
      
      setFilteredTemplates(filteredTemplates);
    } catch (error) {
      console.error('Failed to load templates:', error);
      setFilteredTemplates([]);
    }
  }, [setFilteredTemplates]);

  // 处理分类变化
  const handleCategoryChange = useCallback(async (category: string) => {
    setTemplateCategory(category);
    await updateFilteredTemplates(category, templates.codeLangFilter);
  }, [templates.codeLangFilter, setTemplateCategory, updateFilteredTemplates]);

  // 处理代码语言过滤器变化
  const handleCodeLangFilterChange = useCallback(async (codeLang: string) => {
    setTemplateCodeLangFilter(codeLang);
    await updateFilteredTemplates(templates.category, codeLang);
  }, [templates.category, setTemplateCodeLangFilter, updateFilteredTemplates]);

  // 检查是否有交互记录
  const hasInteractionHistory = useCallback(() => {
    // 只有在用户真正进行了定制任务或发送对话后才需要确认
    return conversation.messages.length > 0 || 
           (conversation.stage !== 'idle' && conversation.stage !== 'ready_to_generate');
  }, [conversation.messages.length, conversation.stage]);
  
  // 清空工作区
  const clearWorkspace = useCallback(() => {
    // 清空对话状态
    resetConversation();
    
    // 清空代码状态
    setCurrentCode('');
    setLastRendered('');
    setHasPreviewContent(false);
    
    // 清空模板状态
    setSelectedTemplate(null);
    setTemplateCardCollapsed(false);
    
    // 强制清空预览容器
    if (previewContainerRef.current) {
      previewContainerRef.current.innerHTML = '';
    }
    
    // 清空对话管理器
    conversationManager.reset();
  }, [
    resetConversation,
    setCurrentCode,
    setLastRendered,
    setHasPreviewContent,
    setSelectedTemplate,
    setTemplateCardCollapsed,
    previewContainerRef
  ]);
  
  // 处理模板选择
  const handleTemplateSelect = useCallback((template: Template) => {
    // 立即显示加载状态
    setTemplateIsLoading(true);
    
    if (templates.selected?.id === template.id) {
      // 取消选中当前模板
      if (hasInteractionHistory()) {
        setConfirmDialog({ open: true, template: null });
      } else {
        setSelectedTemplate(null);
        setTemplateCardCollapsed(false);
        setCurrentCode('');
        setLastRendered('');
        setHasPreviewContent(false);
        
        if (previewContainerRef.current) {
          previewContainerRef.current.innerHTML = '';
        }
        
        conversationManager.setSelectedTemplate(null);
        setTemplateIsLoading(false);
      }
    } else {
      // 选择新模板
      if (hasInteractionHistory()) {
        // 有交互记录，显示确认对话框
        setConfirmDialog({ open: true, template });
      } else {
        // 无交互记录，直接切换
        applyTemplateSelection(template);
      }
    }
  }, [
    templates.selected,
    hasInteractionHistory,
    setTemplateIsLoading
  ]);
  
  // 应用模板选择
  const applyTemplateSelection = useCallback(async (template: Template | null) => {
    try {
      if (template) {
        setSelectedTemplate(template);
        setTemplateCardCollapsed(false);
        setCurrentCode(template.code);
        setCodeLanguage(template.codeLang as 'tsx' | 'html');
        setLastRendered('');
        setHasPreviewContent(false);
        conversationManager.setSelectedTemplate(template);
      } else {
        setSelectedTemplate(null);
        setTemplateCardCollapsed(false);
        setCurrentCode('');
        setLastRendered('');
        setHasPreviewContent(false);
        
        if (previewContainerRef.current) {
          previewContainerRef.current.innerHTML = '';
        }
        
        conversationManager.setSelectedTemplate(null);
      }
    } catch (error) {
      console.error('Error applying template:', error);
    } finally {
      setTemplateIsLoading(false);
    }
  }, [
    setSelectedTemplate,
    setTemplateCardCollapsed,
    setCurrentCode,
    setCodeLanguage,
    setLastRendered,
    setHasPreviewContent,
    previewContainerRef,
    setTemplateIsLoading
  ]);
  
  // 确认模板切换
  const handleConfirmTemplateSwitch = useCallback(async () => {
    clearWorkspace();
    await applyTemplateSelection(confirmDialog.template);
    setConfirmDialog({ open: false, template: null });
  }, [clearWorkspace, applyTemplateSelection, confirmDialog.template]);
  
  // 取消模板切换
  const handleCancelTemplateSwitch = useCallback(() => {
    setConfirmDialog({ open: false, template: null });
    setTemplateIsLoading(false);
  }, [setTemplateIsLoading]);

  // 加载初始模板数据
  useEffect(() => {
    const loadInitialTemplates = async () => {
      try {
        await updateFilteredTemplates('all', 'all');
      } catch (error) {
        console.error('Failed to load initial templates:', error);
      }
    };
    loadInitialTemplates();
  }, [updateFilteredTemplates]);

  // 当选择的模板发生变化时，更新对话管理器
  useEffect(() => {
    if (templates.selected) {
      conversationManager.setSelectedTemplate(templates.selected);
    }
  }, [templates.selected]);

  return {
    handleCategoryChange,
    handleCodeLangFilterChange,
    handleTemplateSelect,
    updateFilteredTemplates,
    clearWorkspace,
    confirmDialog,
    handleConfirmTemplateSwitch,
    handleCancelTemplateSwitch,
  };
}