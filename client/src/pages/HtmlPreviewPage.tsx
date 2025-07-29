import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getSharedFileContent, type ShareInfo } from '@/lib/shareUtils';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { fetchLLMConfig } from '@/lib/llmWrapper';

export function HtmlPreviewPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  const { config } = useAppStore();
  const [api] = React.useState(() => new FileServerAPI(config));
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Claude API 处理函数
  const handleClaudeRequest = useCallback(async (event: MessageEvent) => {
    if (event.data.type === 'claude-complete-request') {
      try {
        const { requestId, prompt, options = {} } = event.data;
        const llmConfig = await fetchLLMConfig();
        const defaultOptions = {
          model: llmConfig?.default_model || "google/gemini-2.5-flash-lite",
          temperature: llmConfig?.temperature || 0.8,
          max_tokens: llmConfig?.max_tokens || 8000
        };
        const config = { ...defaultOptions, ...options };
        
        const messages = [{ role: "user" as const, content: prompt }];
        
        const response = await fetch("/api/llm/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            model: config.model,
            temperature: config.temperature,
            max_tokens: config.max_tokens
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || "API调用失败");
        }
        
        // 发送响应回iframe
        iframeRef.current?.contentWindow?.postMessage({
          type: 'claude-complete-response',
          requestId,
          result: result.data || ""
        }, '*');
        
      } catch (error) {
        // 发送错误回iframe
        iframeRef.current?.contentWindow?.postMessage({
          type: 'claude-complete-response',
          requestId: event.data.requestId,
          error: error instanceof Error ? error.message : "API调用失败"
        }, '*');
      }
    } else if (event.data.type === 'claude-stream-request') {
      try {
        const { requestId, prompt, options = {} } = event.data;
        const llmConfig = await fetchLLMConfig();
        const defaultOptions = {
          model: llmConfig?.default_model || "google/gemini-2.5-flash-lite",
          temperature: llmConfig?.temperature || 0.8,
          max_tokens: llmConfig?.max_tokens || 8000
        };
        const config = { ...defaultOptions, ...options };
        
        const messages = [{ role: "user" as const, content: prompt }];
        
        const response = await fetch("/api/llm/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            model: config.model,
            temperature: config.temperature,
            max_tokens: config.max_tokens
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("无法获取响应流");
        }
        
        const decoder = new TextDecoder();
        let buffer = "";
        
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  // 发送数据块回iframe
                  iframeRef.current?.contentWindow?.postMessage({
                    type: 'claude-stream-response',
                    requestId,
                    chunk: data.content
                  }, '*');
                } else if (data.done) {
                  // 发送完成信号回iframe
                  iframeRef.current?.contentWindow?.postMessage({
                    type: 'claude-stream-response',
                    requestId,
                    done: true
                  }, '*');
                  return;
                } else if (data.error) {
                  // 发送错误回iframe
                  iframeRef.current?.contentWindow?.postMessage({
                    type: 'claude-stream-response',
                    requestId,
                    error: data.error
                  }, '*');
                  return;
                }
              } catch (e) {
                console.warn("解析流数据失败:", line);
              }
            }
          }
        }
      } catch (error) {
        // 发送错误回iframe
        iframeRef.current?.contentWindow?.postMessage({
          type: 'claude-stream-response',
          requestId: event.data.requestId,
          error: error instanceof Error ? error.message : "流式调用失败"
        }, '*');
      }
    }
  }, []);

  // 监听来自iframe的消息
  useEffect(() => {
    window.addEventListener('message', handleClaudeRequest);
    return () => {
      window.removeEventListener('message', handleClaudeRequest);
    };
  }, [handleClaudeRequest]);

  // 辅助函数：去除文件名后缀
  const getFileNameWithoutExtension = (filename: string): string => {
    if (!filename) return '';
    const dotIndex = filename.lastIndexOf('.');
    return dotIndex > 0 ? filename.substring(0, dotIndex) : filename;
  };

  useEffect(() => {
    if (!shareId) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }
    loadSharedFile(shareId);
  }, [shareId]);

  // 设置页面标题
  useEffect(() => {
    if (shareInfo?.filename) {
      const filename = shareInfo.filename.split('/').pop() || shareInfo.filename;
      const nameWithoutExt = getFileNameWithoutExtension(filename);
      document.title = `${nameWithoutExt}`;
    }
    return () => {
      document.title = 'OneShare';
    };
  }, [shareInfo?.filename]);

  const loadSharedFile = async (shareId: string) => {
    try {
      setLoading(true);
      setError(null);
      const sharedFile = await getSharedFileContent(api, shareId);
      if (!sharedFile) {
        setError('分享链接不存在或已过期');
        return;
      }
      setShareInfo({ 
        id: shareId, 
        filename: sharedFile.filename, 
        isPublic: sharedFile.isPublic, 
        createdAt: sharedFile.createdAt 
      });
      setFileContent(sharedFile.content);
      
      // 自动开始渲染
      setTimeout(() => {
        renderHTML(sharedFile.content);
      }, 100);
    } catch (error) {
      console.error('加载分享文件失败:', error);
      setError(error instanceof Error ? error.message : '加载分享文件失败');
    } finally {
      setLoading(false);
    }
  };

  const renderHTML = async (htmlContent: string) => {
    if (!iframeRef.current) {
      toast({
        title: '渲染失败',
        description: '容器未准备就绪',
        variant: 'destructive'
      });
      return;
    }

    try {
      setRendering(true);
      setError(null);

      const iframe = iframeRef.current;
      
      // 等待iframe加载完成
      const waitForIframeLoad = () => {
        return new Promise<void>((resolve) => {
          if (iframe.contentDocument) {
            resolve();
          } else {
            iframe.onload = () => resolve();
          }
        });
      };

      await waitForIframeLoad();

      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc) {
        throw new Error('无法访问iframe文档');
      }
      
      // 不修改原始HTML内容，直接加载
      iframe.srcdoc = htmlContent;

      // 等待iframe加载完成后注入Claude API 和 LLM API 桥接
    iframe.onload = () => {
      try {
        const iframeWindow = iframe.contentWindow;
        if (!iframeWindow) return;

        // 在iframe中注入Claude API桥接脚本
        const script = iframeWindow.document.createElement('script');
        script.textContent = `
          // 创建Claude API桥接
          window.claude = {
            async complete(prompt, options = {}) {
              return new Promise((resolve, reject) => {
                const requestId = Date.now().toString();
                
                // 监听响应
                const handler = (event) => {
                  if (event.data.type === 'claude-complete-response' && event.data.requestId === requestId) {
                    window.removeEventListener('message', handler);
                    if (event.data.error) {
                      reject(new Error(event.data.error));
                    } else {
                      resolve(event.data.result);
                    }
                  }
                };
                window.addEventListener('message', handler);
                
                // 发送请求到父窗口
                window.parent.postMessage({
                  type: 'claude-complete-request',
                  requestId,
                  prompt,
                  options
                }, '*');
              });
            },
            
            stream(prompt, onChunk, onComplete, onError, options = {}) {
              const requestId = Date.now().toString();
              
              // 监听流式响应
              const handler = (event) => {
                if (event.data.type === 'claude-stream-response' && event.data.requestId === requestId) {
                  if (event.data.chunk) {
                    onChunk(event.data.chunk);
                  } else if (event.data.done) {
                    window.removeEventListener('message', handler);
                    onComplete?.();
                  } else if (event.data.error) {
                    window.removeEventListener('message', handler);
                    onError?.(event.data.error);
                  }
                }
              };
              window.addEventListener('message', handler);
              
              // 发送流式请求到父窗口
              window.parent.postMessage({
                type: 'claude-stream-request',
                requestId,
                prompt,
                options
              }, '*');
            }
          };
          
          // 创建标准化的 LLM API 桥接
          window.llm = {
            async complete(messages, options = {}) {
              return new Promise((resolve, reject) => {
                const requestId = Date.now().toString();
                
                // 监听响应
                const handler = (event) => {
                  if (event.data.type === 'llm-complete-response' && event.data.requestId === requestId) {
                    window.removeEventListener('message', handler);
                    if (event.data.error) {
                      reject(new Error(event.data.error));
                    } else {
                      resolve(event.data.result);
                    }
                  }
                };
                window.addEventListener('message', handler);
                
                // 发送请求到父窗口
                window.parent.postMessage({
                  type: 'llm-complete-request',
                  requestId,
                  messages,
                  options
                }, '*');
              });
            },
            
            stream(messages, onChunk, onComplete, onError, options = {}) {
              const requestId = Date.now().toString();
              
              // 监听流式响应
              const handler = (event) => {
                if (event.data.type === 'llm-stream-response' && event.data.requestId === requestId) {
                  if (event.data.chunk) {
                    onChunk(event.data.chunk);
                  } else if (event.data.done) {
                    window.removeEventListener('message', handler);
                    onComplete?.();
                  } else if (event.data.error) {
                    window.removeEventListener('message', handler);
                    onError?.(event.data.error);
                  }
                }
              };
              window.addEventListener('message', handler);
              
              // 发送流式请求到父窗口
              window.parent.postMessage({
                type: 'llm-stream-request',
                requestId,
                messages,
                options
              }, '*');
            }
          };
        `;
        iframeWindow.document.head.appendChild(script);
      } catch (error) {
        console.error('注入Claude API桥接失败:', error);
      }
    };

    } catch (error) {
      console.error('HTML渲染失败:', error);
      const errorMessage = error instanceof Error ? error.message : '渲染失败';
      setError(errorMessage);
      toast({
        title: '渲染失败',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setRendering(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="text-muted-foreground">加载HTML文件中...</span>
        </div>
      </div>
    );
  }

  if (error && !shareInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">无法访问文件</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* 预览区域 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {rendering && (
          <div className="flex items-center justify-center p-4 sm:p-8 border-b border-border bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">
                <span className="hidden sm:inline">正在渲染HTML页面...</span>
                <span className="sm:hidden">渲染中...</span>
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center p-4 sm:p-8 border-b border-border bg-destructive/10">
            <div className="flex flex-col sm:flex-row items-center gap-3 text-destructive">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-medium text-center sm:text-left">{error}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => renderHTML(fileContent)}
                className="mt-2 sm:mt-0 sm:ml-4"
              >
                重试
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 relative bg-white">
          <iframe
            ref={iframeRef}
            className="absolute inset-0 w-full h-full border-0"
            style={{ minHeight: '400px' }}
            title="HTML预览"
          />
          
          {!rendering && !error && !fileContent && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="text-center text-muted-foreground">
                <div className="text-lg mb-2">
                  <span className="hidden sm:inline">等待HTML页面渲染</span>
                  <span className="sm:hidden">等待渲染</span>
                </div>
                <Button onClick={() => renderHTML(fileContent)} variant="outline">
                  开始渲染
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 底部悬浮信息框 */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 group">
        <div className="
          opacity-0 group-hover:opacity-100 
          transition-all duration-200 
          bg-black/80 backdrop-blur-sm 
          text-white text-xs 
          px-3 py-2 rounded-lg 
          pointer-events-none
          min-w-max
        ">
          <div className="flex items-center gap-2 sm:gap-4">
            {shareInfo && (
              <span className="hidden md:inline"> {getFileNameWithoutExtension(shareInfo.filename)}</span>
            )}
            <span className="text-gray-300">|</span>
            <span className="hidden sm:inline">Powered by Quant (pengzhia@gmail.com)</span>
            <span className="sm:hidden">Quant</span>
          </div>
        </div>
      </div>

    </div>
  );
}