import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Type, 
  Eye, 
  EyeOff, 
  ZoomIn,
  ZoomOut,
  Hash,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Search,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isCodeFile, isMarkdownFile } from '@/constants/fileExtensions';
import { ModernMarkdownViewer } from './ModernMarkdownViewer';

interface MobileTextEditorProps {
  value: string;
  filename: string;
  onChange?: (content: string) => void;
  isReadonly?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function MobileTextEditor({ 
  value, 
  filename, 
  onChange, 
  isReadonly = false, 
  autoFocus = false,
  className 
}: MobileTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState(value);
  const [showPreview, setShowPreview] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [showToolbar, setShowToolbar] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // 文件类型检测
  const isCode = isCodeFile(filename);
  const isMarkdown = isMarkdownFile(filename);

  // 同步外部 value 变化
  useEffect(() => {
    setContent(value);
  }, [value]);

  // 自动聚焦
  useEffect(() => {
    if (autoFocus && textareaRef.current && !isReadonly) {
      textareaRef.current.focus();
    }
  }, [autoFocus, isReadonly]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    onChange?.(newContent);
  }, [onChange]);

  // 工具栏操作
  const insertText = useCallback((before: string, after: string = '', placeholder: string = '') => {
    if (!textareaRef.current || isReadonly) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const textToInsert = selectedText || placeholder;
    
    const beforeText = content.substring(0, start);
    const afterText = content.substring(end);
    const newContent = beforeText + before + textToInsert + after + afterText;
    
    setContent(newContent);
    onChange?.(newContent);
    
    // 恢复焦点和选择
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + textToInsert.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [content, onChange, isReadonly]);

  // Markdown 快捷插入
  const insertHeader = () => insertText('# ', '', '标题');
  const insertBold = () => insertText('**', '**', '粗体文本');
  const insertItalic = () => insertText('*', '*', '斜体文本');
  const insertCode = () => insertText('`', '`', '代码');
  const insertList = () => insertText('- ', '', '列表项');
  const insertOrderedList = () => insertText('1. ', '', '列表项');
  const insertQuote = () => insertText('> ', '', '引用文本');

  // 字体大小调整
  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 2, 24));
  const decreaseFontSize = () => setFontSize(prev => Math.max(prev - 2, 10));

  // 注释：撤销/重做功能可以通过浏览器原生快捷键实现 (Ctrl+Z/Ctrl+Y)

  // 搜索功能
  const handleSearch = useCallback(() => {
    if (!searchTerm || !textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const text = textarea.value.toLowerCase();
    const searchIndex = text.indexOf(searchTerm.toLowerCase(), textarea.selectionStart);
    
    if (searchIndex !== -1) {
      textarea.focus();
      textarea.setSelectionRange(searchIndex, searchIndex + searchTerm.length);
      textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchTerm]);

  // 计算行号
  const lineNumbers = content.split('\n').map((_, index) => index + 1);

  return (
    <div className={cn("flex flex-col h-full bg-background border rounded-lg", className)}>
      {/* 工具栏 */}
      {showToolbar && !isReadonly && (
        <div className="flex-shrink-0 border-b bg-muted/30 p-2">
          {/* 第一行工具栏 */}
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowToolbar(false)}
              className="h-8 w-8 p-0"
              title="隐藏工具栏"
            >
              <X className="h-4 w-4" />
            </Button>
            
            <div className="h-4 w-px bg-border mx-1" />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={decreaseFontSize}
              className="h-8 w-8 p-0"
              title="缩小字体"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            
            <span className="text-xs text-muted-foreground px-2">{fontSize}px</span>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={increaseFontSize}
              className="h-8 w-8 p-0"
              title="放大字体"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            
            <div className="h-4 w-px bg-border mx-1" />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLineNumbers(!showLineNumbers)}
              className="h-8 w-8 p-0"
              title={showLineNumbers ? "隐藏行号" : "显示行号"}
            >
              <Hash className="h-4 w-4" />
            </Button>
            
            {isMarkdown && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="h-8 w-8 p-0"
                  title={showPreview ? "隐藏预览" : "显示预览"}
                >
                  {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </>
            )}
            
            <div className="h-4 w-px bg-border mx-1" />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSearch(!showSearch)}
              className="h-8 w-8 p-0"
              title="搜索"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Markdown 工具栏 */}
          {isMarkdown && (
            <div className="flex items-center gap-1 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={insertHeader}
                className="h-8 w-8 p-0"
                title="标题"
              >
                <Hash className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={insertBold}
                className="h-8 w-8 p-0"
                title="粗体"
              >
                <Bold className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={insertItalic}
                className="h-8 w-8 p-0"
                title="斜体"
              >
                <Italic className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={insertCode}
                className="h-8 w-8 p-0"
                title="代码"
              >
                <Code className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={insertList}
                className="h-8 w-8 p-0"
                title="无序列表"
              >
                <List className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={insertOrderedList}
                className="h-8 w-8 p-0"
                title="有序列表"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={insertQuote}
                className="h-8 w-8 p-0"
                title="引用"
              >
                <Quote className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {/* 搜索栏 */}
          {showSearch && (
            <div className="flex items-center gap-2 mt-2 p-2 bg-background rounded border">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜索文本..."
                className="flex-1 bg-transparent border-0 outline-0 text-sm"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSearch}
                className="h-6 w-6 p-0"
              >
                <Search className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSearch(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}
      
      {/* 编辑器内容区域 */}
      <div className="flex-1 min-h-0 relative">
        {isMarkdown && showPreview ? (
          /* Markdown 预览模式 */
          <div className="h-full overflow-auto">
            <ModernMarkdownViewer 
              content={content} 
              className="h-full p-4"
            />
          </div>
        ) : (
          /* 文本编辑模式 */
          <div className="flex h-full">
            {/* 行号显示 */}
            {showLineNumbers && (
              <div 
                className="flex-shrink-0 bg-muted/50 border-r text-xs text-muted-foreground p-2 pt-3 overflow-hidden"
                style={{ fontSize: `${fontSize - 2}px` }}
              >
                {lineNumbers.map(num => (
                  <div 
                    key={num} 
                    className="text-right pr-2 leading-tight" 
                    style={{ lineHeight: `${fontSize + 4}px` }}
                  >
                    {num}
                  </div>
                ))}
              </div>
            )}
            
            {/* 文本输入区域 */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              readOnly={isReadonly}
              className={cn(
                "flex-1 resize-none bg-transparent border-0 outline-0 p-3 leading-tight",
                "focus:ring-0 focus:outline-none",
                isCode ? "font-mono" : "font-sans",
                isReadonly && "cursor-default"
              )}
              style={{ 
                fontSize: `${fontSize}px`,
                lineHeight: `${fontSize + 4}px`,
                tabSize: 2
              }}
              placeholder={isReadonly ? "" : "开始输入..."}
              spellCheck={!isCode}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
        )}
      </div>
      
      {/* 底部状态栏 */}
      <div className="flex-shrink-0 border-t bg-muted/30 px-3 py-1 text-xs text-muted-foreground flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>{content.length} 字符</span>
          <span>{content.split('\n').length} 行</span>
          {isCode && <span className="text-blue-500">代码模式</span>}
          {isMarkdown && <span className="text-green-500">Markdown</span>}
        </div>
        
        {!showToolbar && !isReadonly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowToolbar(true)}
            className="h-6 px-2 text-xs"
          >
            <Type className="h-3 w-3 mr-1" />
            工具栏
          </Button>
        )}
      </div>
    </div>
  );
}