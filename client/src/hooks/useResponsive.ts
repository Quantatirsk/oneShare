import { useEffect } from 'react';
import { useUIState } from '@/contexts/CreatePageContext';

export function useResponsive() {
  const { ui, setIsMobile } = useUIState();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // 初始检查
    checkMobile();
    
    // 添加监听器
    window.addEventListener('resize', checkMobile);
    
    // 清理函数
    return () => window.removeEventListener('resize', checkMobile);
  }, [setIsMobile]);

  return ui.isMobile;
}