/**
 * 后端编译结果渲染器
 * 
 * 专注于渲染后端编译服务返回的结果
 * 使用统一的 FileServerAPI 接口
 */

import { FileServerAPI } from './api';
import { getDefaultModel } from './llmConfig';

export interface RenderOptions {
  container?: string;
  sandboxAttributes?: string[];
  timeout?: number;
  compileOptions?: {
    target?: string;
    format?: 'esm' | 'cjs' | 'iife';
    jsx?: 'automatic' | 'transform' | 'preserve';
    minify?: boolean;
    sourceMap?: boolean;
    outputType?: 'js' | 'html';
    enableAutoFix?: boolean;
    enableImportFix?: boolean;
  };
}

export class BackendRenderer {
  private api: FileServerAPI;
  private iframeElement: HTMLIFrameElement | null = null;
  private isReady = false;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor(api: FileServerAPI) {
    this.api = api;
    this.handleApiRequest = this.handleApiRequest.bind(this);
  }

  /**
   * 创建沙箱 iframe
   */
  async createSandboxIframe(
    container: HTMLElement, 
    options: RenderOptions = {}
  ): Promise<HTMLIFrameElement> {
    const iframe = document.createElement('iframe');

    // 设置沙箱属性 - 放开所有限制
    const defaultSandboxAttributes = [
      'allow-scripts',
      'allow-same-origin',
      'allow-modals',
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-top-navigation',
      'allow-top-navigation-by-user-activation',
      'allow-downloads',
      'allow-pointer-lock',
      'allow-presentation',
      'allow-orientation-lock',
      'allow-storage-access-by-user-activation'
    ];

    const sandboxAttributes = options.sandboxAttributes || defaultSandboxAttributes;
    iframe.sandbox.add(...sandboxAttributes);

    // 设置样式
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.background = 'transparent';

    container.appendChild(iframe);
    this.iframeElement = iframe;

    return iframe;
  }

  /**
   * 渲染 TSX 代码 (使用后端编译)
   */
  async renderTSX(
    tsxCode: string, 
    iframe: HTMLIFrameElement,
    libraries: string[] = [],
    options: RenderOptions = {}
  ): Promise<void> {
    if (!iframe.contentDocument) {
      throw new Error('Iframe not ready');
    }

    try {
      // 使用后端编译服务编译代码，优先生成HTML格式
      const compileResult = await this.api.compileCode(
        tsxCode, 
        libraries, 
        {
          ...options.compileOptions,
          outputType: 'html' // 优先使用HTML输出
        }
      );

      if (!compileResult.success) {
        throw new Error(compileResult.error || '编译失败');
      }

      // 渲染编译结果
      if (compileResult.data?.htmlContent) {
        // 如果后端返回了完整的 HTML，直接使用
        await this.renderHTML(compileResult.data.htmlContent, iframe);
      } else if (compileResult.data?.compiledCode) {
        // 如果只有 JS 代码，生成简单的 HTML 包装
        const htmlContent = this.generateSimpleHTML(compileResult.data.compiledCode);
        await this.renderHTML(htmlContent, iframe);
      } else {
        throw new Error('编译结果为空');
      }

      this.isReady = true;
    } catch (error) {
      console.error('Backend TSX rendering failed:', error);
      this.renderError(iframe, error instanceof Error ? error.message : '渲染失败');
      throw error;
    }
  }

