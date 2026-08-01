import { useCallback, useEffect, useRef, useMemo } from 'react';
import { BackendRenderer } from '@/lib/backendRenderer';
import { HTMLRenderer } from '@/lib/htmlRenderer';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { useCodeState, useConversationState } from '@/contexts/CreatePageContext';
import { debounce } from 'lodash';

interface UseCodeRendererProps {
  previewContainerRef: React.RefObject<HTMLDivElement>;
}

export type RenderFailure = {
  kind: 'source' | 'dependency' | 'runtime' | 'infrastructure';
  message: string;
};

export type RenderOutcome = { ok: true } | { ok: false; failure: RenderFailure };

export function useCodeRenderer({ previewContainerRef }: UseCodeRendererProps) {
  const { code, setLastRendered, setHasPreviewContent, setIsRendering } = useCodeState();
  const { conversation } = useConversationState();
  const { config } = useAppStore();
  
  const apiRef = useRef<FileServerAPI>(new FileServerAPI(config));
  const backendRendererRef = useRef<BackendRenderer>(new BackendRenderer(apiRef.current));
  const htmlRendererRef = useRef<HTMLRenderer>(new HTMLRenderer());
  const lastRenderRequestRef = useRef<string>('');

  // 渲染函数 - 合并之前重复的逻辑
  const renderPreview = useCallback(async (
    codeToRender: string, 
    codeLang: 'tsx' | 'html' = 'tsx', 
    forceRender = false
  ): Promise<RenderOutcome> => {
    console.log('🎨 [渲染] 参数:', { codeLang, codeLength: codeToRender.length, forceRender });
    
    if (!previewContainerRef.current || !codeToRender.trim()) {
      return { ok: false, failure: { kind: 'infrastructure', message: '预览容器尚未准备好。' } };
    }

    // 生成渲染请求ID，防止竞态条件
    const renderRequestId = `${Date.now()}_${Math.random()}`;
    lastRenderRequestRef.current = renderRequestId;

    // 只有代码真正变化时才重新渲染
    if (!forceRender && codeToRender === code.lastRendered) {
      return { ok: true };
    }

    try {
      // 设置渲染状态
      setIsRendering(true);
      
      // 清理之前的内容
      previewContainerRef.current.innerHTML = '';
      
      // 检查是否为最新的渲染请求
      if (lastRenderRequestRef.current !== renderRequestId) {
        setIsRendering(false);
        return { ok: false, failure: { kind: 'infrastructure', message: '预览请求已被新的请求取代。' } };
      }

      // 添加小延迟确保状态同步，避免渲染时机问题
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 再次检查是否为最新的渲染请求
      if (lastRenderRequestRef.current !== renderRequestId) {
        setIsRendering(false);
        return { ok: false, failure: { kind: 'infrastructure', message: '预览请求已被新的请求取代。' } };
      }

      if (codeLang === 'html') {
        // 渲染 HTML
        console.log('📄 使用HTMLRenderer渲染HTML内容');
        const iframe = document.createElement('iframe');
        iframe.className = 'absolute inset-0 w-full h-full border-0';
        iframe.style.minHeight = '400px';
        iframe.title = 'HTML预览';
        previewContainerRef.current.appendChild(iframe);
        
        await htmlRendererRef.current.renderHTML(codeToRender, iframe);
      } else {
        // 渲染 TSX - 使用后端编译服务
        console.log('⚛️ 使用BackendRenderer渲染React内容');
        const iframe = await backendRendererRef.current.createSandboxIframe(previewContainerRef.current);
        await backendRendererRef.current.renderTSX(codeToRender, iframe);
      }
      
      // 最终检查是否为最新的渲染请求
      if (lastRenderRequestRef.current === renderRequestId) {
        setLastRendered(codeToRender);
        setHasPreviewContent(true);
        setIsRendering(false);
      }
      return { ok: true };
    } catch (error) {
      console.error(`${codeLang.toUpperCase()}渲染失败:`, error);
      
      // 检查是否为最新的渲染请求
      if (lastRenderRequestRef.current !== renderRequestId) {
        setIsRendering(false);
        return { ok: false, failure: { kind: 'infrastructure', message: '预览请求已被新的请求取代。' } };
      }
      
      if (previewContainerRef.current) {
        // 显示错误信息
        const errorContainer = document.createElement('div');
        errorContainer.className = 'h-full flex items-center justify-center text-muted-foreground bg-red-50';
        
        const errorContent = document.createElement('div');
        errorContent.className = 'text-center p-6';
        
        const lottieContainer = document.createElement('div');
        lottieContainer.style.width = '80px';
        lottieContainer.style.height = '80px';
        lottieContainer.style.margin = '0 auto 16px';
        
        const title = document.createElement('h3');
        title.className = 'text-lg font-medium text-red-800 mb-2';
        title.textContent = '渲染失败';
        
        const message = document.createElement('p');
        message.className = 'text-red-600 text-sm';
        message.textContent = error instanceof Error ? error.message : '未知错误';
        
        const hint = document.createElement('p');
        hint.className = 'text-red-500 text-xs mt-2';
        hint.textContent = `请检查您的${codeLang.toUpperCase()}代码语法`;
        
        errorContent.appendChild(lottieContainer);
        errorContent.appendChild(title);
        errorContent.appendChild(message);
        errorContent.appendChild(hint);
        errorContainer.appendChild(errorContent);
        
        previewContainerRef.current.innerHTML = '';
        previewContainerRef.current.appendChild(errorContainer);
        
        // 添加 Lottie 动画
        import('lottie-web').then((lottie) => {
          lottie.default.loadAnimation({
            container: lottieContainer,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '/lottie/fails.json'
          });
        }).catch(() => {
          lottieContainer.innerHTML = '<div class="text-red-600 text-4xl">⚠️</div>';
        });
      }
      
      // 错误情况下不设置 hasPreviewContent 为 true，避免状态不一致
      if (lastRenderRequestRef.current === renderRequestId) {
        setLastRendered(codeToRender);
        setHasPreviewContent(false); // 错误时不显示预览内容
        setIsRendering(false);
      }
      return {
        ok: false,
        failure: {
          kind: 'source',
          message: error instanceof Error ? error.message : '未知渲染错误',
        },
      };
    }
  }, [code.lastRendered, setLastRendered, setHasPreviewContent, setIsRendering, previewContainerRef]);

  // 防抖版本的渲染函数 - 优化延迟以减少渲染时机问题
  const debouncedRenderPreview = useMemo(
    () => debounce(renderPreview, 100), // 进一步减少延迟，提高响应速度
    [renderPreview]
  );
  
  // 立即渲染函数（用于模板选择）
  const immediateRenderPreview = useCallback((codeToRender: string, codeLang: 'tsx' | 'html' = 'tsx') => {
    void renderPreview(codeToRender, codeLang, true);
  }, [renderPreview]);

  // 确定是否需要渲染预览 - 统一的逻辑，避免重复判断
  const shouldRenderPreview = useMemo(() => {
    return code.current && 
           code.current.trim() !== '' && 
           code.current !== code.lastRendered && 
           !code.isStreaming && 
           !['generating', 'validating', 'repairing'].includes(conversation.stage);
  }, [code.current, code.lastRendered, code.isStreaming, conversation.stage]);

  // 唯一的自动渲染 effect - 合并之前的两个 useEffect
  useEffect(() => {
    if (shouldRenderPreview) {
      debouncedRenderPreview(code.current, code.language);
    }
  }, [shouldRenderPreview, code.current, code.language, debouncedRenderPreview]);

  // 更新API配置
  useEffect(() => {
    apiRef.current.updateConfig(config);
  }, [config]);

  // 组件卸载时清理渲染器
  useEffect(() => {
    const backendRenderer = backendRendererRef.current;
    const htmlRenderer = htmlRendererRef.current;
    
    return () => {
      // 取消所有进行中的渲染请求
      lastRenderRequestRef.current = '';
      
      // 清理渲染器
      backendRenderer.destroy();
      htmlRenderer.destroy();
    };
  }, []);

  // 手动刷新预览
  const refreshPreview = useCallback(() => {
    if (code.current) {
      void renderPreview(code.current, code.language, true);
    }
  }, [code.current, code.language, renderPreview]);

  return {
    renderPreview,
    immediateRenderPreview,
    refreshPreview,
    shouldRenderPreview,
  };
}
