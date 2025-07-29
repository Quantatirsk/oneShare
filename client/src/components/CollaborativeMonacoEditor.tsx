import { useRef, useCallback, useEffect, useState } from 'react';
import { Editor, Monaco } from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import { useToast } from '@/hooks/use-toast';
import { getYjsManager, CollaborativeSession } from '@/lib/yjs-provider';
import type { AppConfig } from '@/types';
import { WebSocketClient } from '@/lib/websocket';

interface CollaborativeMonacoEditorProps {
  value: string;
  filename: string;
  filePath: string;
  config: AppConfig;
  wsClient: WebSocketClient;
  onSave: (content: string) => Promise<void>;
  isReadonly?: boolean;
  onChange?: (content: string) => void;
  autoFocus?: boolean;
  theme?: string;
  onCollaborationStatusChange?: (status: {isMultiUser: boolean, userCount: number}) => void;
}

export function CollaborativeMonacoEditor({ 
  value, 
  filename, 
  filePath,
  config,
  wsClient,
  onSave, 
  isReadonly = false, 
  onChange, 
  autoFocus = false, 
  theme = 'vs',
  onCollaborationStatusChange
}: CollaborativeMonacoEditorProps) {
  
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const sessionRef = useRef<CollaborativeSession | null>(null);
  const { toast } = useToast();
  
  const [userCount, setUserCount] = useState(0);
  const [collaborators, setCollaborators] = useState<Array<{name: string, color: string}>>([]);
  const [isCollaborativeMode, setIsCollaborativeMode] = useState(false);
  const [hasEnteredCollabMode, setHasEnteredCollabMode] = useState(false); // 新增状态，记录是否已进入过协同模式
  
  // These variables are used for state management and passed to parent component
  void userCount, collaborators;

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

  // Initialize collaborative editing
  const initCollaborativeEditing = useCallback(() => {
    if (!editorRef.current || !monacoRef.current || isReadonly) return;
    
    try {
      const yjsManager = getYjsManager(config);
      const session = yjsManager.createSession(filePath, value);
      sessionRef.current = session;
      
      // 只有在进入协同模式时才创建Monaco binding
      if (isCollaborativeMode) {
        console.log('Creating Monaco Y.js binding for collaborative mode');
        const binding = new MonacoBinding(
          session.text,
          editorRef.current.getModel(),
          new Set([editorRef.current]),
          session.awareness
        );
        bindingRef.current = binding;
        console.log('Monaco Y.js binding created successfully');
        
        // Add debugging for Y.js document changes
        session.text.observe(() => {
          console.log('Y.js document changed:', {
            type: 'text-change',
            length: session.text.length,
            content: session.text.toString().substring(0, 50) + '...'
          });
        });
        
        // Listen for document changes
        session.text.observe(() => {
          if (onChange) {
            const currentContent = session.text.toString();
            onChange(currentContent);
          }
        });
      }
      
      // Listen for awareness changes (collaborators)
      session.awareness.on('change', () => {
        const activeCollaborators = yjsManager.getActiveCollaborators(filePath);
        const totalUsers = yjsManager.getUserCount(filePath);
        setCollaborators(activeCollaborators);
        setUserCount(totalUsers);
        
        // 只有在多用户且尚未进入协同模式时才切换到协同模式
        if (totalUsers > 1 && !hasEnteredCollabMode) {
          setIsCollaborativeMode(true);
          setHasEnteredCollabMode(true);
          
          // 延迟创建binding，确保状态已更新
          setTimeout(() => {
            if (sessionRef.current && editorRef.current && !bindingRef.current) {
              console.log('Creating Monaco Y.js binding after detecting multiple users');
              
              const editorContent = editorRef.current.getValue();
              const yjsContent = sessionRef.current.text.toString();
              
              // 比较内容，决定同步方向
              if (yjsContent.length === 0 && editorContent.length > 0) {
                // Y.js文档为空，编辑器有内容 - 将编辑器内容同步到Y.js
                console.log('Syncing editor content to Y.js document');
                sessionRef.current.text.insert(0, editorContent);
              } else if (yjsContent.length > 0 && editorContent !== yjsContent) {
                // Y.js文档有内容且与编辑器不同 - 将Y.js内容同步到编辑器
                console.log('Syncing Y.js content to editor');
                editorRef.current.setValue(yjsContent);
              }
              
              // 创建binding
              const binding = new MonacoBinding(
                sessionRef.current.text,
                editorRef.current.getModel(),
                new Set([editorRef.current]),
                sessionRef.current.awareness
              );
              bindingRef.current = binding;
            }
          }, 100);
        }
        
        // Notify parent component of collaboration status
        if (onCollaborationStatusChange) {
          onCollaborationStatusChange({
            isMultiUser: totalUsers > 1,
            userCount: totalUsers
          });
        }
      });
      
    } catch (error) {
      console.error('Failed to initialize collaborative editing:', error);
      toast({
        title: "协作编辑启用失败",
        description: "将使用本地编辑模式",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [config, wsClient, filePath, value, onChange, isReadonly, toast, onCollaborationStatusChange, isCollaborativeMode, hasEnteredCollabMode]);

  // Cleanup collaborative editing
  const cleanupCollaborativeEditing = useCallback(() => {
    if (bindingRef.current) {
      bindingRef.current.destroy();
      bindingRef.current = null;
    }
    
    if (sessionRef.current) {
      const yjsManager = getYjsManager();
      yjsManager.destroySession(filePath);
      sessionRef.current = null;
    }
    
    setIsCollaborativeMode(false);
    setHasEnteredCollabMode(false);
    setCollaborators([]);
    setUserCount(0);
    
    // Notify parent component
    if (onCollaborationStatusChange) {
      onCollaborationStatusChange({
        isMultiUser: false,
        userCount: 0
      });
    }
  }, [filePath, onCollaborationStatusChange]);

  const handleEditorDidMount = useCallback((editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Load custom themes (same as original MonacoEditor)
    try {
      import('monaco-themes/themes/Monokai.json')
        .then(data => monaco.editor.defineTheme('monokai', data as any))
        .catch(err => console.error('Failed to load Monokai theme:', err));
      
      import('monaco-themes/themes/Dracula.json')
        .then(data => monaco.editor.defineTheme('dracula', data as any))
        .catch(err => console.error('Failed to load Dracula theme:', err));
      
      import('monaco-themes/themes/Solarized-dark.json')
        .then(data => monaco.editor.defineTheme('solarized-dark', data as any))
        .catch(err => console.error('Failed to load Solarized-dark theme:', err));
      
      import('monaco-themes/themes/Solarized-light.json')
        .then(data => monaco.editor.defineTheme('solarized-light', data as any))
        .catch(err => console.error('Failed to load Solarized-light theme:', err));
      
      import('monaco-themes/themes/Tomorrow-Night.json')
        .then(data => monaco.editor.defineTheme('tomorrow-night', data as any))
        .catch(err => console.error('Failed to load Tomorrow-Night theme:', err));
      
      import('monaco-themes/themes/GitHub.json')
        .then(data => monaco.editor.defineTheme('github', data as any))
        .catch(err => console.error('Failed to load GitHub theme:', err));
        
    } catch (err) {
      console.error('Error setting up custom themes:', err);
    }
    
    // Auto focus if requested
    if (autoFocus && !isReadonly) {
      editor.focus();
    }
    
    // 移除默认的 Ctrl+S 快捷键处理，让外层处理
    // 不在这里添加 Ctrl+S 命令，避免与外层快捷键冲突
    
    // Initialize collaborative editing
    initCollaborativeEditing();
    
  }, [filename, isReadonly, onSave, toast, autoFocus, initCollaborativeEditing]);

  const handleChange = useCallback((newValue: string | undefined) => {
    // Always call onChange to trigger auto-save, regardless of collaborative mode
    if (onChange) {
      onChange(newValue || '');
    }
  }, [onChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupCollaborativeEditing();
    };
  }, [cleanupCollaborativeEditing]);


  return (
    <div className="h-full relative">
      {/* Monaco Editor - full height without status bar */}
      <div className="h-full">
        <Editor
          value={isCollaborativeMode ? undefined : value}
          language={getLanguage(filename)}
          onChange={handleChange}
          onMount={handleEditorDidMount}
          theme={theme}
          options={{
            readOnly: isReadonly,
            minimap: { enabled: true },
            fontSize: 14,
            lineNumbers: 'on',
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
            insertSpaces: true,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            suggest: {
              showKeywords: true,
              showSnippets: true,
            },
          }}
        />
      </div>
    </div>
  );
}