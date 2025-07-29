import React, { createContext, useContext, useReducer, useMemo } from 'react';
import { Template } from '@/data/templates';
import { ConversationStage } from '@/lib/agents/ConversationManager';
import { OpenAIModel } from '@/lib/llmWrapper';

// 消息接口
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'analysis' | 'code' | 'conversation';
  isStreaming?: boolean;
  analysisId?: string;
  modelId?: string; // 执行任务时使用的模型ID
}

// 分层状态设计
export interface CreatePageState {
  // UI 层状态（仅影响界面显示）
  ui: {
    templateLibraryOpen: boolean;
    rightPanelMode: 'chat' | 'code';
    isTemplateCardCollapsed: boolean;
    isMobile: boolean;
    topAlert: { message: string; type: 'success' | 'error' } | null;
    currentlyReviewedMessageId: string | null; // 当前正在Review的消息ID
  };

  // 模板层状态
  templates: {
    selected: Template | null;
    filtered: Template[];
    category: string;
    codeLangFilter: string;
    isLoading: boolean;
  };

  // 对话层状态
  conversation: {
    stage: ConversationStage;
    messages: Message[];
    inputText: string;
    selectedPrompt: string;
  };

  // 代码层状态
  code: {
    current: string;
    streaming: string;
    fileName: string;
    language: 'tsx' | 'html';
    lastRendered: string;
    isStreaming: boolean;
    hasPreviewContent: boolean;
    isRendering: boolean;
  };

  // API 层状态
  api: {
    selectedModel: string;
    availableModels: OpenAIModel[];
    isSaving: boolean;
    isLoading: boolean;
  };

  // 操作层状态（用于防止竞态条件）
  operations: {
    activeOperations: Set<string>;
    lastOperation: string | null;
  };
}

// Action 类型定义（按功能分组）
export type CreatePageAction =
  // UI Actions
  | { type: 'UI_SET_TEMPLATE_LIBRARY_OPEN'; payload: boolean }
  | { type: 'UI_SET_RIGHT_PANEL_MODE'; payload: 'chat' | 'code' }
  | { type: 'UI_SET_TEMPLATE_CARD_COLLAPSED'; payload: boolean }
  | { type: 'UI_SET_IS_MOBILE'; payload: boolean }
  | { type: 'UI_SET_TOP_ALERT'; payload: { message: string; type: 'success' | 'error' } | null }
  | { type: 'UI_SET_CURRENTLY_REVIEWED_MESSAGE_ID'; payload: string | null }
  
  // Template Actions
  | { type: 'TEMPLATE_SET_SELECTED'; payload: Template | null }
  | { type: 'TEMPLATE_SET_FILTERED'; payload: Template[] }
  | { type: 'TEMPLATE_SET_CATEGORY'; payload: string }
  | { type: 'TEMPLATE_SET_CODE_LANG_FILTER'; payload: string }
  | { type: 'TEMPLATE_SET_IS_LOADING'; payload: boolean }
  
  // Conversation Actions
  | { type: 'CONVERSATION_SET_STAGE'; payload: ConversationStage }
  | { type: 'CONVERSATION_ADD_MESSAGE'; payload: Message }
  | { type: 'CONVERSATION_UPDATE_MESSAGE'; payload: { id: string; updates: Partial<Message> } }
  | { type: 'CONVERSATION_EDIT_MESSAGE_CONTENT'; payload: { id: string; content: string } }
  | { type: 'CONVERSATION_SET_MESSAGES'; payload: Message[] }
  | { type: 'CONVERSATION_SET_INPUT_TEXT'; payload: string }
  | { type: 'CONVERSATION_SET_SELECTED_PROMPT'; payload: string }
  | { type: 'CONVERSATION_RESET'; }
  
  // Code Actions
  | { type: 'CODE_SET_CURRENT'; payload: string }
  | { type: 'CODE_SET_STREAMING'; payload: string }
  | { type: 'CODE_SET_FILE_NAME'; payload: string }
  | { type: 'CODE_SET_LANGUAGE'; payload: 'tsx' | 'html' }
  | { type: 'CODE_SET_LAST_RENDERED'; payload: string }
  | { type: 'CODE_SET_IS_STREAMING'; payload: boolean }
  | { type: 'CODE_SET_HAS_PREVIEW_CONTENT'; payload: boolean }
  | { type: 'CODE_SET_IS_RENDERING'; payload: boolean }
  | { type: 'CODE_RESET'; }
  
  // API Actions
  | { type: 'API_SET_SELECTED_MODEL'; payload: string }
  | { type: 'API_SET_AVAILABLE_MODELS'; payload: OpenAIModel[] }
  | { type: 'API_SET_IS_SAVING'; payload: boolean }
  | { type: 'API_SET_IS_LOADING'; payload: boolean }
  
  // Operation Actions (用于防止竞态条件)
  | { type: 'OPERATION_START'; payload: string }
  | { type: 'OPERATION_END'; payload: string }
  | { type: 'OPERATION_CLEAR_ALL'; }
  
  // 复合 Actions (批量更新)
  | { type: 'BATCH_UPDATE'; payload: Partial<CreatePageState> };

