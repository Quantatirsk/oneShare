import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Code2, 
  Save,
  Share2,
  Sparkles,
  RefreshCw,
  Image,
  RotateCcw,
  GripHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
// Sheet components no longer needed for floating template selector
// import {
//   Sheet,
//   SheetContent,
//   SheetDescription,
//   SheetHeader,
//   SheetTitle,
//   SheetTrigger,
// } from '@/components/ui/sheet';
import { MonacoEditor, type MonacoEditorRef } from '@/components/MonacoEditor';
import { cn } from '@/lib/utils';

// Context and Hooks
import { CreatePageProvider, useCreatePageContext } from '@/contexts/CreatePageContext';
import { useCodeRenderer } from '@/hooks/useCodeRenderer';
import { useConversationFlow } from '@/hooks/useConversationFlow';
import { useTemplateFlow } from '@/hooks/useTemplateFlow';
import { useFileFlow } from '@/hooks/useFileFlow';
import { useResponsive } from '@/hooks/useResponsive';

// Components
// import { TemplateSelector } from '@/components/createpage/TemplateSelector'; // Moved to PreviewRenderer
import { ChatInterface } from '@/components/createpage/ChatInterface';
import { PreviewRenderer } from '@/components/createpage/PreviewRenderer';
import { InputArea } from '@/components/createpage/InputArea';
import { LottieLoader } from '@/components/common/LottieAnimations';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
// import { ErrorBoundaryWrapper } from '@/components/common/ErrorBoundary';

// APIs and Utilities
import { fetchModelList } from '@/lib/llmWrapper';
import { getDefaultModel } from '@/lib/llmConfig';

