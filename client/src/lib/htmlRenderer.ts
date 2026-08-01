import { respondToIframeAiRequest } from './iframeAiBridge';

export class HTMLRenderer {
  private iframeRef: HTMLIFrameElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor() {
    this.handleClaudeRequest = this.handleClaudeRequest.bind(this);
  }

  // Claude API 处理函数
  private async handleClaudeRequest(event: MessageEvent) {
    if (!this.iframeRef) return;

    await respondToIframeAiRequest(event.data, (payload) => {
      this.iframeRef?.contentWindow?.postMessage(payload, '*');
    });
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