// 初始状态
const initialState: CreatePageState = {
  ui: {
    templateLibraryOpen: true,
    rightPanelMode: 'chat',
    isTemplateCardCollapsed: false,
    isMobile: false,
    topAlert: null,
    currentlyReviewedMessageId: null,
  },
  templates: {
    selected: null,
    filtered: [],
    category: 'all',
    codeLangFilter: 'all',
    isLoading: false,
  },
  conversation: {
    stage: 'idle',
    messages: [],
    inputText: '',
    selectedPrompt: '',
  },
  code: {
    current: '',
    streaming: '',
    fileName: '',
    language: 'html',
    lastRendered: '',
    isStreaming: false,
    hasPreviewContent: false,
    isRendering: false,
  },
  api: {
    selectedModel: '',
    availableModels: [],
    isSaving: false,
    isLoading: false,
  },
  operations: {
    activeOperations: new Set(),
    lastOperation: null,
  },
};

// Reducer 函数
function createPageReducer(state: CreatePageState, action: CreatePageAction): CreatePageState {
  switch (action.type) {
    // UI Actions
    case 'UI_SET_TEMPLATE_LIBRARY_OPEN':
      return { ...state, ui: { ...state.ui, templateLibraryOpen: action.payload } };
    
    case 'UI_SET_RIGHT_PANEL_MODE':
      return { ...state, ui: { ...state.ui, rightPanelMode: action.payload } };
    
    case 'UI_SET_TEMPLATE_CARD_COLLAPSED':
      return { ...state, ui: { ...state.ui, isTemplateCardCollapsed: action.payload } };
    
    case 'UI_SET_IS_MOBILE':
      return { ...state, ui: { ...state.ui, isMobile: action.payload } };
    
    case 'UI_SET_TOP_ALERT':
      return { ...state, ui: { ...state.ui, topAlert: action.payload } };
    
    case 'UI_SET_CURRENTLY_REVIEWED_MESSAGE_ID':
      return { ...state, ui: { ...state.ui, currentlyReviewedMessageId: action.payload } };
    
    // Template Actions
    case 'TEMPLATE_SET_SELECTED':
      return { ...state, templates: { ...state.templates, selected: action.payload } };
    
    case 'TEMPLATE_SET_FILTERED':
      return { ...state, templates: { ...state.templates, filtered: action.payload } };
    
    case 'TEMPLATE_SET_CATEGORY':
      return { ...state, templates: { ...state.templates, category: action.payload } };
    
    case 'TEMPLATE_SET_CODE_LANG_FILTER':
      return { ...state, templates: { ...state.templates, codeLangFilter: action.payload } };
    
    case 'TEMPLATE_SET_IS_LOADING':
      return { ...state, templates: { ...state.templates, isLoading: action.payload } };
    
    // Conversation Actions
    case 'CONVERSATION_SET_STAGE':
      return { ...state, conversation: { ...state.conversation, stage: action.payload } };
    
    case 'CONVERSATION_ADD_MESSAGE':
      return { 
        ...state, 
        conversation: { 
          ...state.conversation, 
          messages: [...state.conversation.messages, action.payload] 
        } 
      };
    
    case 'CONVERSATION_UPDATE_MESSAGE':
      return {
        ...state,
        conversation: {
          ...state.conversation,
          messages: state.conversation.messages.map(msg =>
            msg.id === action.payload.id ? { ...msg, ...action.payload.updates } : msg
          ),
        },
      };
    
    case 'CONVERSATION_EDIT_MESSAGE_CONTENT':
      return {
        ...state,
        conversation: {
          ...state.conversation,
          messages: state.conversation.messages.map(msg =>
            msg.id === action.payload.id ? { ...msg, content: action.payload.content } : msg
          ),
        },
      };
    
    case 'CONVERSATION_SET_MESSAGES':
      return { ...state, conversation: { ...state.conversation, messages: action.payload } };
    
    case 'CONVERSATION_SET_INPUT_TEXT':
      return { ...state, conversation: { ...state.conversation, inputText: action.payload } };
    
    case 'CONVERSATION_SET_SELECTED_PROMPT':
      return { ...state, conversation: { ...state.conversation, selectedPrompt: action.payload } };
    
    case 'CONVERSATION_RESET':
      return {
        ...state,
        conversation: { stage: 'idle', messages: [], inputText: '', selectedPrompt: '' },
        code: { ...state.code, current: '', fileName: '', hasPreviewContent: false },
        templates: { ...state.templates, selected: null },
      };
    
    // Code Actions
    case 'CODE_SET_CURRENT':
      return { ...state, code: { ...state.code, current: action.payload } };
    
    case 'CODE_SET_STREAMING':
      return { ...state, code: { ...state.code, streaming: action.payload } };
    
    case 'CODE_SET_FILE_NAME':
      return { ...state, code: { ...state.code, fileName: action.payload } };
    
    case 'CODE_SET_LANGUAGE':
      console.log('🔤 [Context] 语言设置确认:', { from: state.code.language, to: action.payload });
      return { ...state, code: { ...state.code, language: action.payload } };
    
    case 'CODE_SET_LAST_RENDERED':
      return { ...state, code: { ...state.code, lastRendered: action.payload } };
    
    case 'CODE_SET_IS_STREAMING':
      return { ...state, code: { ...state.code, isStreaming: action.payload } };
    
    case 'CODE_SET_HAS_PREVIEW_CONTENT':
      return { ...state, code: { ...state.code, hasPreviewContent: action.payload } };
    
    case 'CODE_SET_IS_RENDERING':
      return { ...state, code: { ...state.code, isRendering: action.payload } };
    
    case 'CODE_RESET':
      return {
        ...state,
        code: {
          ...state.code,
          current: '',
          streaming: '',
          lastRendered: '',
          isStreaming: false,
          hasPreviewContent: false,
          isRendering: false,
        },
      };
    
    // API Actions
    case 'API_SET_SELECTED_MODEL':
      return { ...state, api: { ...state.api, selectedModel: action.payload } };
    
    case 'API_SET_AVAILABLE_MODELS':
      return { ...state, api: { ...state.api, availableModels: action.payload } };
    
    case 'API_SET_IS_SAVING':
      return { ...state, api: { ...state.api, isSaving: action.payload } };
    
    case 'API_SET_IS_LOADING':
      return { ...state, api: { ...state.api, isLoading: action.payload } };
    
    // Operation Actions
    case 'OPERATION_START':
      return {
        ...state,
        operations: {
          ...state.operations,
          activeOperations: new Set([...state.operations.activeOperations, action.payload]),
          lastOperation: action.payload,
        },
      };
    
    case 'OPERATION_END':
      const newActiveOperations = new Set(state.operations.activeOperations);
      newActiveOperations.delete(action.payload);
      return {
        ...state,
        operations: {
          ...state.operations,
          activeOperations: newActiveOperations,
        },
      };
    
    case 'OPERATION_CLEAR_ALL':
      return {
        ...state,
        operations: {
          activeOperations: new Set(),
          lastOperation: null,
        },
      };
    
    // Batch Update
    case 'BATCH_UPDATE':
      return { ...state, ...action.payload };
    
    default:
      return state;
  }
}

