import { useReducer, useCallback } from 'react';
import { Template } from '@/data/templates';
import { ConversationStage } from '@/lib/agents/ConversationManager';
import { OpenAIModel } from '@/lib/llmWrapper';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'analysis' | 'code' | 'conversation';
  isStreaming?: boolean;
  analysisId?: string;
}

export interface CreatePageState {
  // UI State
  ui: {
    templateLibraryOpen: boolean;
    rightPanelMode: 'chat' | 'code';
    isTemplateCardCollapsed: boolean;
    topAlert: {message: string, type: 'success' | 'error'} | null;
  };
  
  // Template State
  templates: {
    selected: Template | null;
    filtered: Template[];
    selectedCategory: string;
    selectedCodeLang: string;
  };
  
  // Conversation State
  conversation: {
    stage: ConversationStage;
    messages: Message[];
    inputText: string;
  };
  
  // Code State
  code: {
    current: string;
    streaming: string;
    isStreaming: boolean;
    fileName: string;
    language: 'tsx' | 'html';
    lastRendered: string;
    previewHasContent: boolean;
  };
  
  // API State
  api: {
    isSaving: boolean;
    availableModels: OpenAIModel[];
    selectedModel: string;
  };
}

type CreatePageAction =
  | { type: 'SET_TEMPLATE_LIBRARY_OPEN'; payload: boolean }
  | { type: 'SET_RIGHT_PANEL_MODE'; payload: 'chat' | 'code' }
  | { type: 'SET_TEMPLATE_CARD_COLLAPSED'; payload: boolean }
  | { type: 'SET_TOP_ALERT'; payload: {message: string, type: 'success' | 'error'} | null }
  | { type: 'SET_SELECTED_TEMPLATE'; payload: Template | null }
  | { type: 'SET_FILTERED_TEMPLATES'; payload: Template[] }
  | { type: 'SET_SELECTED_CATEGORY'; payload: string }
  | { type: 'SET_SELECTED_CODE_LANG'; payload: string }
  | { type: 'SET_CONVERSATION_STAGE'; payload: ConversationStage }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'SET_INPUT_TEXT'; payload: string }
  | { type: 'SET_CURRENT_CODE'; payload: string }
  | { type: 'SET_STREAMING_CODE'; payload: string }
  | { type: 'SET_IS_STREAMING'; payload: boolean }
  | { type: 'SET_FILE_NAME'; payload: string }
  | { type: 'SET_CODE_LANGUAGE'; payload: 'tsx' | 'html' }
  | { type: 'SET_LAST_RENDERED'; payload: string }
  | { type: 'SET_PREVIEW_HAS_CONTENT'; payload: boolean }
  | { type: 'SET_IS_SAVING'; payload: boolean }
  | { type: 'SET_AVAILABLE_MODELS'; payload: OpenAIModel[] }
  | { type: 'SET_SELECTED_MODEL'; payload: string }
  | { type: 'RESET_CONVERSATION' }
  | { type: 'RESET_CODE' };

const initialState: CreatePageState = {
  ui: {
    templateLibraryOpen: true,
    rightPanelMode: 'chat',
    isTemplateCardCollapsed: false,
    topAlert: null,
  },
  templates: {
    selected: null,
    filtered: [],
    selectedCategory: 'all',
    selectedCodeLang: 'all',
  },
  conversation: {
    stage: 'idle',
    messages: [],
    inputText: '',
  },
  code: {
    current: '',
    streaming: '',
    isStreaming: false,
    fileName: '',
    language: 'tsx',
    lastRendered: '',
    previewHasContent: false,
  },
  api: {
    isSaving: false,
    availableModels: [],
    selectedModel: '',
  },
};

