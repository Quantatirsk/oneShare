import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppConfig, FileItem, SortConfig, UploadProgress, DragState } from '@/types';

interface AppState {
  // Configuration
  config: AppConfig;
  setConfig: (config: Partial<AppConfig>) => void;
  
  // File management
  files: FileItem[];
  currentPath: string;
  currentCursorIndex: number;
  selectedFiles: Set<string>;
  sortConfig: SortConfig;
  filterMode: 'all' | 'public' | 'private';
  setFiles: (files: FileItem[]) => void;
  setCurrentPath: (path: string) => void;
  setCursorIndex: (index: number) => void;
  setSelectedFiles: (files: Set<string>) => void;
  toggleFileSelection: (filename: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  setSortConfig: (config: SortConfig) => void;
  setFilterMode: (mode: 'all' | 'public' | 'private') => void;
  
  // Upload progress
  uploadProgress: UploadProgress | null;
  setUploadProgress: (progress: UploadProgress | null) => void;
  
  // Drag and drop
  dragState: DragState;
  setDragState: (state: Partial<DragState>) => void;
  
  // UI state
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  
  // View mode
  viewMode: 'list' | 'grid';
  setViewMode: (mode: 'list' | 'grid') => void;
  
}

// 从环境变量读取服务器配置
const getServerAddress = () => {
  const port = import.meta.env.VITE_FILE_SERVER_PORT || '8000';
  
  // 检查是否为开发环境
  const isDevelopment = import.meta.env.DEV || import.meta.env.NODE_ENV === 'development';
  
  if (isDevelopment) {
    // 开发环境：使用环境变量配置的地址
    return `http://localhost:${port}`;
  } else {
    // 生产环境：使用当前页面的 origin + /api
    return window.location.origin;
  }
};

// 从环境变量读取API端点
const getApiEndpoint = () => {
  return import.meta.env.VITE_API_ENDPOINT || '/';
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Configuration
      config: {
        serverAddress: getServerAddress(),
        authToken: '',
        apiEndpoint: getApiEndpoint(),
      },
      setConfig: (newConfig: Partial<AppConfig>) =>
        set((state) => ({ config: { ...state.config, ...newConfig } })),
      
      // File management
      files: [],
      currentPath: '',
      currentCursorIndex: -1,
      selectedFiles: new Set<string>(),
      sortConfig: { column: 'date', direction: 'desc' },
      filterMode: 'all',
      setFiles: (files: FileItem[]) => set({ files }),
      setCurrentPath: (path: string) => set({ currentPath: path }),
      setCursorIndex: (index: number) => set({ currentCursorIndex: index }),
      setSelectedFiles: (files: Set<string>) => set({ selectedFiles: files }),
      toggleFileSelection: (filename: string) => set((state) => {
        const newSelection = new Set(state.selectedFiles);
        if (newSelection.has(filename)) {
          newSelection.delete(filename);
        } else {
          newSelection.add(filename);
        }
        return { selectedFiles: newSelection };
      }),
      clearSelection: () => set({ selectedFiles: new Set<string>() }),
      selectAll: () => set((state) => {
        const allFiles = new Set(
          state.files
            .filter(file => file.type !== 'parent_dir')
            .map(file => file.filename)
        );
        return { selectedFiles: allFiles };
      }),
      setSortConfig: (config: SortConfig) => set({ sortConfig: config }),
      setFilterMode: (mode: 'all' | 'public' | 'private') => set({ filterMode: mode, selectedFiles: new Set<string>() }),
      
      // Upload progress
      uploadProgress: null,
      setUploadProgress: (progress: UploadProgress | null) => set({ uploadProgress: progress }),
      
      // Drag and drop
      dragState: {
        isDragging: false,
        draggedItems: [],
        dragOverTarget: null,
      },
      setDragState: (newState: Partial<DragState>) =>
        set((state) => ({ dragState: { ...state.dragState, ...newState } })),
      
      // UI state
      isLoading: false,
      setLoading: (loading: boolean) => set({ isLoading: loading }),
      
      // View mode
      viewMode: 'list',
      setViewMode: (mode: 'list' | 'grid') => set({ viewMode: mode }),
      
    }),
    {
      name: 'file-server-config',
      partialize: (state) => ({ config: state.config, viewMode: state.viewMode }),
    }
  )
);