// Context 接口
interface CreatePageContextType {
  state: CreatePageState;
  dispatch: React.Dispatch<CreatePageAction>;
  actions: CreatePageActions;
}

// Action creators 接口
interface CreatePageActions {
  // UI Actions
  setTemplateLibraryOpen: (open: boolean) => void;
  setRightPanelMode: (mode: 'chat' | 'code') => void;
  setTemplateCardCollapsed: (collapsed: boolean) => void;
  setIsMobile: (isMobile: boolean) => void;
  setTopAlert: (alert: { message: string; type: 'success' | 'error' } | null) => void;
  setCurrentlyReviewedMessageId: (messageId: string | null) => void;
  
  // Template Actions
  setSelectedTemplate: (template: Template | null) => void;
  setFilteredTemplates: (templates: Template[]) => void;
  setTemplateCategory: (category: string) => void;
  setTemplateCodeLangFilter: (filter: string) => void;
  setTemplateIsLoading: (loading: boolean) => void;
  
  // Conversation Actions
  setConversationStage: (stage: ConversationStage) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  editMessageContent: (id: string, content: string) => void;
  setMessages: (messages: Message[]) => void;
  setInputText: (text: string) => void;
  setSelectedPrompt: (prompt: string) => void;
  resetConversation: () => void;
  