function createPageReducer(state: CreatePageState, action: CreatePageAction): CreatePageState {
  switch (action.type) {
    case 'SET_TEMPLATE_LIBRARY_OPEN':
      return { ...state, ui: { ...state.ui, templateLibraryOpen: action.payload } };
    
    case 'SET_RIGHT_PANEL_MODE':
      return { ...state, ui: { ...state.ui, rightPanelMode: action.payload } };
    
    case 'SET_TEMPLATE_CARD_COLLAPSED':
      return { ...state, ui: { ...state.ui, isTemplateCardCollapsed: action.payload } };
    
    case 'SET_TOP_ALERT':
      return { ...state, ui: { ...state.ui, topAlert: action.payload } };
    
    case 'SET_SELECTED_TEMPLATE':
      return { ...state, templates: { ...state.templates, selected: action.payload } };
    
    case 'SET_FILTERED_TEMPLATES':
      return { ...state, templates: { ...state.templates, filtered: action.payload } };
    
    case 'SET_SELECTED_CATEGORY':
      return { ...state, templates: { ...state.templates, selectedCategory: action.payload } };
    
    case 'SET_SELECTED_CODE_LANG':
      return { ...state, templates: { ...state.templates, selectedCodeLang: action.payload } };
    
    case 'SET_CONVERSATION_STAGE':
      return { ...state, conversation: { ...state.conversation, stage: action.payload } };
    
    case 'SET_MESSAGES':
      return { ...state, conversation: { ...state.conversation, messages: action.payload } };
    
    case 'ADD_MESSAGE':
      return { 
        ...state, 
        conversation: { 
          ...state.conversation, 
          messages: [...state.conversation.messages, action.payload] 
        } 
      };
    
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        conversation: {
          ...state.conversation,
          messages: state.conversation.messages.map(msg =>
            msg.id === action.payload.id 
              ? { ...msg, content: action.payload.content }
              : msg
          )
        }
      };
    
    case 'SET_INPUT_TEXT':
      return { ...state, conversation: { ...state.conversation, inputText: action.payload } };
    
    case 'SET_CURRENT_CODE':
      return { ...state, code: { ...state.code, current: action.payload } };
    
    case 'SET_STREAMING_CODE':
      return { ...state, code: { ...state.code, streaming: action.payload } };
    
    case 'SET_IS_STREAMING':
      return { ...state, code: { ...state.code, isStreaming: action.payload } };
    
    case 'SET_FILE_NAME':
      return { ...state, code: { ...state.code, fileName: action.payload } };
    
    case 'SET_CODE_LANGUAGE':
      return { ...state, code: { ...state.code, language: action.payload } };
    
    case 'SET_LAST_RENDERED':
      return { ...state, code: { ...state.code, lastRendered: action.payload } };
    
    case 'SET_PREVIEW_HAS_CONTENT':
      return { ...state, code: { ...state.code, previewHasContent: action.payload } };
    
    case 'SET_IS_SAVING':
      return { ...state, api: { ...state.api, isSaving: action.payload } };
    
    case 'SET_AVAILABLE_MODELS':
      return { ...state, api: { ...state.api, availableModels: action.payload } };
    
    case 'SET_SELECTED_MODEL':
      return { ...state, api: { ...state.api, selectedModel: action.payload } };
    
    case 'RESET_CONVERSATION':
      return {
        ...state,
        conversation: { stage: 'idle', messages: [], inputText: '' },
        code: { ...state.code, current: '', fileName: '', previewHasContent: false },
        templates: { ...state.templates, selected: null }
      };
    
    case 'RESET_CODE':
      return {
        ...state,
        code: {
          ...state.code,
          current: '',
          streaming: '',
          isStreaming: false,
          lastRendered: '',
          previewHasContent: false
        }
      };
    
    default:
      return state;
  }
}

