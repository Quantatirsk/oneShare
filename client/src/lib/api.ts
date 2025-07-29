import type { FileResponse, AppConfig } from '@/types';

export class FileServerAPI {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  updateConfig(config: AppConfig) {
    this.config = config;
  }

  // ============= 统一文件管理API =============
  
  async listUnifiedFiles(currentPath?: string, filterMode: 'all' | 'public' | 'private' = 'all'): Promise<FileResponse> {
    const params = new URLSearchParams();
    if (currentPath !== undefined && currentPath !== '') {
      params.append('current_path', currentPath);
    }
    params.append('filter_mode', filterMode);
    
    const url = `${this.config.serverAddress}/api/files`;
    const fullUrl = params.toString() ? `${url}?${params.toString()}` : url;
    
    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }
    
    const response = await fetch(fullUrl, { headers });
    return response.json();
  }

  async uploadUnifiedFile(
    file: File, 
    filename: string, 
    isPublic: boolean = false,
    tags: string[] = [],
    description: string = "",
    notes: string = ""
  ): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', filename);
    formData.append('is_public', String(isPublic));
    formData.append('tags', JSON.stringify(tags));
    formData.append('description', description);
    formData.append('notes', notes);

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return response.json();
  }

  async deleteUnifiedFile(filename: string): Promise<FileResponse> {
    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers,
    });
    return response.json();
  }

  async changeFilePermission(filename: string, isPublic: boolean): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('is_public', String(isPublic));

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/${encodeURIComponent(filename)}/permission`, {
      method: 'PUT',
      headers,
      body: formData,
    });
    return response.json();
  }



  // ============= 分片上传API =============
  
  async uploadFileChunk(
    file: Blob,
    filename: string,
    chunkIndex: number,
    totalChunks?: number,
    chunkHash?: string
  ): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', filename);
    formData.append('chunk_index', String(chunkIndex));
    
    if (totalChunks !== undefined) {
      formData.append('total_chunks', String(totalChunks));
    }
    
    if (chunkHash) {
      formData.append('chunk_hash', chunkHash);
    }

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/chunk/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return response.json();
  }

  async completeFileChunks(
    filename: string,
    totalChunks: number,
    isPublic: boolean = false,
    tags: string[] = [],
    description: string = "",
    notes: string = ""
  ): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('filename', filename);
    formData.append('total_chunks', String(totalChunks));
    formData.append('is_public', String(isPublic));
    formData.append('tags', JSON.stringify(tags));
    formData.append('description', description);
    formData.append('notes', notes);

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/chunk/complete`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return response.json();
  }

  async getChunkStatus(filename: string): Promise<FileResponse> {
    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/chunk/status/${encodeURIComponent(filename)}`, {
      method: 'GET',
      headers,
    });
    return response.json();
  }

  async uploadFileWithChunks(
    file: File,
    filename: string,
    chunkSize: number = 2 * 1024 * 1024, // 2MB 默认分片大小
    isPublic: boolean = false,
    tags: string[] = [],
    description: string = "",
    notes: string = "",
    onProgress?: (progress: number, uploadedChunks: number, totalChunks: number) => void
  ): Promise<FileResponse> {
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / chunkSize);
    
    // 计算文件哈希（如果需要完整性验证）
    const calculateMD5 = async (blob: Blob): Promise<string> => {
      const arrayBuffer = await blob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('MD5', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    try {
      // 上传所有分片
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, totalSize);
        const chunk = file.slice(start, end);
        
        // 计算分片哈希（可选）
        let chunkHash: string | undefined;
        try {
          chunkHash = await calculateMD5(chunk);
        } catch (error) {
          console.warn('无法计算分片哈希:', error);
        }
        
        const result = await this.uploadFileChunk(
          chunk, 
          filename, 
          i, 
          totalChunks, 
          chunkHash
        );
        
        if (!result.success) {
          throw new Error(result.error || `分片 ${i} 上传失败`);
        }
        
        // 回调进度
        if (onProgress) {
          const progress = ((i + 1) / totalChunks) * 100;
          onProgress(progress, i + 1, totalChunks);
        }
      }
      
      // 合并分片
      const completeResult = await this.completeFileChunks(
        filename, 
        totalChunks, 
        isPublic, 
        tags, 
        description, 
        notes
      );
      
      return completeResult;
      
    } catch (error) {
      throw new Error(`分片上传失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async batchChangePermission(filenames: string[], isPublic: boolean): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('filenames', JSON.stringify(filenames));
    formData.append('is_public', String(isPublic));

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/batch/permission`, {
      method: 'PUT',
      headers,
      body: formData,
    });
    return response.json();
  }

  // 统一重命名文件API
  async renameUnifiedFile(oldPath: string, newPath: string): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('old_path', oldPath);
    formData.append('new_path', newPath);

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/rename`, {
      method: 'PUT',
      headers,
      body: formData,
    });
    return response.json();
  }

  // 统一创建目录API
  async createUnifiedDirectory(dirPath: string): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('dir_path', dirPath);

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/directories`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return response.json();
  }

  // 统一移动文件API
  async moveUnifiedFiles(sourceFiles: string[], targetDir: string): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('source_files', JSON.stringify(sourceFiles));
    formData.append('target_dir', targetDir);

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/move`, {
      method: 'PUT',
      headers,
      body: formData,
    });
    return response.json();
  }

  // 统一批量删除API
  async batchDeleteUnifiedFiles(filenames: string[]): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('filenames', JSON.stringify(filenames));

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/batch/delete`, {
      method: 'DELETE',
      headers,
      body: formData,
    });
    return response.json();
  }

  // ============= 目录权限管理API =============
  
  async getDirectoryPermission(dirPath: string): Promise<{
    success: boolean;
    data?: {
      path: string;
      is_public?: boolean;
      has_permission_setting: boolean;
      file_count: number;
      directory_count: number;
      total_items: number;
    };
    error?: string;
  }> {
    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/directories/${encodeURIComponent(dirPath)}/permission`, {
      method: 'GET',
      headers,
    });
    return response.json();
  }

  async setDirectoryPermission(
    dirPath: string, 
    isPublic: boolean, 
    applyToChildren: boolean = false
  ): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const formData = new FormData();
    formData.append('is_public', String(isPublic));
    formData.append('apply_to_children', String(applyToChildren));

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/directories/${encodeURIComponent(dirPath)}/permission`, {
      method: 'PUT',
      headers,
      body: formData,
    });
    return response.json();
  }

  // ============= 文件保存和内容更新 =============
  
  async saveFileContent(fileName: string, content: string): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('content', content);

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    // 使用已存在的文件内容更新接口
    const response = await fetch(`${this.config.serverAddress}/api/files/${encodeURIComponent(fileName)}/content`, {
      method: 'PUT',
      headers,
      body: formData,
    });
    return response.json();
  }

  async updateFileContent(filePath: string, content: string): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('content', content);

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/${encodeURIComponent(filePath)}/content`, {
      method: 'PUT',
      headers,
      body: formData,
    });
    return response.json();
  }

  // ============= 文件下载和内容获取 =============
  
  buildUnifiedDirectUrl(fileName: string): string {
    const server = this.config.serverAddress.replace(/\/$/, '');
    const normalizedFileName = fileName.startsWith('/') ? fileName.substring(1) : fileName;
    return `${server}/api/files/${normalizedFileName}`;
  }

  async downloadFileContent(fileName: string): Promise<string> {
    const directUrl = this.buildUnifiedDirectUrl(fileName);
    const urlWithTimestamp = `${directUrl}?t=${Date.now()}`;
    
    const headers: Record<string, string> = {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }
    
    const response = await fetch(urlWithTimestamp, {
      cache: 'no-cache',
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  async getFileContent(fileName: string): Promise<FileResponse> {
    try {
      const content = await this.downloadFileContent(fileName);
      return {
        success: true,
        data: { 
          files: [],
          current_path: '',
          total_count: 0,
          content 
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取文件内容失败',
      };
    }
  }





  // ============= 批量操作API =============
  
  async batchDownload(filenames: string[]): Promise<Blob> {
    if (filenames.length === 1) {
      // 单个文件直接下载
      const directUrl = this.buildUnifiedDirectUrl(filenames[0]);
      const downloadUrl = `${directUrl}${directUrl.includes('?') ? '&' : '?'}download=1`;
      
      const headers: Record<string, string> = {};
      if (this.config.authToken) {
        headers['Authorization'] = this.config.authToken;
      }
      
      const response = await fetch(downloadUrl, { headers });
      if (!response.ok) {
        throw new Error(`单文件下载失败: ${response.statusText}`);
      }
      return response.blob();
    }

    // 多个文件需要使用批量下载API（如果后端支持）
    const formData = new FormData();
    formData.append('filenames', JSON.stringify(filenames));

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/batch/download`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`批量下载失败: ${response.statusText}`);
    }
    
    return response.blob();
  }

  // ============= 分享功能API =============
  
  async createShare(filename: string, isPublic: boolean = false): Promise<{
    success: boolean;
    share_id: string;
    share_url: string;
    filename: string;
    is_public: boolean;
    created_at: string;
  }> {
    const formData = new FormData();
    formData.append('filename', filename);
    formData.append('is_public', String(isPublic));
    
    // 构建请求头，只有私有文件才需要认证
    const headers: Record<string, string> = {};
    if (!isPublic && this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }
    
    const response = await fetch(`${this.config.serverAddress}/api/share`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    return response.json();
  }

  async getSharedFile(shareId: string): Promise<{
    success: boolean;
    filename: string;
    content: string;
    is_public: boolean;
    created_at: string;
  }> {
    const response = await fetch(`${this.config.serverAddress}/api/s/${shareId}`);
    return response.json();
  }

  async getShareInfo(shareId: string): Promise<{
    success: boolean;
    share_id: string;
    filename: string;
    is_public: boolean;
    created_at: string;
  }> {
    const response = await fetch(`${this.config.serverAddress}/api/share/info/${shareId}`);
    return response.json();
  }


  // ============= 分片上传API =============
  
  async uploadChunk(
    file: Blob, 
    filename: string, 
    chunkIndex: number,
    totalChunks?: number,
    chunkHash?: string
  ): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', filename);
    formData.append('chunk_index', String(chunkIndex));
    
    if (totalChunks !== undefined) {
      formData.append('total_chunks', String(totalChunks));
    }
    
    if (chunkHash) {
      formData.append('chunk_hash', chunkHash);
    }

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/upload/chunk`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return response.json();
  }

  async completeChunkedUpload(filename: string, totalChunks: number): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('filename', filename);
    formData.append('total_chunks', String(totalChunks));

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/upload/complete`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return response.json();
  }

  // 计算文件分片的MD5哈希值（可选，用于验证）
  async calculateChunkHash(chunk: Blob): Promise<string> {
    const arrayBuffer = await chunk.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('MD5', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 分片上传完整流程的便捷方法
  async uploadFileInChunks(
    file: File,
    filename: string,
    chunkSize: number = 5 * 1024 * 1024, // 默认5MB分片
    onProgress?: (progress: number, uploadedChunks: number, totalChunks: number) => void,
    enableHashVerification: boolean = false
  ): Promise<FileResponse> {
    try {
      const fileSize = file.size;
      const totalChunks = Math.ceil(fileSize / chunkSize);
      
      if (totalChunks === 1) {
        // 单个分片直接使用普通上传
        return this.uploadUnifiedFile(file, filename);
      }

      let uploadedChunks = 0;

      // 逐个上传分片
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunk = file.slice(start, end);

        let chunkHash: string | undefined;
        if (enableHashVerification) {
          chunkHash = await this.calculateChunkHash(chunk);
        }

        const result = await this.uploadChunk(
          chunk,
          filename,
          chunkIndex,
          totalChunks,
          chunkHash
        );

        if (!result.success) {
          return result;
        }

        uploadedChunks++;
        
        if (onProgress) {
          const progress = (uploadedChunks / totalChunks) * 100;
          onProgress(progress, uploadedChunks, totalChunks);
        }
      }

      // 完成分片上传
      return this.completeChunkedUpload(filename, totalChunks);

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '分片上传失败',
      };
    }
  }

  // ============= URL下载API =============
  
  async downloadFromUrl(
    url: string,
    filename?: string,
    isPublic: boolean = false,
    tags: string[] = [],
    description: string = "",
    notes: string = ""
  ): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('url', url);
    if (filename) {
      formData.append('filename', filename);
    }
    formData.append('is_public', String(isPublic));
    formData.append('tags', JSON.stringify(tags));
    formData.append('description', description);
    formData.append('notes', notes);

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/url/download`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return response.json();
  }

  async processUrlContent(
    url: string,
    isPublic: boolean = false,
    tags: string[] = [],
    description: string = "",
    notes: string = ""
  ): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('url', url);
    formData.append('is_public', String(isPublic));
    formData.append('tags', JSON.stringify(tags));
    formData.append('description', description);
    formData.append('notes', notes);

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/url/process`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return response.json();
  }

  // ============= 文件和目录锁定管理API =============
  
  async setFileLock(filePath: string, locked: boolean): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('locked', String(locked));

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/${encodeURIComponent(filePath)}/lock`, {
      method: 'PUT',
      headers,
      body: formData,
    });
    return response.json();
  }

  async setDirectoryLock(
    dirPath: string, 
    locked: boolean, 
    applyToChildren: boolean = false
  ): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('locked', String(locked));
    formData.append('apply_to_children', String(applyToChildren));

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/directories/${encodeURIComponent(dirPath)}/lock`, {
      method: 'PUT',
      headers,
      body: formData,
    });
    return response.json();
  }

  async batchSetLock(filePaths: string[], locked: boolean): Promise<FileResponse> {
    const formData = new FormData();
    formData.append('file_paths', JSON.stringify(filePaths));
    formData.append('locked', String(locked));

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = this.config.authToken;
    }

    const response = await fetch(`${this.config.serverAddress}/api/files/batch/lock`, {
      method: 'PUT',
      headers,
      body: formData,
    });
    return response.json();
  }

  // ============= TSX编译服务API =============

  async compileCode(
    code: string, 
    libraries: string[] = [], 
    options: {
      target?: string;
      format?: 'esm' | 'cjs' | 'iife';
      jsx?: 'automatic' | 'transform' | 'preserve';
      minify?: boolean;
      sourceMap?: boolean;
      outputType?: 'js' | 'html';
      enableAutoFix?: boolean;
      enableImportFix?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    data?: {
      compiledCode?: string;
      htmlContent?: string;
      sourceMap?: string;
      dependencies?: string[];
      assets?: string[];
      outputType?: 'js' | 'html';
      hash?: string;
      fixedCode?: string;
      autoFix?: {
        applied: boolean;
        fixesCount?: number;
        fixes?: Array<{
          type: string;
          description: string;
          location?: { line: number; column: number; };
        }>;
        stages?: Array<{
          stage: string;
          success: boolean;
          fixesApplied?: number;
          message: string;
        }>;
        warnings?: Array<{
          type: string;
          message: string;
        }>;
      };
    };
    cached?: boolean;
    compile_time?: number;
    cache_key?: string;
    error?: string;
    warnings?: string[];
  }> {
    try {
      // 设置默认的编译选项
      const defaultOptions = {
        minify: false,
        enableAutoFix: true,
        enableImportFix: false,
        ...options
      };

      const formData = new FormData();
      formData.append('code', code);
      formData.append('libraries', JSON.stringify(libraries));
      formData.append('options', JSON.stringify(defaultOptions));

      const headers: Record<string, string> = {};
      if (this.config.authToken) {
        headers['Authorization'] = this.config.authToken;
      }

      const response = await fetch(`${this.config.serverAddress}/api/compile/`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`编译请求失败 (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络请求失败'
      };
    }
  }

  async validateCode(code: string): Promise<{
    success: boolean;
    valid?: boolean;
    suggestions?: string[];
    error?: string;
  }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.authToken) {
        headers['Authorization'] = this.config.authToken;
      }

      const response = await fetch(`${this.config.serverAddress}/api/compile/validate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error(`验证请求失败: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: true,
        valid: result.valid,
        suggestions: result.suggestions,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '验证失败'
      };
    }
  }

  async getCompileHealth(): Promise<{
    success: boolean;
    status?: string;
    features?: string[];
    version?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.config.serverAddress}/api/compile/health`);
      
      if (!response.ok) {
        throw new Error(`健康检查失败: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: true,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '健康检查失败'
      };
    }
  }

  async getCompileStats(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.config.serverAddress}/api/compile/stats`);
      
      if (!response.ok) {
        throw new Error(`获取统计失败: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取统计失败'
      };
    }
  }

  async clearCompileCache(): Promise<{
    success: boolean;
    message?: string;
    cleared_entries?: number;
    error?: string;
  }> {
    try {
      const headers: Record<string, string> = {};
      if (this.config.authToken) {
        headers['Authorization'] = this.config.authToken;
      }

      const response = await fetch(`${this.config.serverAddress}/api/compile/cache`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        throw new Error(`清理缓存失败: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '清理缓存失败'
      };
    }
  }

}