  // Code Actions
  setCurrentCode: (code: string) => void;
  setStreamingCode: (code: string) => void;
  setFileName: (name: string) => void;
  setCodeLanguage: (language: 'tsx' | 'html') => void;
  setLastRendered: (code: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setHasPreviewContent: (hasContent: boolean) => void;
  setIsRendering: (rendering: boolean) => void;
  resetCode: () => void;
  
  // API Actions
  setSelectedModel: (model: string) => void;
  setAvailableModels: (models: OpenAIModel[]) => void;
  setIsSaving: (saving: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  
  // Operation Actions
  startOperation: (operationId: string) => void;
  endOperation: (operationId: string) => void;
  clearAllOperations: () => void;
  
  // Utility functions
  batchUpdate: (updates: Partial<CreatePageState>) => void;
  isOperationActive: (operationId: string) => boolean;
}

// Context 创建
const CreatePageContext = createContext<CreatePageContextType | undefined>(undefined);

// Provider 组件
interface CreatePageProviderProps {
  children: React.ReactNode;
}

export const CreatePageProvider: React.FC<CreatePageProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(createPageReducer, initialState);

  // Action creators (使用 useCallback 优化性能)
  const actions = useMemo<CreatePageActions>(() => ({
    // UI Actions
    setTemplateLibraryOpen: (open) => dispatch({ type: 'UI_SET_TEMPLATE_LIBRARY_OPEN', payload: open }),
    setRightPanelMode: (mode) => dispatch({ type: 'UI_SET_RIGHT_PANEL_MODE', payload: mode }),
    setTemplateCardCollapsed: (collapsed) => dispatch({ type: 'UI_SET_TEMPLATE_CARD_COLLAPSED', payload: collapsed }),
    setIsMobile: (isMobile) => dispatch({ type: 'UI_SET_IS_MOBILE', payload: isMobile }),
    setTopAlert: (alert) => dispatch({ type: 'UI_SET_TOP_ALERT', payload: alert }),
    setCurrentlyReviewedMessageId: (messageId) => dispatch({ type: 'UI_SET_CURRENTLY_REVIEWED_MESSAGE_ID', payload: messageId }),
    
    // Template Actions
    setSelectedTemplate: (template) => dispatch({ type: 'TEMPLATE_SET_SELECTED', payload: template }),
    setFilteredTemplates: (templates) => dispatch({ type: 'TEMPLATE_SET_FILTERED', payload: templates }),
    setTemplateCategory: (category) => dispatch({ type: 'TEMPLATE_SET_CATEGORY', payload: category }),
    setTemplateCodeLangFilter: (filter) => dispatch({ type: 'TEMPLATE_SET_CODE_LANG_FILTER', payload: filter }),
    setTemplateIsLoading: (loading) => dispatch({ type: 'TEMPLATE_SET_IS_LOADING', payload: loading }),
    
    // Conversation Actions
    setConversationStage: (stage) => dispatch({ type: 'CONVERSATION_SET_STAGE', payload: stage }),
    addMessage: (message) => dispatch({ type: 'CONVERSATION_ADD_MESSAGE', payload: message }),
    updateMessage: (id, updates) => dispatch({ type: 'CONVERSATION_UPDATE_MESSAGE', payload: { id, updates } }),
    editMessageContent: (id, content) => dispatch({ type: 'CONVERSATION_EDIT_MESSAGE_CONTENT', payload: { id, content } }),
    setMessages: (messages) => dispatch({ type: 'CONVERSATION_SET_MESSAGES', payload: messages }),
    setInputText: (text) => dispatch({ type: 'CONVERSATION_SET_INPUT_TEXT', payload: text }),
    setSelectedPrompt: (prompt: string) => dispatch({ type: 'CONVERSATION_SET_SELECTED_PROMPT', payload: prompt }),
    resetConversation: () => dispatch({ type: 'CONVERSATION_RESET' }),
    
    // Code Actions
    setCurrentCode: (code) => dispatch({ type: 'CODE_SET_CURRENT', payload: code }),
    setStreamingCode: (code) => dispatch({ type: 'CODE_SET_STREAMING', payload: code }),
    setFileName: (name) => dispatch({ type: 'CODE_SET_FILE_NAME', payload: name }),
    setCodeLanguage: (language) => dispatch({ type: 'CODE_SET_LANGUAGE', payload: language }),
    setLastRendered: (code) => dispatch({ type: 'CODE_SET_LAST_RENDERED', payload: code }),
    setIsStreaming: (streaming) => dispatch({ type: 'CODE_SET_IS_STREAMING', payload: streaming }),
    setHasPreviewContent: (hasContent) => dispatch({ type: 'CODE_SET_HAS_PREVIEW_CONTENT', payload: hasContent }),
    setIsRendering: (rendering) => dispatch({ type: 'CODE_SET_IS_RENDERING', payload: rendering }),
    resetCode: () => dispatch({ type: 'CODE_RESET' }),
    
    // API Actions
    setSelectedModel: (model) => dispatch({ type: 'API_SET_SELECTED_MODEL', payload: model }),
    setAvailableModels: (models) => dispatch({ type: 'API_SET_AVAILABLE_MODELS', payload: models }),
    setIsSaving: (saving) => dispatch({ type: 'API_SET_IS_SAVING', payload: saving }),
    setIsLoading: (loading) => dispatch({ type: 'API_SET_IS_LOADING', payload: loading }),
    
    // Operation Actions
    startOperation: (operationId) => dispatch({ type: 'OPERATION_START', payload: operationId }),
    endOperation: (operationId) => dispatch({ type: 'OPERATION_END', payload: operationId }),
    clearAllOperations: () => dispatch({ type: 'OPERATION_CLEAR_ALL' }),
    
    // Utility functions
    batchUpdate: (updates) => dispatch({ type: 'BATCH_UPDATE', payload: updates }),
    isOperationActive: (operationId) => state.operations.activeOperations.has(operationId),
  }), [state.operations.activeOperations]);

  const value = useMemo(() => ({
    state,
    dispatch,
    actions,
  }), [state, actions]);

  return (
    <CreatePageContext.Provider value={value}>
      {children}
    </CreatePageContext.Provider>
  );
};

// Hook for using the context
export const useCreatePageContext = () => {
  const context = useContext(CreatePageContext);
  if (context === undefined) {
    throw new Error('useCreatePageContext must be used within a CreatePageProvider');
  }
  return context;
};

// Convenience hooks for specific state slices
export const useUIState = () => {
  const { state, actions } = useCreatePageContext();
  return {
    ui: state.ui,
    setTemplateLibraryOpen: actions.setTemplateLibraryOpen,
    setRightPanelMode: actions.setRightPanelMode,
    setTemplateCardCollapsed: actions.setTemplateCardCollapsed,
    setIsMobile: actions.setIsMobile,
    setTopAlert: actions.setTopAlert,
    setCurrentlyReviewedMessageId: actions.setCurrentlyReviewedMessageId,
  };
};

export const useTemplateState = () => {
  const { state, actions } = useCreatePageContext();
  return {
    templates: state.templates,
    setSelectedTemplate: actions.setSelectedTemplate,
    setFilteredTemplates: actions.setFilteredTemplates,
    setTemplateCategory: actions.setTemplateCategory,
    setTemplateCodeLangFilter: actions.setTemplateCodeLangFilter,
    setTemplateIsLoading: actions.setTemplateIsLoading,
  };
};

export const useConversationState = () => {
  const { state, actions } = useCreatePageContext();
  return {
    conversation: state.conversation,
    setConversationStage: actions.setConversationStage,
    addMessage: actions.addMessage,
    updateMessage: actions.updateMessage,
    editMessageContent: actions.editMessageContent,
    setMessages: actions.setMessages,
    setInputText: actions.setInputText,
    setSelectedPrompt: actions.setSelectedPrompt,
    resetConversation: actions.resetConversation,
  };
};

export const useCodeState = () => {
  const { state, actions } = useCreatePageContext();
  return {
    code: state.code,
    setCurrentCode: actions.setCurrentCode,
    setStreamingCode: actions.setStreamingCode,
    setFileName: actions.setFileName,
    setCodeLanguage: actions.setCodeLanguage,
    setLastRendered: actions.setLastRendered,
    setIsStreaming: actions.setIsStreaming,
    setHasPreviewContent: actions.setHasPreviewContent,
    setIsRendering: actions.setIsRendering,
    resetCode: actions.resetCode,
  };
};

export const useAPIState = () => {
  const { state, actions } = useCreatePageContext();
  return {
    api: state.api,
    setSelectedModel: actions.setSelectedModel,
    setAvailableModels: actions.setAvailableModels,
    setIsSaving: actions.setIsSaving,
    setIsLoading: actions.setIsLoading,
  };
};