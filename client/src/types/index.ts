export interface FileItem {
  filename: string;
  display_name: string;
  type: 'file' | 'directory' | 'parent_dir';
  size: number;
  upload_time?: string;
  modified_time?: string;
  mime_type?: string;
  // 新增统一文件管理字段
  is_public?: boolean;
  content_type?: string;
  tags?: string[];
  description?: string;
  notes?: string;
  created_by?: string;
  download_url?: string;
  locked?: boolean;  // 锁定状态
}

export interface FileResponse {
  success: boolean;
  error?: string;
  code?: string;
  data?: {
    files: FileItem[];
    current_path: string;
    total_count?: number;
    total?: number; // 新API使用
    filter_mode?: string; // 新增过滤模式
    content?: string; // 为文件内容获取添加
    filename?: string; // 为文件下载添加
    // 权限修改相关
    updated?: string[];
    failed?: Array<{filename: string; error: string}>;
    is_public?: boolean;
    // 批量删除相关
    deleted?: string[];
    // 批量锁定相关
    success_count?: number;
    locked?: boolean;
  };
}

export interface UploadProgress {
  percent: number;
  bytesUploaded: number;
  totalBytes: number;
  timeElapsed: number;
  speed: number;
}

export interface AppConfig {
  serverAddress: string;
  authToken: string;
  apiEndpoint: string;
}

export interface SortConfig {
  column: 'name' | 'type' | 'size' | 'created' | 'date' | 'permission';
  direction: 'asc' | 'desc';
}

export interface DragState {
  isDragging: boolean;
  draggedItems: string[];
  dragOverTarget: string | null;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
}