import type { AppConfig } from '@/types';

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface FileSystemEvent {
  type: 'file_created' | 'file_updated' | 'file_deleted' | 'file_renamed' | 'batch_operation';
  file_path?: string;
  file_info?: any;
  directory?: string;
  old_path?: string;
  new_path?: string;
  operation?: string;
  files?: string[];
  result?: any;
  affected_directories?: string[];
  timestamp: string;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private clientId: string;
  private config: AppConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  
  // 事件监听器
  private eventListeners: Map<string, Set<(event: any) => void>> = new Map();

  constructor(config: AppConfig) {
    this.config = config;
    this.clientId = this.generateClientId();
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  updateConfig(config: AppConfig) {
    this.config = config;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // 如果配置改变，重新连接
      this.disconnect();
      setTimeout(() => this.connect(), 100);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
        resolve();
        return;
      }

      this.isConnecting = true;

      try {
        // 构建WebSocket URL
        const serverUrl = this.config.serverAddress.replace(/^https?:\/\//, '');
        const protocol = this.config.serverAddress.startsWith('https') ? 'wss' : 'ws';
        const wsUrl = `${protocol}://${serverUrl}/api/ws/${this.clientId}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected', { clientId: this.clientId });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnecting = false;
          this.stopHeartbeat();
          this.emit('disconnected', {});
          
          // 自动重连
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
              console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
              this.connect();
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnecting = false;
          this.emit('error', { error });
          reject(error);
        };

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(message: WebSocketMessage) {
    console.log('WebSocket message received:', message);

    switch (message.type) {
      case 'connected':
        this.emit('connected', message);
        break;
      
      case 'file_created':
      case 'file_updated':
      case 'file_deleted':
      case 'file_renamed':
      case 'batch_operation':
        this.emit('file_system_event', message as FileSystemEvent);
        this.emit(message.type, message);
        break;
      
      case 'directory_subscribed':
        this.emit('directory_subscribed', message);
        break;
      
      case 'file_subscribed':
        this.emit('file_subscribed', message);
        break;
      
      case 'url_processing_progress':
        this.emit('url_processing_progress', message);
        break;
      
      case 'cobalt_download_progress':
        this.emit('cobalt_download_progress', message);
        break;
      
      case 'pong':
        // 心跳响应
        break;
      
      case 'error':
        console.error('WebSocket server error:', message.message);
        this.emit('error', message);
        break;
      
      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'ping',
          timestamp: Date.now()
        });
      }
    }, 30000); // 每30秒发送一次心跳
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  send(message: WebSocketMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected, message not sent:', message);
    }
  }

  // 订阅目录变更
  subscribeToDirectory(directory: string) {
    this.send({
      type: 'subscribe_directory',
      directory
    });
  }

  // 订阅文件变更
  subscribeToFile(filePath: string) {
    this.send({
      type: 'subscribe_file',
      file_path: filePath
    });
  }

  // 取消文件订阅
  unsubscribeFromFile(filePath: string) {
    this.send({
      type: 'unsubscribe_file',
      file_path: filePath
    });
  }

  // 事件监听器管理
  on(event: string, listener: (data: any) => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  off(event: string, listener: (data: any) => void) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    }
  }

  private emit(event: string, data: any) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in WebSocket event listener for ${event}:`, error);
        }
      });
    }
  }

  // 获取连接状态
  getConnectionState(): string {
    if (!this.ws) return 'DISCONNECTED';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'CONNECTED';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'DISCONNECTED';
      default: return 'UNKNOWN';
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}