export function useCreatePageState() {
  const [state, dispatch] = useReducer(createPageReducer, initialState);

  const actions = {
    // UI Actions
    setTemplateLibraryOpen: useCallback((open: boolean) => 
      dispatch({ type: 'SET_TEMPLATE_LIBRARY_OPEN', payload: open }), []),
    
    setRightPanelMode: useCallback((mode: 'chat' | 'code') => 
      dispatch({ type: 'SET_RIGHT_PANEL_MODE', payload: mode }), []),
    
    setTemplateCardCollapsed: useCallback((collapsed: boolean) => 
      dispatch({ type: 'SET_TEMPLATE_CARD_COLLAPSED', payload: collapsed }), []),
    
    setTopAlert: useCallback((alert: {message: string, type: 'success' | 'error'} | null) => 
      dispatch({ type: 'SET_TOP_ALERT', payload: alert }), []),
    
    // Template Actions
    setSelectedTemplate: useCallback((template: Template | null) => 
      dispatch({ type: 'SET_SELECTED_TEMPLATE', payload: template }), []),
    
    setFilteredTemplates: useCallback((templates: Template[]) => 
      dispatch({ type: 'SET_FILTERED_TEMPLATES', payload: templates }), []),
    
    setSelectedCategory: useCallback((category: string) => 
      dispatch({ type: 'SET_SELECTED_CATEGORY', payload: category }), []),
    
    setSelectedCodeLang: useCallback((lang: string) => 
      dispatch({ type: 'SET_SELECTED_CODE_LANG', payload: lang }), []),
    
    // Conversation Actions
    setConversationStage: useCallback((stage: ConversationStage) => 
      dispatch({ type: 'SET_CONVERSATION_STAGE', payload: stage }), []),
    
    setMessages: useCallback((messages: Message[]) => 
      dispatch({ type: 'SET_MESSAGES', payload: messages }), []),
    
    addMessage: useCallback((message: Message) => 
      dispatch({ type: 'ADD_MESSAGE', payload: message }), []),
    
    updateMessage: useCallback((id: string, content: string) => 
      dispatch({ type: 'UPDATE_MESSAGE', payload: { id, content } }), []),
    
    setInputText: useCallback((text: string) => 
      dispatch({ type: 'SET_INPUT_TEXT', payload: text }), []),
    
    // Code Actions
    setCurrentCode: useCallback((code: string) => 
      dispatch({ type: 'SET_CURRENT_CODE', payload: code }), []),
    
    setStreamingCode: useCallback((code: string) => 
      dispatch({ type: 'SET_STREAMING_CODE', payload: code }), []),
    
    setIsStreaming: useCallback((streaming: boolean) => 
      dispatch({ type: 'SET_IS_STREAMING', payload: streaming }), []),
    
    setFileName: useCallback((name: string) => 
      dispatch({ type: 'SET_FILE_NAME', payload: name }), []),
    
    setCodeLanguage: useCallback((lang: 'tsx' | 'html') => 
      dispatch({ type: 'SET_CODE_LANGUAGE', payload: lang }), []),
    
    setLastRendered: useCallback((code: string) => 
      dispatch({ type: 'SET_LAST_RENDERED', payload: code }), []),
    
    setPreviewHasContent: useCallback((hasContent: boolean) => 
      dispatch({ type: 'SET_PREVIEW_HAS_CONTENT', payload: hasContent }), []),
    
    // API Actions
    setIsSaving: useCallback((saving: boolean) => 
      dispatch({ type: 'SET_IS_SAVING', payload: saving }), []),
    
    setAvailableModels: useCallback((models: OpenAIModel[]) => 
      dispatch({ type: 'SET_AVAILABLE_MODELS', payload: models }), []),
    
    setSelectedModel: useCallback((model: string) => 
      dispatch({ type: 'SET_SELECTED_MODEL', payload: model }), []),
    
    // Complex Actions
    resetConversation: useCallback(() => 
      dispatch({ type: 'RESET_CONVERSATION' }), []),
    
    resetCode: useCallback(() => 
      dispatch({ type: 'RESET_CODE' }), []),
  };

  return { state, actions };
}