  /**
   * 渲染 HTML 内容到 iframe
   */
  async renderHTML(htmlContent: string, iframe: HTMLIFrameElement): Promise<void> {
    if (!iframe.contentDocument) {
      throw new Error('Iframe not ready');
    }

    try {
      // 设置消息监听器
      if (this.messageHandler) {
        window.removeEventListener('message', this.messageHandler);
      }
      this.messageHandler = this.handleApiRequest;
      window.addEventListener('message', this.messageHandler);

      // 渲染 HTML 内容
      iframe.contentDocument.open();
      iframe.contentDocument.write(htmlContent);
      iframe.contentDocument.close();

      // 等待加载完成后注入 API
      iframe.onload = () => {
        try {
          const iframeWindow = iframe.contentWindow;
          if (!iframeWindow) return;

          // 注入 API 脚本
          const script = iframeWindow.document.createElement('script');
          script.textContent = this.getApiInjectionScript();
          iframeWindow.document.head.appendChild(script);
        } catch (error) {
          console.error('注入 API 脚本失败:', error);
        }
      };
    } catch (error) {
      console.error('HTML rendering failed:', error);
      throw new Error(`HTML渲染失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 生成简单的 HTML 包装器 (用于 JS 编译结果)
   */
  private generateSimpleHTML(compiledCode: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TSX Preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        html, body, #root { 
            margin: 0; 
            padding: 0; 
            width: 100%; 
            height: 100%; 
            overflow: auto; 
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="module">
        ${this.getApiInjectionScript()}
        
        try {
            ${compiledCode}
        } catch (error) {
            console.error('Component execution failed:', error);
            document.getElementById('root').innerHTML = \`
                <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem; background: #fef2f2; color: #dc2626;">
                    <div style="text-align: center; max-width: 500px;">
                        <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem;">渲染失败</div>
                        <div style="font-size: 1rem; line-height: 1.5; opacity: 0.8;">\${error.message}</div>
                    </div>
                </div>
            \`;
        }
    </script>
</body>
</html>`;
  }

  /**
   * 渲染错误信息
   */
  private renderError(iframe: HTMLIFrameElement, errorMessage: string): void {
    if (!iframe.contentDocument) return;

    const errorHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Render Error</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
    <div class="flex items-center justify-center min-h-screen p-8 bg-red-50">
        <div class="text-center max-w-md">
            <div class="text-red-600 text-6xl mb-4">⚠️</div>
            <h1 class="text-2xl font-bold text-red-800 mb-4">渲染失败</h1>
            <p class="text-red-600 mb-4">${errorMessage}</p>
            <p class="text-sm text-red-500">请检查您的TSX代码语法</p>
        </div>
    </div>
</body>
</html>`;

    iframe.contentDocument.open();
    iframe.contentDocument.write(errorHTML);
    iframe.contentDocument.close();
  }

  /**
   * 检查编译服务健康状态
   */
  async checkHealth(): Promise<boolean> {
    try {
      const health = await this.api.getCompileHealth();
      return health.success && health.status === 'ok';
    } catch (error) {
      console.error('Backend compiler health check failed:', error);
      return false;
    }
  }

  /**
   * 销毁渲染器
   */
  destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    if (this.iframeElement && this.iframeElement.parentNode) {
      this.iframeElement.parentNode.removeChild(this.iframeElement);
    }
    this.iframeElement = null;
    this.isReady = false;
  }

  /**
   * 检查渲染器是否就绪
   */
  isRendererReady(): boolean {
    return this.isReady;
  }

  /**
   * API 请求处理函数
   */
  private async handleApiRequest(event: MessageEvent) {
    if (!this.iframeElement) return;

    if (event.data.type === 'claude-complete-request') {
      try {
        const { requestId, prompt, options = {} } = event.data;
        const defaultModel = await getDefaultModel();
        const defaultOptions = {
          model: defaultModel,
          temperature: 0.8,
          max_tokens: 8000
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
        
        this.iframeElement?.contentWindow?.postMessage({
          type: 'claude-complete-response',
          requestId,
          result: result.data || ""
        }, '*');
        
      } catch (error) {
        this.iframeElement?.contentWindow?.postMessage({
          type: 'claude-complete-response',
          requestId: event.data.requestId,
          error: error instanceof Error ? error.message : "API调用失败"
        }, '*');
      }
    } else if (event.data.type === 'llm-complete-request') {
      try {
        const { requestId, messages, options = {} } = event.data;
        const defaultModel = await getDefaultModel();
        const defaultOptions = {
          model: defaultModel
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
        
        this.iframeElement?.contentWindow?.postMessage({
          type: 'llm-complete-response',
          requestId,
          result: result.data || ""
        }, '*');
        
      } catch (error) {
        this.iframeElement?.contentWindow?.postMessage({
          type: 'llm-complete-response',
          requestId: event.data.requestId,
          error: error instanceof Error ? error.message : "API调用失败"
        }, '*');
      }
    } else if (event.data.type === 'claude-stream-request') {
      try {
        const { requestId, prompt, options = {} } = event.data;
        const defaultModel = await getDefaultModel();
        const defaultOptions = {
          model: defaultModel,
          temperature: 0.8,
          max_tokens: 8000
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
                  this.iframeElement?.contentWindow?.postMessage({
                    type: 'claude-stream-response',
                    requestId,
                    chunk: data.content
                  }, '*');
                } else if (data.done) {
                  this.iframeElement?.contentWindow?.postMessage({
                    type: 'claude-stream-response',
                    requestId,
                    done: true
                  }, '*');
                  return;
                } else if (data.error) {
                  this.iframeElement?.contentWindow?.postMessage({
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
        this.iframeElement?.contentWindow?.postMessage({
          type: 'claude-stream-response',
          requestId: event.data.requestId,
          error: error instanceof Error ? error.message : "流式调用失败"
        }, '*');
      }
    } else if (event.data.type === 'llm-stream-request') {
      try {
        const { requestId, messages, options = {} } = event.data;
        const defaultModel = await getDefaultModel();
        const defaultOptions = {
          model: defaultModel
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
                  this.iframeElement?.contentWindow?.postMessage({
                    type: 'llm-stream-response',
                    requestId,
                    chunk: data.content
                  }, '*');
                } else if (data.done) {
                  this.iframeElement?.contentWindow?.postMessage({
                    type: 'llm-stream-response',
                    requestId,
                    done: true
                  }, '*');
                  return;
                } else if (data.error) {
                  this.iframeElement?.contentWindow?.postMessage({
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
        this.iframeElement?.contentWindow?.postMessage({
          type: 'llm-stream-response',
          requestId: event.data.requestId,
          error: error instanceof Error ? error.message : "流式调用失败"
        }, '*');
      }
    }
  }

  /**
   * 获取 API 注入脚本
   */
  private getApiInjectionScript(): string {
    return `
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
  }
}