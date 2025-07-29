import { FileServerAPI } from '@/lib/api';
import { FileItem } from '@/types';
import { useAppStore } from '@/stores/appStore';

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

interface RetryConfig {
  maxAttempts: number;
  delay: number;
  backoff: number;
}

export class FileService {
  private api: FileServerAPI;
  private pendingRequests = new Map<string, PendingRequest>();
  private retryConfig: RetryConfig = {
    maxAttempts: 3,
    delay: 1000,
    backoff: 2
  };

  constructor(api: FileServerAPI) {
    this.api = api;
  }

  /**
   * 生成请求唯一标识
   */
  private generateRequestKey(method: string, params: any[]): string {
    return `${method}:${JSON.stringify(params)}`;
  }

  /**
   * 请求去重装饰器
   */
  private async dedupRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // 检查是否有相同的请求正在进行
    const existing = this.pendingRequests.get(key);
    if (existing) {
      // 清理过期的请求（超过30秒）
      if (Date.now() - existing.timestamp > 30000) {
        this.pendingRequests.delete(key);
      } else {
        return existing.promise;
      }
    }

    // 执行新请求
    const promise = requestFn();
    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now()
    });

    try {
      const result = await promise;
      this.pendingRequests.delete(key);
      return result;
    } catch (error) {
      this.pendingRequests.delete(key);
      throw error;
    }
  }

  /**
   * 带重试的请求执行
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const { maxAttempts, delay, backoff } = { ...this.retryConfig, ...config };
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as Error;
        
        // 如果是最后一次尝试，直接抛出错误
        if (attempt === maxAttempts) {
          throw lastError;
        }

        // 计算延迟时间
        const waitTime = delay * Math.pow(backoff, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw lastError!;
  }

  /**
   * 乐观更新文件列表
   */
  public async refreshFileList(skipLoading = false, targetPath?: string): Promise<void> {
    const key = this.generateRequestKey('listFiles', [targetPath]);
    const store = useAppStore.getState();
    
    return this.dedupRequest(key, async () => {
      return this.executeWithRetry(async () => {
        if (!skipLoading) {
          store.setLoading(true);
        }

        try {
          const response = await this.api.listUnifiedFiles(targetPath, 'all');
          if (response.success && response.data) {
            // 对文件列表进行排序
            const sortedFiles = this.sortFiles(response.data.files);
            store.setFiles(sortedFiles);
            store.setCurrentPath(response.data.current_path);
          } else {
            throw new Error(response.error || '获取文件列表失败');
          }
        } finally {
          if (!skipLoading) {
            store.setLoading(false);
          }
        }
      });
    });
  }

  /**
   * 文件排序逻辑
   */
  private sortFiles(files: FileItem[]): FileItem[] {
    const sortConfig = useAppStore.getState().sortConfig;
    
    return [...files].sort((a, b) => {
      // 上级目录始终在最前面
      if (a.type === 'parent_dir') return -1;
      if (b.type === 'parent_dir') return 1;
      
      // 目录排在文件前面
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      
      // 根据排序配置进行排序
      let aValue: any, bValue: any;
      switch (sortConfig.column) {
        case 'name':
          aValue = a.display_name.toLowerCase();
          bValue = b.display_name.toLowerCase();
          break;
        case 'type':
          aValue = a.type === 'directory' ? '目录' : this.getFileExtension(a.filename);
          bValue = b.type === 'directory' ? '目录' : this.getFileExtension(b.filename);
          break;
        case 'size':
          aValue = a.size || 0;
          bValue = b.size || 0;
          break;
        case 'created':
          aValue = new Date(a.upload_time || 0);
          bValue = new Date(b.upload_time || 0);
          break;
        case 'date':
          aValue = new Date(a.modified_time || a.upload_time || 0);
          bValue = new Date(b.modified_time || b.upload_time || 0);
          break;
        case 'permission':
          aValue = a.is_public === undefined ? -1 : (a.is_public ? 1 : 0);
          bValue = b.is_public === undefined ? -1 : (b.is_public ? 1 : 0);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  private getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex > 0 ? filename.substring(lastDotIndex + 1).toLowerCase() : '';
  }

  /**
   * 乐观删除文件
   */
  public async deleteFile(filename: string): Promise<void> {
    const store = useAppStore.getState();
    const originalFiles = store.files;
    
    // 乐观更新：立即从列表中移除文件
    const optimisticFiles = originalFiles.filter(f => f.filename !== filename);
    store.setFiles(optimisticFiles);

    try {
      await this.executeWithRetry(() => this.api.deleteUnifiedFile(filename));
      // 刷新文件列表确保数据一致性
      await this.refreshFileList(true);
    } catch (error) {
      // 失败时回滚
      store.setFiles(originalFiles);
      throw error;
    }
  }

  /**
   * 乐观更新文件权限
   */
  public async changeFilePermission(filename: string, isPublic: boolean): Promise<void> {
    const store = useAppStore.getState();
    const originalFiles = store.files;
    
    // 乐观更新：立即更新文件权限
    const optimisticFiles = originalFiles.map(f => 
      f.filename === filename ? { ...f, is_public: isPublic } : f
    );
    store.setFiles(optimisticFiles);

    try {
      await this.executeWithRetry(() => this.api.changeFilePermission(filename, isPublic));
      // 刷新文件列表确保数据一致性
      await this.refreshFileList(true);
    } catch (error) {
      // 失败时回滚
      store.setFiles(originalFiles);
      throw error;
    }
  }

  /**
   * 乐观批量删除
   */
  public async batchDeleteFiles(filenames: string[]): Promise<{ success: number; failed: number }> {
    const store = useAppStore.getState();
    const originalFiles = store.files;
    
    // 乐观更新：立即从列表中移除文件
    const optimisticFiles = originalFiles.filter(f => !filenames.includes(f.filename));
    store.setFiles(optimisticFiles);

    try {
      const result = await this.executeWithRetry(() => this.api.batchDeleteUnifiedFiles(filenames));
      // 刷新文件列表确保数据一致性
      await this.refreshFileList(true);
      
      return {
        success: result.data?.deleted?.length || 0,
        failed: result.data?.failed?.length || 0
      };
    } catch (error) {
      // 失败时回滚
      store.setFiles(originalFiles);
      throw error;
    }
  }

  /**
   * 乐观批量权限更改
   */
  public async batchChangePermission(filenames: string[], isPublic: boolean): Promise<{ success: number; failed: number }> {
    const store = useAppStore.getState();
    const originalFiles = store.files;
    
    // 乐观更新：立即更新文件权限
    const optimisticFiles = originalFiles.map(f => 
      filenames.includes(f.filename) ? { ...f, is_public: isPublic } : f
    );
    store.setFiles(optimisticFiles);

    try {
      const result = await this.executeWithRetry(() => this.api.batchChangePermission(filenames, isPublic));
      // 刷新文件列表确保数据一致性
      await this.refreshFileList(true);
      
      return {
        success: result.data?.updated?.length || 0,
        failed: result.data?.failed?.length || 0
      };
    } catch (error) {
      // 失败时回滚
      store.setFiles(originalFiles);
      throw error;
    }
  }

  /**
   * 清理过期的请求
   */
  public cleanupExpiredRequests(): void {
    const now = Date.now();
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > 30000) {
        this.pendingRequests.delete(key);
      }
    }
  }
}