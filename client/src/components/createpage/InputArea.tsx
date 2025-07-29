import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowUp, Bot } from 'lucide-react';
import { LottieLoader } from '@/components/common/LottieAnimations';
import { 
  useConversationState, 
  useUIState, 
  useCodeState,
  useAPIState 
} from '@/contexts/CreatePageContext';

// React and HTML5 Icons
const ReactIcon = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 9.861A2.139 2.139 0 1 0 12 14.139 2.139 2.139 0 1 0 12 9.861zM6.008 16.255l-.472-.12C2.018 15.246 0 13.737 0 11.996s2.018-3.25 5.536-4.139l.472-.119.133.468a23.53 23.53 0 0 0 1.363 3.578l.101.213-.101.213a23.307 23.307 0 0 0-1.363 3.578l-.133.467zM5.317 8.95c-2.674.751-4.315 1.9-4.315 3.046 0 1.145 1.641 2.294 4.315 3.046a24.95 24.95 0 0 1 1.182-3.046A24.752 24.752 0 0 1 5.317 8.95zM17.992 16.255l-.133-.469a23.357 23.357 0 0 0-1.364-3.577l-.101-.213.101-.213a23.42 23.42 0 0 0 1.364-3.578l.133-.468.473.119c3.517.889 5.535 2.398 5.535 4.139s-2.018 3.25-5.535 4.139l-.473.12zm-.491-4.259c.48 1.039.877 2.06 1.182 3.046 2.675-.752 4.315-1.901 4.315-3.046 0-1.146-1.641-2.294-4.315-3.046a24.788 24.788 0 0 1-1.182 3.046zM5.31 8.945l-.133-.467C4.188 4.992 4.488 2.494 6 1.622c1.483-.856 3.864.155 6.359 2.716l.34.349-.34.349a23.552 23.552 0 0 0-2.422 2.967l-.135.193-.235.02a23.657 23.657 0 0 0-3.785.61l-.472.119zm1.896-6.63c-.268 0-.505.058-.705.173-.994.573-1.17 2.565-.485 5.253a25.122 25.122 0 0 1 3.233-.501 24.847 24.847 0 0 1 2.052-2.544c-1.56-1.519-3.037-2.381-4.095-2.381zM16.795 22.677c-.001 0-.001 0 0 0-1.425 0-3.255-1.073-5.154-3.023l-.34-.349.34-.349a23.53 23.53 0 0 0 2.421-2.968l.135-.193.234-.02a23.63 23.63 0 0 0 3.787-.609l.472-.119.134.468c.987 3.484.688 5.983-.824 6.854a2.38 2.38 0 0 1-1.205.308zm-4.096-3.381c1.56 1.519 3.037 2.381 4.095 2.381h.001c.267 0 .505-.058.704-.173.994-.573 1.171-2.566.485-5.254a25.02 25.02 0 0 1-3.234.501 24.674 24.674 0 0 1-2.051 2.545zM18.69 8.945l-.472-.119a23.479 23.479 0 0 0-3.787-.61l-.234-.02-.135-.193a23.414 23.414 0 0 0-2.421-2.967l-.34-.349.34-.349C14.135 1.778 16.515.767 18 1.622c1.512.872 1.812 3.37.823 6.855l-.133.468zM14.75 7.24c1.142.104 2.227.273 3.234.501.686-2.688.509-4.68-.485-5.253-.988-.571-2.845.304-4.8 2.208A24.849 24.849 0 0 1 14.75 7.24zM7.206 22.677A2.38 2.38 0 0 1 6 22.369c-1.512-.871-1.812-3.369-.823-6.854l.132-.468.472.119c1.155.291 2.429.496 3.785.609l.235.02.134.193a23.596 23.596 0 0 0 2.422 2.968l.34.349-.34.349c-1.898 1.95-3.728 3.023-5.151 3.023zm-1.19-6.427c-.686 2.688-.509 4.681.485 5.254.988.571 2.845-.309 4.8-2.208a24.998 24.998 0 0 1-2.052-2.545 25.049 25.049 0 0 1-3.233-.501z"/>
  </svg>
);

const Html5Icon = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.326 3.426-2.91.804-2.955-.81-.188-2.11H6.248l.33 4.171L12 19.351l5.379-1.443.744-8.157H8.531z"/>
  </svg>
);

