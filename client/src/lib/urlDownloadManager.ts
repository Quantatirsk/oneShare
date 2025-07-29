// URL下载管理器

import { FileServerAPI } from './api';
import { WebSocketClient } from './websocket';
import type { AppConfig } from '@/types';

export interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  progress: number;
  downloadedBytes: number;
  totalBytes?: number;
  isComplete: boolean;
  isError: boolean;
  errorMessage?: string;
}

export class UrlDownloadManager {
  private _api: FileServerAPI;
  private wsClient: WebSocketClient | null = null;
  private tasks: Map<string, DownloadTask> = new Map();
  private listeners: Set<(tasks: DownloadTask[]) => void> = new Set();
  private urlToTaskMap: Map<string, string> = new Map(); // URL到任务ID的映射

  constructor(config: AppConfig) {
    this._api = new FileServerAPI(config);
  }

  /**
   * 更新API配置
   */
  updateConfig(config: AppConfig) {
    this._api.updateConfig(config);
  }

  /**
   * 设置WebSocket客户端以监听进度事件
   */
  setWebSocketClient(wsClient: WebSocketClient) {
    // 移除之前的监听器
    if (this.wsClient) {
      this.wsClient.off('url_processing_progress', this.handleUrlProgress);
      this.wsClient.off('cobalt_download_progress', this.handleCobaltProgress);
    }

    this.wsClient = wsClient;
    
    if (this.wsClient) {
      // 监听URL处理进度事件
      this.wsClient.on('url_processing_progress', this.handleUrlProgress);
      // 监听 Cobalt 下载进度事件
      this.wsClient.on('cobalt_download_progress', this.handleCobaltProgress);
    }
  }

  /**
   * 处理WebSocket URL进度事件
   */
  private handleUrlProgress = (event: any) => {
    const { url, message } = event;
    const taskId = this.urlToTaskMap.get(url);
    
    if (!taskId) {
      return;
    }

    // 解析进度信息
    let progress = 0;
    let downloadedBytes = 0;
    let totalBytes = 0;
    let errorMessage: string | undefined;

    if (message.includes('下载中:')) {
      // 解析下载进度："下载中: 50.5% (100.2MB / 200.0MB)"
      const progressMatch = message.match(/下载中:\s*([\d.]+)%/);
      if (progressMatch) {
        progress = parseFloat(progressMatch[1]);
      }
      
      // 解析字节数信息
      const bytesMatch = message.match(/\(([\d.]+)MB\s*\/\s*([\d.]+)MB\)/);
      if (bytesMatch) {
        downloadedBytes = parseFloat(bytesMatch[1]) * 1024 * 1024;
        totalBytes = parseFloat(bytesMatch[2]) * 1024 * 1024;
      } else {
        // 如果没有总大小，只解析已下载大小
        const singleBytesMatch = message.match(/([\d.]+)MB/);
        if (singleBytesMatch) {
          downloadedBytes = parseFloat(singleBytesMatch[1]) * 1024 * 1024;
        }
      }
    } else if (message.includes('开始下载')) {
      // 开始下载
      progress = 5;
    } else if (message.includes('下载完成')) {
      // 下载完成
      this.completeTask(taskId);
      return;
    } else if (message.includes('正在')) {
      // 初始状态，显示一些进度
      progress = Math.min(this.getTask(taskId)?.progress || 0, 10);
    } else if (message.includes('错误') || message.includes('失败')) {
      // 错误状态
      errorMessage = message;
    }

    if (errorMessage) {
      this.errorTask(taskId, errorMessage);
    } else {
      this.updateProgressWithBytes(taskId, progress, downloadedBytes, totalBytes);
    }
  };

  /**
   * 处理 Cobalt 下载进度事件
   */
  private handleCobaltProgress = (event: any) => {
    const { task_id, progress, message, downloaded_size, total_size } = event;
    
    // 直接通过任务ID更新进度
    const task = this.tasks.get(task_id);
    if (!task) {
      return;
    }

    if (message.includes('错误') || message.includes('失败')) {
      this.errorTask(task_id, message);
    } else if (message.includes('下载完成')) {
      this.completeTask(task_id);
    } else {
      this.updateProgressWithBytes(task_id, progress, downloaded_size, total_size);
    }
  };

  /**
   * 添加任务到下载管理器（仅用于监听进度）
   */
  addTask(taskId: string, url: string, filename: string): void {
    const task: DownloadTask = {
      id: taskId,
      url,
      filename,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      isComplete: false,
      isError: false
    };

    this.tasks.set(taskId, task);
    this.urlToTaskMap.set(url, taskId);
    this.notifyListeners();
  }

