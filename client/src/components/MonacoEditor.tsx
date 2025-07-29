import React, { useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Editor, Monaco } from '@monaco-editor/react';
import { useToast } from '@/hooks/use-toast';

interface MonacoEditorProps {
  value: string;
  filename: string;
  onSave: (content: string) => Promise<void>;
  isReadonly?: boolean;
  readOnly?: boolean;
  onChange?: (content: string) => void;
  autoFocus?: boolean;
  theme?: string;
}

export interface MonacoEditorRef {
  getEditor: () => any;
  getValue: () => string;
  revealLine: (lineNumber: number) => void;
}

export const MonacoEditor = forwardRef<MonacoEditorRef, MonacoEditorProps>(({ value, filename, onSave, isReadonly = false, readOnly = false, onChange, autoFocus = false, theme = 'vs' }, ref) => {
  const editorRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    getEditor: () => editorRef.current,
    getValue: () => editorRef.current?.getValue() || '',
    revealLine: (lineNumber: number) => {
      if (editorRef.current) {
        editorRef.current.revealLine(lineNumber);
      }
    }
  }), []);
  const { toast } = useToast();
  const [content, setContent] = React.useState(value);

  // Detect language from filename
  const getLanguage = useCallback((filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const langMap: { [key: string]: string } = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      html: 'html',
      htm: 'html',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      less: 'less',
      json: 'json',
      xml: 'xml',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
      sh: 'shell',
      bash: 'shell',
      sql: 'sql',
      php: 'php',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      cs: 'csharp',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      swift: 'swift',
      kt: 'kotlin',
      dart: 'dart',
      r: 'r',
      m: 'objective-c',
      vb: 'vb',
      fs: 'fsharp',
      pl: 'perl',
      lua: 'lua',
      dockerfile: 'dockerfile',
    };
    return langMap[ext || ''] || 'plaintext';
  }, []);

  const handleEditorDidMount = useCallback((editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    
    // 禁用 TypeScript 诊断和错误显示
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true
    });
    
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true
    });
    
    // 注册特色主题
    try {
      // 加载 Monokai 主题
      import('monaco-themes/themes/Monokai.json')
        .then(data => {
          monaco.editor.defineTheme('monokai', data as any);
        })
        .catch(err => console.error('Failed to load Monokai theme:', err));
      
      // 加载 Dracula 主题
      import('monaco-themes/themes/Dracula.json')
        .then(data => {
          monaco.editor.defineTheme('dracula', data as any);
        })
        .catch(err => console.error('Failed to load Dracula theme:', err));
      
      // 加载 Solarized-dark 主题
      import('monaco-themes/themes/Solarized-dark.json')
        .then(data => {
          monaco.editor.defineTheme('solarized-dark', data as any);
        })
        .catch(err => console.error('Failed to load Solarized-dark theme:', err));
      
      // 加载 Solarized-light 主题
      import('monaco-themes/themes/Solarized-light.json')
        .then(data => {
          monaco.editor.defineTheme('solarized-light', data as any);
        })
        .catch(err => console.error('Failed to load Solarized-light theme:', err));
      
      // 加载 Tomorrow-Night 主题
      import('monaco-themes/themes/Tomorrow-Night.json')
        .then(data => {
          monaco.editor.defineTheme('tomorrow-night', data as any);
        })
        .catch(err => console.error('Failed to load Tomorrow-Night theme:', err));
      
      // 加载 GitHub 主题
      import('monaco-themes/themes/GitHub.json')
        .then(data => {
          monaco.editor.defineTheme('github', data as any);
        })
        .catch(err => console.error('Failed to load GitHub theme:', err));

      // 为了让外部能访问到 editor 实例
      const editorElement = editor.getContainerDomNode();
      if (editorElement) {
        const bgElement = editorElement.querySelector('.monaco-editor-background');
        if (bgElement) {
          (bgElement as any).__monaco_instance = { editor: monaco.editor };
        }
      }
    } catch (err) {
      console.error('Error setting up custom themes:', err);
    }
    
    // Auto focus if requested
    if (autoFocus && !isReadonly) {
      editor.focus();
    }
    
    // Add Ctrl+S save shortcut
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (editorRef.current && !isReadonly) {
        // Get latest content from editor
        const currentContent = editorRef.current.getValue();
        onSave(currentContent).then(() => {
          toast({
            title: "保存成功",
            description: `文件 ${filename.split('/').pop()} 已保存`,
            duration: 1500,
          });
        }).catch((error) => {
          toast({
            title: "保存失败",
            description: error instanceof Error ? error.message : "未知错误",
            variant: "destructive",
            duration: 1500,
          });
        });
      }
    });
  }, [filename, isReadonly, onSave, toast, autoFocus]);

  const handleChange = useCallback((newValue: string | undefined) => {
    const currentContent = newValue || '';
    setContent(currentContent);
    if (onChange && !readOnly && !isReadonly) {
      onChange(currentContent);
    }
  }, [onChange, readOnly, isReadonly]);

  // Sync content when value changes, including during streaming
  useEffect(() => {
    if (value !== content) {
      setContent(value);
      // 流式写入时，移动光标到文档末尾并保持可见
      if (editorRef.current && value.length > content.length) {
        const editor = editorRef.current;
        setTimeout(() => {
          const model = editor.getModel();
          if (model) {
            const lineCount = model.getLineCount();
            const lastLineLength = model.getLineLength(lineCount);
            // 移动到文档末尾
            editor.setPosition({ lineNumber: lineCount, column: lastLineLength + 1 });
            // 确保末尾可见
            editor.revealPosition({ lineNumber: lineCount, column: lastLineLength + 1 });
          }
        }, 0);
      }
    }
  }, [value, content]);

  return (
    <div className="h-full">
      <Editor
        value={value}
        language={getLanguage(filename)}
        onChange={readOnly || isReadonly ? undefined : handleChange}
        onMount={handleEditorDidMount}
        theme={theme}
        options={{
          readOnly: isReadonly || readOnly,
          // 基本编辑器配置
          minimap: { enabled: false },
          fontSize: 11,
          lineNumbers: 'on',
          wordWrap: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
          insertSpaces: true,
          
          // 禁用所有竖线和指引线
          rulers: [],
          guides: {
            bracketPairs: false,
            indentation: false,
            highlightActiveIndentation: false,
          },
          
          // 隐藏滚动条
          scrollbar: {
            vertical: 'hidden',
            horizontal: 'hidden',
            verticalScrollbarSize: 0,
            horizontalScrollbarSize: 0,
            useShadows: false,
            verticalHasArrows: false,
            horizontalHasArrows: false,
          },
          
          // 隐藏概览尺标
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          
          // 简化UI
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 5,
          lineNumbersMinChars: 3,
          renderWhitespace: 'none',
          
          // 代码高亮和建议
          bracketPairColorization: { enabled: true },
          suggest: {
            showKeywords: true,
            showSnippets: true,
            showMethods: true,
            showFunctions: true,
            showConstructors: true,
            showFields: true,
            showVariables: true,
            showClasses: true,
            showInterfaces: true,
            showModules: true,
            showProperties: true,
          },
          
          // 其他优化
          mouseWheelZoom: false,
          contextmenu: false,
          quickSuggestions: true,
          parameterHints: { enabled: true },
          hover: { enabled: true },
        }}
      />
    </div>
  );
});

MonacoEditor.displayName = 'MonacoEditor';