interface InputAreaProps {
  onSendMessage: (message: string) => void;
  isMobile?: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({
  onSendMessage,
  isMobile = false
}) => {
  const { conversation, setInputText, setSelectedPrompt } = useConversationState();
  const { ui, setRightPanelMode } = useUIState();
  const { code, setCodeLanguage } = useCodeState();
  const { api, setSelectedModel } = useAPIState();
  
  // 本地状态用于输入，减少Context更新频率
  const [localInputText, setLocalInputText] = useState(conversation.inputText);

  // 同步Context中的inputText到本地状态（比如发送后清空）
  useEffect(() => {
    if (conversation.inputText !== localInputText) {
      setLocalInputText(conversation.inputText);
    }
  }, [conversation.inputText]);

  // Debounce更新Context，减少重渲染
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (localInputText !== conversation.inputText) {
        setInputText(localInputText);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [localInputText, conversation.inputText, setInputText]);

  // 使用 useCallback 优化函数，避免每次渲染都重新创建
  const handleSend = useCallback(() => {
    const trimmedText = localInputText.trim();
    if (trimmedText) {
      // 立即同步到Context以确保发送的是最新内容
      setInputText(trimmedText);
      onSendMessage(trimmedText);
      setLocalInputText('');
      setInputText('');
      // 清理选中的创意提示
      setSelectedPrompt('');
    }
  }, [localInputText, onSendMessage, setInputText, setSelectedPrompt]);

  // 使用 useMemo 优化计算，只在依赖变化时重新计算
  const isDisabled = useMemo(() => {
    return conversation.stage === 'analyzing' || 
           conversation.stage === 'generating' || 
           !localInputText.trim();
  }, [conversation.stage, localInputText]);

  // 缓存输入处理函数 - 使用本地状态
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalInputText(e.target.value);
  }, []);

  // 缓存键盘事件处理函数 - 现在回车键不发送消息，支持多行输入
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 移除回车键发送逻辑，现在回车键只是换行
    // 如果需要快捷键发送，可以使用 Ctrl+Enter 或 Cmd+Enter
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // 缓存语言切换函数
  const handleLanguageChange = useCallback((value: 'tsx' | 'html') => {
    console.log('🔤 [InputArea] 语言切换:', { from: code.language, to: value });
    setCodeLanguage(value);
  }, [setCodeLanguage, code.language]);

  // 缓存模型切换函数
  const handleModelChange = useCallback((value: string) => {
    setSelectedModel(value);
  }, [setSelectedModel]);

  // 缓存开关切换函数
  const handleSwitchChange = useCallback((checked: boolean) => {
    setRightPanelMode(checked ? 'code' : 'chat');
  }, [setRightPanelMode]);


  // 缓存占位符文本
  const placeholderText = useMemo(() => {
    // 只有在idle阶段才显示选中的创意提示
    if (conversation.stage === 'idle' && conversation.selectedPrompt) {
      return conversation.selectedPrompt;
    }
    
    if (conversation.stage === 'idle') {
      return "描述您想要创建的应用，AI将先分析需求...";
    } else if (conversation.stage === 'completed') {
      return "继续对话来修改应用...";
    } else {
      return "请等待当前操作完成...";
    }
  }, [conversation.stage, conversation.selectedPrompt]);

  return (
    <div className="border-t bg-background flex flex-col p-2">
      {/* Text Input Container */}
      <div className="mb-0">
        <textarea
          value={localInputText}
          onChange={handleInputChange}
          placeholder={placeholderText}
          className={`w-full p-2.5 text-xs border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 ${isMobile ? 'h-24' : 'h-32'}`}
          onKeyDown={handleKeyDown}
        />
        
      </div>
      
      {/* Controls Row */}
      <div className="flex items-center justify-between px-1 py-1 border-t border-border/30 gap-1">
        {/* Left Controls - Code Switch + Language Selector */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="flex items-center gap-1">
            <label htmlFor="code-switch" className="text-xs font-medium text-muted-foreground">Code</label>
            <Switch
              id="code-switch"
              checked={ui.rightPanelMode === 'code'}
              onCheckedChange={handleSwitchChange}
              className="scale-75"
            />
          </div>
          
          {/* Code Language Selector - 桌面端和移动端都显示 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                {code.language === 'tsx' ? (
                  <ReactIcon className="w-3 h-3 mr-1 text-blue-600" />
                ) : (
                  <Html5Icon className="w-3 h-3 mr-1 text-orange-600" />
                )}
                <span className="hidden sm:inline">{code.language === 'tsx' ? 'React' : 'HTML'}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-24">
              <DropdownMenuItem 
                onClick={() => handleLanguageChange('tsx')}
                className="flex items-center gap-2 text-xs"
              >
                <ReactIcon className="w-3 h-3 text-blue-600" />
                React
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleLanguageChange('html')}
                className="flex items-center gap-2 text-xs"
              >
                <Html5Icon className="w-3 h-3 text-orange-600" />
                HTML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Right Controls - Model Selector + Send Button */}
        <div className="flex items-center gap-1 min-w-0">          
          {/* Model Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs font-normal text-muted-foreground hover:text-foreground min-w-0 overflow-hidden"
              >
                <Bot className="w-3 h-3 flex-shrink-0" />
                <span className="ml-1 truncate min-w-0">{api.selectedModel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 max-h-48 overflow-y-auto">
              {api.availableModels.map((model) => (
                <DropdownMenuItem 
                  key={model.id}
                  onClick={() => handleModelChange(model.id)}
                  className="text-xs cursor-pointer"
                >
                  <span className="truncate">{model.id}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={isDisabled}
            size="sm"
            className="h-6 px-2 text-xs flex items-center justify-center flex-shrink-0"
          >
            {(conversation.stage === 'analyzing' || conversation.stage === 'generating') ? (
              <LottieLoader size={12} />
            ) : (
              <ArrowUp className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(InputArea);