import { useCallback, useEffect, useRef, useMemo } from 'react';
import { BackendRenderer } from '@/lib/backendRenderer';
import { HTMLRenderer } from '@/lib/htmlRenderer';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { CreatePageState } from './useCreatePageState';
import { debounce } from 'lodash';

interface UseCodePreviewProps {
  state: CreatePageState;
  actions: any;
  previewContainerRef: React.RefObject<HTMLDivElement>;
}

export function useCodePreview({
  state,
  actions,
  previewContainerRef
}: UseCodePreviewProps) {
  const { config } = useAppStore();
  const apiRef = useRef<FileServerAPI>(new FileServerAPI(config));
  const backendRendererRef = useRef<BackendRenderer>(new BackendRenderer(apiRef.current));
  const htmlRendererRef = useRef<HTMLRenderer>(new HTMLRenderer());

  const renderPreview = useCallback(async (code: string, codeLang: 'tsx' | 'html' = 'tsx', forceRender = false) => {
    if (!previewContainerRef.current || !code.trim()) {
      return;
    }

    // 只有代码真正变化时才重新渲染
    if (!forceRender && code === state.code.lastRendered) {
      return;
    }

    try {
      // 清理之前的内容（包括错误信息和提示文本）
      previewContainerRef.current.innerHTML = '';
      
      if (codeLang === 'html') {
        // 创建新的iframe并渲染HTML
        const iframe = document.createElement('iframe');
        iframe.className = 'absolute inset-0 w-full h-full border-0';
        iframe.style.minHeight = '400px';
        iframe.title = 'HTML预览';
        previewContainerRef.current.appendChild(iframe);
        
        await htmlRendererRef.current.renderHTML(code, iframe);
      } else {
        // 创建新的iframe并渲染TSX - 使用后端编译服务
        const iframe = await backendRendererRef.current.createSandboxIframe(previewContainerRef.current);
        await backendRendererRef.current.renderTSX(code, iframe);
      }
      
      // 记录已渲染的代码
      actions.setLastRendered(code);
      actions.setPreviewHasContent(true);
    } catch (error) {
      console.error(`${codeLang.toUpperCase()}渲染失败:`, error);
      
      // 显示错误信息
      if (previewContainerRef.current) {
        // 创建错误显示容器
        const errorContainer = document.createElement('div');
        errorContainer.className = 'h-full flex items-center justify-center text-muted-foreground bg-red-50';
        
        const errorContent = document.createElement('div');
        errorContent.className = 'text-center space-y-4';
        
        // Lottie 动画容器
        const lottieContainer = document.createElement('div');
        lottieContainer.className = 'w-16 h-16 mx-auto mb-4';
        
        const title = document.createElement('h3');
        title.className = 'text-lg font-medium text-red-600';
        title.textContent = '渲染失败';
        
        const message = document.createElement('p');
        message.className = 'text-sm text-muted-foreground';
        message.textContent = error instanceof Error ? error.message : '代码渲染出现错误';
        
        const hint = document.createElement('p');
        hint.className = 'text-xs text-muted-foreground/70 mt-2';
        hint.textContent = '请检查代码语法是否正确';
        
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
            path: '/lottie/error.json'
          });
        }).catch(() => {
          // Fallback icon if Lottie fails
          lottieContainer.innerHTML = '⚠️';
          lottieContainer.className = 'text-4xl mx-auto mb-4';
        });
      }
    }
  }, [state.code.lastRendered, actions, previewContainerRef]);

  // 防抖版本的渲染函数
  const debouncedRenderPreview = useMemo(
    () => debounce(renderPreview, 500),
    [renderPreview]
  );

  // 当代码变化时，自动更新预览（只在需要时）
  const shouldRenderPreview = state.code.current && 
    state.code.current.trim() !== '' && 
    state.code.current !== state.code.lastRendered && 
    !state.code.isStreaming && 
    state.conversation.stage !== 'generating';

  useEffect(() => {
    if (shouldRenderPreview) {
      debouncedRenderPreview(state.code.current, state.code.language);
    }
  }, [shouldRenderPreview, state.code.current, state.code.language, debouncedRenderPreview]);

  // 当代码变化且还没有渲染过当前代码时，立即渲染（预览固定显示）
  useEffect(() => {
    if (state.code.current && 
        state.code.current.trim() !== '' && 
        state.code.current !== state.code.lastRendered && 
        !state.code.isStreaming && 
        state.conversation.stage !== 'generating') {
      renderPreview(state.code.current, state.code.language);
    }
  }, [
    state.code.current, 
    state.code.lastRendered, 
    state.code.isStreaming, 
    state.conversation.stage, 
    state.code.language, 
    renderPreview
  ]);

  // 更新API配置
  useEffect(() => {
    apiRef.current.updateConfig(config);
  }, [config]);

  // 组件卸载时清理渲染器
  useEffect(() => {
    const backendRenderer = backendRendererRef.current;
    const htmlRenderer = htmlRendererRef.current;
    
    return () => {
      backendRenderer.destroy();
      htmlRenderer.destroy();
    };
  }, []);

  return {
    renderPreview,
    debouncedRenderPreview,
    backendRendererRef,
    htmlRendererRef
  };
}