import { fetchLLMConfig } from './llmWrapper';

export class HTMLRenderer {
  private iframeRef: HTMLIFrameElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor() {
    this.handleClaudeRequest = this.handleClaudeRequest.bind(this);
  }

  // Claude API 处理函数
  private async handleClaudeRequest(event: MessageEvent) {
    if (!this.iframeRef) return;

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
        this.iframeRef?.contentWindow?.postMessage({
          type: 'claude-complete-response',
          requestId,
          result: result.data || ""
        }, '*');
        
      } catch (error) {
        // 发送错误回iframe
        this.iframeRef?.contentWindow?.postMessage({
          type: 'claude-complete-response',
          requestId: event.data.requestId,
          error: error instanceof Error ? error.message : "API调用失败"
        }, '*');
      }
    } else if (event.data.type === 'llm-complete-request') {
      try {
        const { requestId, messages, options = {} } = event.data;
        const llmConfig = await fetchLLMConfig();
        const defaultOptions = {
          model: llmConfig?.default_model || "google/gemini-2.5-flash-lite",
          temperature: llmConfig?.temperature || 0.8,
          max_tokens: llmConfig?.max_tokens || 8000
        };
        const config = { ...defaultOptions, ...options };
        
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
        this.iframeRef?.contentWindow?.postMessage({
          type: 'llm-complete-response',
          requestId,
          result: result.data || ""
        }, '*');
        
      } catch (error) {
        // 发送错误回iframe
        this.iframeRef?.contentWindow?.postMessage({
          type: 'llm-complete-response',
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
                  this.iframeRef?.contentWindow?.postMessage({
                    type: 'claude-stream-response',
                    requestId,
                    chunk: data.content
                  }, '*');
                } else if (data.done) {
                  // 发送完成信号回iframe
                  this.iframeRef?.contentWindow?.postMessage({
                    type: 'claude-stream-response',
                    requestId,
                    done: true
                  }, '*');
                  return;
                } else if (data.error) {
                  // 发送错误回iframe
                  this.iframeRef?.contentWindow?.postMessage({
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
        this.iframeRef?.contentWindow?.postMessage({
          type: 'claude-stream-response',
          requestId: event.data.requestId,
          error: error instanceof Error ? error.message : "流式调用失败"
        }, '*');
      }
    } else if (event.data.type === 'llm-stream-request') {
      try {
        const { requestId, messages, options = {} } = event.data;
        const llmConfig = await fetchLLMConfig();
        const defaultOptions = {
          model: llmConfig?.default_model || "google/gemini-2.5-flash-lite",
          temperature: llmConfig?.temperature || 0.8,
          max_tokens: llmConfig?.max_tokens || 8000
        };
        const config = { ...defaultOptions, ...options };
        
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
                  this.iframeRef?.contentWindow?.postMessage({
                    type: 'llm-stream-response',
                    requestId,
                    chunk: data.content
                  }, '*');
                } else if (data.done) {
                  // 发送完成信号回iframe
                  this.iframeRef?.contentWindow?.postMessage({
                    type: 'llm-stream-response',
                    requestId,
                    done: true
                  }, '*');
                  return;
                } else if (data.error) {
                  // 发送错误回iframe
                  this.iframeRef?.contentWindow?.postMessage({
                    type: 'llm-stream-response',
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
        this.iframeRef?.contentWindow?.postMessage({
          type: 'llm-stream-response',
          requestId: event.data.requestId,
          error: error instanceof Error ? error.message : "流式调用失败"
        }, '*');
      }
    }
  }

  async renderHTML(htmlContent: string, iframe: HTMLIFrameElement): Promise<void> {
    if (!iframe) {
      throw new Error('容器未准备就绪');
    }

    this.iframeRef = iframe;

    // 设置消息监听器
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
    }
    this.messageHandler = this.handleClaudeRequest;
    window.addEventListener('message', this.messageHandler);

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
    
    // 注入滚动条隐藏CSS到HTML内容中
    const scrollbarHideCSS = `
      <style>
        /* 隐藏滚动条但保留滚动功能 */
        html, body {
          -ms-overflow-style: none !important;  /* IE and Edge */
          scrollbar-width: none !important;     /* Firefox */
        }
        
        html::-webkit-scrollbar, body::-webkit-scrollbar {
          display: none !important;  /* Chrome, Safari and Opera */
        }
        
        /* 也隐藏所有元素的滚动条 */
        *::-webkit-scrollbar {
          display: none !important;
        }
        
        * {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
        }
      </style>
    `;
    
    // 将CSS注入到HTML头部
    let modifiedHTML = htmlContent;
    if (htmlContent.includes('</head>')) {
      modifiedHTML = htmlContent.replace('</head>', scrollbarHideCSS + '</head>');
    } else if (htmlContent.includes('<head>')) {
      modifiedHTML = htmlContent.replace('<head>', '<head>' + scrollbarHideCSS);
    } else {
      // 如果没有head标签，在开头添加
      modifiedHTML = scrollbarHideCSS + htmlContent;
    }
    
    iframe.srcdoc = modifiedHTML;

    // 等待iframe加载完成后注入Claude API桥接
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
  }

  destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    this.iframeRef = null;
  }
}