// 平台检测和快捷键工具
export const isMac = typeof navigator !== 'undefined' && 
  (navigator.platform.toUpperCase().indexOf('MAC') >= 0 || 
   navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);

// 检测移动设备
export const isMobile = typeof navigator !== 'undefined' && 
  (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
   ('ontouchstart' in window) ||
   (navigator.maxTouchPoints > 0));

// 检测触摸设备
export const isTouchDevice = typeof navigator !== 'undefined' && 
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export const getModifierKey = () => isMac ? 'Cmd' : 'Ctrl';

export const getModifierKeySymbol = () => isMac ? '⌘' : 'Ctrl';

export const getShortcutText = (key: string) => `${getModifierKeySymbol()}+${key}`;

// 检测快捷键事件
export const isModifierPressed = (e: KeyboardEvent | MouseEvent) => {
  return isMac ? (e as KeyboardEvent).metaKey : (e as KeyboardEvent).ctrlKey;
};