  /**
   * 开始下载任务
   */
  async startDownload(url: string, filename?: string): Promise<string> {
    const taskId = this.generateTaskId();
    const displayFilename = filename || this.extractFilenameFromUrl(url);

    // 创建下载任务
    const task: DownloadTask = {
      id: taskId,
      url,
      filename: displayFilename,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      isComplete: false,
      isError: false
    };

    this.tasks.set(taskId, task);
    // 建立URL到任务ID的映射，用于WebSocket事件处理
    this.urlToTaskMap.set(url, taskId);
    this.notifyListeners();

    try {
      // 判断URL类型并选择合适的处理方式
      const result = await this.processUrl(url, displayFilename);
      
      if (result.success) {
        // 处理成功，任务完成
        this.completeTask(taskId);
      } else {
        // 处理失败
        this.errorTask(taskId, result.error || '处理失败');
      }
    } catch (error) {
      this.errorTask(taskId, error instanceof Error ? error.message : '处理失败');
    }

    return taskId;
  }

  /**
   * 处理URL，自动判断是直接下载还是内容处理
   */
  private async processUrl(url: string, filename?: string) {
    // 判断URL类型
    const urlLower = url.toLowerCase();
    const hasFileExtension = /\.[a-z0-9]{2,4}($|\?|#)/i.test(url);
    
    // 明确的文件下载扩展名
    const downloadExtensions = [
      '.exe', '.msi', '.dmg', '.pkg', '.deb', '.rpm',
      '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
      '.mp3', '.mp4', '.avi', '.mkv', '.wav', '.flac',
      '.iso', '.img', '.bin', '.apk', '.whl', '.jar'
    ];
    
    const isDirectDownload = downloadExtensions.some(ext => urlLower.includes(ext));
    
    if (isDirectDownload || hasFileExtension) {
      // 直接下载文件
      return await this._api.downloadFromUrl(url, filename);
    } else {
      // 智能内容处理（转换网页为Markdown等）
      return await this._api.processUrlContent(url);
    }
  }

  /**
   * 完成任务
   */
  private completeTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.progress = 100;
      task.isComplete = true;
      this.notifyListeners();
      
      // 5秒后自动移除完成的任务
      setTimeout(() => {
        this.removeTask(taskId);
      }, 5000);
    }
  }

  /**
   * 取消下载任务
   */
  cancelDownload(taskId: string) {
    const task = this.tasks.get(taskId);
    if (task && !task.isComplete) {
      // 清理URL映射
      this.urlToTaskMap.delete(task.url);
      this.tasks.delete(taskId);
      this.notifyListeners();
    }
  }

  /**
   * 移除完成的任务
   */
  removeTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (task) {
      // 清理URL映射
      this.urlToTaskMap.delete(task.url);
      this.tasks.delete(taskId);
      this.notifyListeners();
    }
  }

  /**
   * 获取所有任务
   */
  getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取单个任务
   */
  getTask(taskId: string): DownloadTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 订阅任务变更
   */
  subscribe(listener: (tasks: DownloadTask[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 更新任务进度（包含字节数信息）
   */
  private updateProgressWithBytes(taskId: string, progress: number, downloadedBytes: number, totalBytes: number) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.progress = Math.min(100, Math.max(0, progress));
      task.downloadedBytes = downloadedBytes || 0;
      task.totalBytes = totalBytes > 0 ? totalBytes : undefined;
      this.notifyListeners();
    }
  }

  /**
   * 完成任务 (暂时不使用)
   */
  // private _completeTask(taskId: string) {
  //   const task = this.tasks.get(taskId);
  //   if (task) {
  //     task.progress = 100;
  //     task.isComplete = true;
  //     this.notifyListeners();
  //     
  //     // 5秒后自动移除完成的任务
  //     setTimeout(() => {
  //       this.removeTask(taskId);
  //     }, 5000);
  //   }
  // }

  /**
   * 任务出错
   */
  private errorTask(taskId: string, errorMessage: string) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.isError = true;
      task.errorMessage = errorMessage;
      this.notifyListeners();
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners() {
    const tasks = this.getTasks();
    this.listeners.forEach(listener => listener(tasks));
  }

  /**
   * 生成任务ID
   */
  private generateTaskId(): string {
    return `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 从URL提取文件名
   */
  private extractFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const lastSlash = pathname.lastIndexOf('/');
      
      if (lastSlash !== -1 && lastSlash < pathname.length - 1) {
        const filename = pathname.substring(lastSlash + 1);
        if (filename && filename.includes('.')) {
          return filename;
        }
      }
      
      // 使用域名作为备选
      const domain = urlObj.hostname.replace(/^www\./, '');
      return `${domain}-download`;
    } catch {
      return 'download';
    }
  }
}

// 全局下载管理器实例
let globalDownloadManager: UrlDownloadManager | null = null;

export function getUrlDownloadManager(config: AppConfig): UrlDownloadManager {
  if (!globalDownloadManager) {
    globalDownloadManager = new UrlDownloadManager(config);
  }
  return globalDownloadManager;
}

/**
 * 设置全局下载管理器的WebSocket客户端
 */
export function setDownloadManagerWebSocket(wsClient: WebSocketClient) {
  if (globalDownloadManager) {
    globalDownloadManager.setWebSocketClient(wsClient);
  }
}