// Alert component
const TopAlert: React.FC = () => {
  const { state } = useCreatePageContext();
  
  return (
    <AnimatePresence>
      {state.ui.topAlert && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className={cn(
            "fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] px-4 py-2 rounded-lg shadow-lg",
            state.ui.topAlert.type === 'success' ? "bg-green-500 text-white" : "bg-red-500 text-white"
          )}
        >
          <span className="text-sm font-medium">{state.ui.topAlert.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Header component
const HeaderBar: React.FC<{ 
  refreshPreview: () => void;
  onReset: () => void;
}> = ({ refreshPreview, onReset }) => {
  const { state } = useCreatePageContext();
  const { handleSave, handleShare } = useFileFlow();
  const isMobile = useResponsive();

  return (
    <header className={cn(
      "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50",
      isMobile ? "h-14" : "h-12"
    )}>
      <div className={cn(
        "h-full flex items-center",
        isMobile ? "px-2" : "px-4"
      )}>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => window.location.href = '/'}
            className="text-xl font-semibold text-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-2"
          >
            <Sparkles size={20} />
            CreateSpace
          </button>
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          {/* Empty center space */}
        </div>

        <div className={cn(
          "flex items-center",
          isMobile ? "gap-1" : "gap-2"
        )}>
          {!isMobile && (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={refreshPreview}
                disabled={!state.code.current.trim()}
                title="刷新预览"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                刷新
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={onReset}
                title="重置所有内容"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                重置
              </Button>
            </>
          )}
          <Button 
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={state.api.isSaving || !state.code.current.trim()}
            className="bg-black text-white hover:bg-gray-800 border-0"
          >
            {state.api.isSaving ? <LottieLoader size={16} /> : <Save className={cn("w-4 h-4", !isMobile && "mr-2")} />}
            {!isMobile && (state.api.isSaving ? '保存中...' : '保存')}
          </Button>
          <Button 
            variant="default"
            size="sm"
            onClick={handleShare}
            disabled={state.api.isSaving || !state.code.current.trim()}
            className="bg-black text-white hover:bg-gray-800 border-0"
          >
            {state.api.isSaving ? <LottieLoader size={16} /> : <Share2 className={cn("w-4 h-4", !isMobile && "mr-2")} />}
            {!isMobile && (state.api.isSaving ? '分享中...' : '分享')}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.open('/app', '_blank')}
            className="relative overflow-hidden bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-0 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/25 hover:scale-105"
          >
            <Image className={cn("w-4 h-4", !isMobile && "mr-2")} />
            {!isMobile && "Gallery"}
          </Button>
        </div>
      </div>
    </header>
  );
};

// Code Editor component
const CodeEditor: React.FC<{ editorRef: React.RefObject<MonacoEditorRef> }> = ({ editorRef }) => {
  const { state, actions } = useCreatePageContext();

  return (
    <div className="h-full p-3">
      <div className="h-full overflow-hidden">
        {state.code.current || state.code.isStreaming ? (
          <MonacoEditor
            ref={editorRef}
            value={state.code.isStreaming ? state.code.streaming : state.code.current}
            filename={`component.${state.code.language}`}
            onChange={(content) => {
              if (!state.code.isStreaming) {
                actions.setCurrentCode(content);
              }
            }}
            onSave={async (content) => {
              actions.setCurrentCode(content);
            }}
            theme="vs"
            autoFocus={false}
            readOnly={state.code.isStreaming}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/20">
            <div className="text-center">
              <Code2 className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-xs">生成的代码将在这里显示...</p>
              <p className="text-xs mt-1 opacity-70">选择模板或与AI对话开始创建</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Floating Template Selector component - 已移除，现在使用页面中间的按钮
// 原来的浮动按钮功能已集成到 PreviewRenderer 组件中

// Main CreatePage content
const CreatePageContent: React.FC = () => {
  const { state, actions } = useCreatePageContext();
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditorRef>(null);
  const isMobile = useResponsive();
  
  // Template dock state
  
  // Mobile drag state
  const [isDragging, setIsDragging] = useState(false);
  const [renderAreaHeight, setRenderAreaHeight] = useState(55); // Percentage
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartHeight, setDragStartHeight] = useState(0);

  // Initialize hooks
  const { renderPreview, refreshPreview } = useCodeRenderer({ previewContainerRef });
  const { 
    chatMessagesRef, 
    handleSendMessage, 
    handleStartGeneration, 
    handleClearChat,
    handleResetConversationManager,
    handleRetryMessage,
    handleRetryCodeGeneration
  } = useConversationFlow({ 
    previewContainerRef, 
    renderPreview 
  });
  const { 
    handleCategoryChange, 
    handleCodeLangFilterChange, 
    handleTemplateSelect,
    updateFilteredTemplates,
    confirmDialog,
    handleConfirmTemplateSwitch,
    handleCancelTemplateSwitch 
  } = useTemplateFlow({ 
    previewContainerRef 
  });
  
  
  // Handle template dock selection
  const handleTemplateDockSelect = (template: any) => {
    handleTemplateSelect(template);
  };
  
  // Handle template changes (when user creates/updates/deletes templates)
  const handleTemplateChange = () => {
    // Refresh template list by triggering a reload
    updateFilteredTemplates(state.templates.category, state.templates.codeLangFilter);
  };
  
  // Mobile drag handlers
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setIsDragging(true);
    setDragStartY(clientY);
    setDragStartHeight(renderAreaHeight);
    
    // Prevent text selection during drag
    e.preventDefault();
  };
  
  const handleDragMove = (e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - dragStartY;
    const containerHeight = window.innerHeight - 56; // Subtract header height
    const deltaPercentage = (deltaY / containerHeight) * 100;
    
    // Calculate new height with constraints
    const newHeight = Math.max(20, Math.min(80, dragStartHeight + deltaPercentage));
    setRenderAreaHeight(newHeight);
    
    e.preventDefault();
  };
  
  const handleDragEnd = () => {
    setIsDragging(false);
  };
  
  // Add event listeners for drag
  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e: MouseEvent) => handleDragMove(e);
      const handleMouseUp = () => handleDragEnd();
      const handleTouchMove = (e: TouchEvent) => handleDragMove(e);
      const handleTouchEnd = () => handleDragEnd();
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, dragStartY, dragStartHeight]);
  
  // Handle dock close - removed close button

  // Load available models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const models = await fetchModelList();
        actions.setAvailableModels(models);
        if (!state.api.selectedModel) {
          const defaultModel = await getDefaultModel();
          actions.setSelectedModel(defaultModel);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    };
    loadModels();
  }, [actions, state.api.selectedModel]);

  // Collapse template card when sending message
  const handleSendMessageWithCollapse = (message: string) => {
    if (state.templates.selected) {
      actions.setTemplateCardCollapsed(true);
    }
    handleSendMessage(message);
  };

  // Collapse template card when retrying message
  const handleRetryMessageWithCollapse = (message: string) => {
    if (state.templates.selected) {
      actions.setTemplateCardCollapsed(true);
    }
    handleRetryMessage(message);
  };

  // Review code from history
  const handleReviewCode = (code: string) => {
    console.log('📖 [Review] Loading historical code version');
    
    // Update code state
    actions.setCurrentCode(code);
    actions.setLastRendered('');
    actions.setHasPreviewContent(false);
    
    // Render preview with the reviewed code
    setTimeout(() => {
      renderPreview(code, state.code.language, true);
    }, 100);
  };

  // Reset all content
  const handleReset = () => {
    // Clear all code and conversations
    actions.setCurrentCode('');
    actions.setStreamingCode('');
    actions.setFileName('');
    actions.setLastRendered('');
    actions.setHasPreviewContent(false);
    actions.setIsStreaming(false);
    
    // Clear conversations
    actions.resetConversation();
    
    // Clear selected template
    actions.setSelectedTemplate(null);
    actions.setTemplateCardCollapsed(false);
    
    // Reset UI state
    actions.setTopAlert(null);
    
    // Clear preview container
    if (previewContainerRef.current) {
      previewContainerRef.current.innerHTML = '';
    }
    
  };

  if (isMobile) {
    // Mobile Layout
    return (
      <>
        <HeaderBar refreshPreview={refreshPreview} onReset={handleReset} />
        <div className="h-[calc(100vh-3.5rem)] flex flex-col relative">
        {/* Confirm Dialog */}
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => {
            if (!open) handleCancelTemplateSwitch();
          }}
          title="切换模板"
          description="切换模板将清空当前的对话记录、代码内容和预览结果。是否继续？"
          confirmText="继续切换"
          cancelText="取消"
          onConfirm={handleConfirmTemplateSwitch}
          onCancel={handleCancelTemplateSwitch}
          variant="destructive"
        />
        
        {/* Floating Template Selector - 移除浮动按钮 */}
        {/* <FloatingTemplateSelector
          handleCategoryChange={handleCategoryChange}
          handleCodeLangFilterChange={handleCodeLangFilterChange}
          handleTemplateSelect={handleTemplateSelect}
        /> */}
        
        {/* Main Content Area - Render Area */}
        <div className="w-full" style={{ height: `${renderAreaHeight}%` }}>
          <PreviewRenderer 
            previewContainerRef={previewContainerRef}
            isMobile={isMobile}
            onTemplateSelect={handleTemplateDockSelect}
            onCategoryChange={handleCategoryChange}
            onCodeLangFilterChange={handleCodeLangFilterChange}
            onTemplateChange={handleTemplateChange}
          />
        </div>

        {/* Draggable Handle */}
        <div
          className={cn(
            "w-full h-3 bg-border/50 hover:bg-border cursor-row-resize flex items-center justify-center transition-colors",
            isDragging && "bg-primary/20"
          )}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <GripHorizontal className="w-4 h-4 text-muted-foreground" />
        </div>

        {/* Interactive Panel - Mobile Bottom Panel */}
        <div className="w-full flex flex-col bg-background border-t" style={{ height: `${100 - renderAreaHeight}%` }}>
          {/* Panel Header with Mode Toggle */}
          <div className="flex items-center justify-center px-4 py-2 border-b bg-background/95 backdrop-blur shrink-0">
            <div className="flex items-center space-x-1 bg-muted rounded-lg p-1">
              <Button
                variant={state.ui.rightPanelMode === 'chat' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => actions.setRightPanelMode('chat')}
                className="h-8 px-3 text-xs"
              >
                对话
              </Button>
              <Button
                variant={state.ui.rightPanelMode === 'code' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => actions.setRightPanelMode('code')}
                className="h-8 px-3 text-xs"
              >
                代码
              </Button>
            </div>
            
            {/* Mobile Refresh Button */}
            <div className="ml-auto">
              <Button 
                variant="outline" 
                size="sm"
                onClick={refreshPreview}
                disabled={!state.code.current.trim()}
                className="h-8 px-3 text-xs"
              >
                {state.conversation.stage === 'generating' ? (
                  <LottieLoader size={14} className="mr-1" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1" />
                )}
                {state.conversation.stage === 'generating' ? '渲染中' : '刷新'}
              </Button>
            </div>
          </div>
          
          {/* Panel Content */}
          <div className="flex-1 relative overflow-hidden min-h-0">
            {/* Chat Content */}
            <div className={`absolute inset-0 transition-opacity duration-200 ${
              state.ui.rightPanelMode === 'chat' ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}>
              <ChatInterface
                chatMessagesRef={chatMessagesRef}
                onClearChat={handleClearChat}
                onStartGeneration={handleStartGeneration}
                onSendMessage={handleSendMessageWithCollapse}
                onRetryAnalysis={handleRetryMessageWithCollapse}
                onResetConversation={handleResetConversationManager}
                onRetryCodeGeneration={handleRetryCodeGeneration}
                onReviewCode={handleReviewCode}
                onTemplateSelect={handleTemplateDockSelect}
              />
            </div>
            
            {/* Code Content */}
            <div className={`absolute inset-0 transition-opacity duration-200 ${
              state.ui.rightPanelMode === 'code' ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}>
              <CodeEditor editorRef={editorRef} />
            </div>
          </div>
          
          {/* Input Area */}
          <div className="shrink-0">
            <InputArea onSendMessage={handleSendMessageWithCollapse} isMobile={isMobile} />
          </div>
          
        </div>
        </div>
      </>
    );
  }

  // Desktop Layout
  return (
    <>
      <HeaderBar refreshPreview={refreshPreview} onReset={handleReset} />
      <div className="h-[calc(100vh-3.5rem)]">
        <ResizablePanelGroup direction="horizontal" className="h-full relative">
      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) handleCancelTemplateSwitch();
        }}
        title="切换模板"
        description="切换模板将清空当前的对话记录、代码内容和预览结果。是否继续？"
        confirmText="继续切换"
        cancelText="取消"
        onConfirm={handleConfirmTemplateSwitch}
        onCancel={handleCancelTemplateSwitch}
        variant="destructive"
      />
      
      {/* Floating Template Selector - 移除浮动按钮 */}
      {/* <FloatingTemplateSelector
        handleCategoryChange={handleCategoryChange}
        handleCodeLangFilterChange={handleCodeLangFilterChange}
        handleTemplateSelect={handleTemplateSelect}
      /> */}
      
      {/* Left Side - Render Area */}
      <ResizablePanel defaultSize={75} minSize={60}>
        <div className="h-full">
          {/* Render Area */}
          <div className="flex-1 flex flex-col h-full">
            <PreviewRenderer 
              previewContainerRef={previewContainerRef}
              isMobile={isMobile}
              onTemplateSelect={handleTemplateDockSelect}
              onCategoryChange={handleCategoryChange}
              onCodeLangFilterChange={handleCodeLangFilterChange}
              onTemplateChange={handleTemplateChange}
            />
          </div>
        </div>
      </ResizablePanel>
      
      <ResizableHandle withHandle />
      
      {/* Right Side - Chat and Code Panel */}
      <ResizablePanel defaultSize={25} minSize={20}>
        <div className="flex flex-col bg-background h-full">
          {/* Overlapping Content Area */}
          <div className="flex-1 relative overflow-hidden">
            {/* Chat Content */}
            <div className={`absolute inset-0 transition-opacity duration-200 ${
              state.ui.rightPanelMode === 'chat' ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}>
              <ChatInterface
                chatMessagesRef={chatMessagesRef}
                onClearChat={handleClearChat}
                onStartGeneration={handleStartGeneration}
                onSendMessage={handleSendMessageWithCollapse}
                onRetryAnalysis={handleRetryMessageWithCollapse}
                onResetConversation={handleResetConversationManager}
                onRetryCodeGeneration={handleRetryCodeGeneration}
                onReviewCode={handleReviewCode}
                onTemplateSelect={handleTemplateDockSelect}
              />
            </div>
            
            {/* Code Content */}
            <div className={`absolute inset-0 transition-opacity duration-200 ${
              state.ui.rightPanelMode === 'code' ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}>
              <CodeEditor editorRef={editorRef} />
            </div>
          </div>
          
          {/* Input Area */}
          <InputArea onSendMessage={handleSendMessageWithCollapse} isMobile={isMobile} />
        </div>
      </ResizablePanel>
      
        </ResizablePanelGroup>
      </div>
    </>
  );
};

// Main CreatePage component with provider
export function CreatePage() {
  return (
    <CreatePageProvider>
      <div className="min-h-screen bg-background">
        <TopAlert />
        <CreatePageContent />
      </div>
    </CreatePageProvider>
  );
}

export default CreatePage;