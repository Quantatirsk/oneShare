import { useCallback, useEffect } from 'react';
import { Template, getTemplatesByCategory } from '@/data/templates';
import { conversationManager } from '@/lib/agents/ConversationManager';
import { CreatePageState } from './useCreatePageState';

interface UseTemplateManagerProps {
  state: CreatePageState;
  actions: any;
  previewContainerRef: React.RefObject<HTMLDivElement>;
}

export function useTemplateManager({
  state,
  actions,
  previewContainerRef
}: UseTemplateManagerProps) {

  const updateFilteredTemplates = useCallback(async (category: string, codeLang: string) => {
    let templates = await getTemplatesByCategory(category);
    
    // Apply code language filter
    if (codeLang !== 'all') {
      templates = templates.filter(template => template.codeLang === codeLang);
    }
    
    actions.setFilteredTemplates(templates);
  }, [actions]);

  const handleCategoryChange = useCallback(async (category: string) => {
    actions.setSelectedCategory(category);
    await updateFilteredTemplates(category, state.templates.selectedCodeLang);
  }, [state.templates.selectedCodeLang, actions, updateFilteredTemplates]);

  const handleCodeLangFilterChange = useCallback(async (codeLang: string) => {
    actions.setSelectedCodeLang(codeLang);
    await updateFilteredTemplates(state.templates.selectedCategory, codeLang);
  }, [state.templates.selectedCategory, actions, updateFilteredTemplates]);

  const handleTemplateSelect = useCallback((template: Template) => {
    if (state.templates.selected?.id === template.id) {
      // 取消选中
      actions.setSelectedTemplate(null);
      actions.setTemplateCardCollapsed(false);
      actions.setCurrentCode('');
      actions.setLastRendered('');
      actions.setPreviewHasContent(false);
      
      // 强制清空预览容器
      if (previewContainerRef.current) {
        previewContainerRef.current.innerHTML = '';
      }
      
      // 清空对话管理器中的模板引用
      conversationManager.setSelectedTemplate(null);
    } else {
      // 选中新模板
      actions.setSelectedTemplate(template);
      actions.setTemplateCardCollapsed(false);
      actions.setCurrentCode(template.code);
      actions.setCodeLanguage(template.codeLang as 'tsx' | 'html');
      actions.setLastRendered('');
      actions.setPreviewHasContent(false);
    }
  }, [state.templates.selected, actions, previewContainerRef]);

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
    if (state.templates.selected) {
      conversationManager.setSelectedTemplate(state.templates.selected);
    }
  }, [state.templates.selected]);

  return {
    handleCategoryChange,
    handleCodeLangFilterChange,
    handleTemplateSelect,
    updateFilteredTemplates
  };
}