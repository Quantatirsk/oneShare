import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { AppConfig } from '@/types';

export interface CollaborativeSession {
  doc: Y.Doc;
  provider: WebsocketProvider;
  text: Y.Text;
  awareness: any;
  destroy: () => void;
}

export class YjsCollaborationManager {
  private sessions = new Map<string, CollaborativeSession>();
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  updateConfig(config: AppConfig) {
    this.config = config;
  }

  createSession(filePath: string, initialContent?: string): CollaborativeSession {
    // Clean up existing session if any
    this.destroySession(filePath);

    // Create new Y.Doc
    const doc = new Y.Doc();
    const text = doc.getText('monaco');

    // Create WebSocket provider
    const serverUrl = this.config.serverAddress.replace(/^https?:\/\//, '');
    const protocol = this.config.serverAddress.startsWith('https') ? 'wss' : 'ws';
    
    // Generate safe room name using Base64 encoding to avoid URL parsing issues
    // This ensures consistent handling of file paths with special characters including non-Latin characters
    const safeFilePath = btoa(encodeURIComponent(filePath));
    const roomName = safeFilePath;
    
    // Y.js WebsocketProvider automatically appends the room name to the URL
    // So we provide the base URL without the room name
    const baseUrl = `${protocol}://${serverUrl}/api/yjs`;
    
    const provider = new WebsocketProvider(baseUrl, roomName, doc, {
      connect: true,
      params: this.config.authToken ? { auth: this.config.authToken } : {}
    });

    const awareness = provider.awareness;

    // Set user information for presence
    awareness.setLocalStateField('user', {
      name: 'User', // TODO: Get from user settings
      color: this.generateUserColor(),
      colorLight: this.generateUserColor(true)
    });

    // Track initial content state
    let initialContentSet = false;
    
    // Handle connection events
    provider.on('status', (event: any) => {
      console.log('Y.js provider status:', event.status);
      if (event.status === 'connected') {
        console.log(`Connected to collaborative session for ${filePath}`);
      }
    });

    // Handle sync events - be more careful about initial content
    provider.on('sync', (synced: boolean) => {
      if (synced && !initialContentSet) {
        console.log('Y.js synced, document length:', text.length);
        
        // Only set initial content if:
        // 1. We have initial content to set
        // 2. The Y.js document is empty
        // 3. We haven't set initial content before
        if (initialContent && text.length === 0) {
          console.log('Setting initial content - document is empty after sync');
          // Use transaction to insert content atomically
          doc.transact(() => {
            text.insert(0, initialContent);
          });
        } else if (text.length > 0) {
          console.log('Document already has content after sync, not setting initial content');
        }
        
        initialContentSet = true;
      }
    });

    provider.on('connection-error', (error: any) => {
      console.error('Y.js connection error:', error);
    });

    // Create session object
    const session: CollaborativeSession = {
      doc,
      provider,
      text,
      awareness,
      destroy: () => {
        awareness.destroy();
        provider.destroy();
        doc.destroy();
      }
    };

    this.sessions.set(filePath, session);
    return session;
  }

  getSession(filePath: string): CollaborativeSession | undefined {
    return this.sessions.get(filePath);
  }

  destroySession(filePath: string) {
    const session = this.sessions.get(filePath);
    if (session) {
      session.destroy();
      this.sessions.delete(filePath);
    }
  }

  destroyAllSessions() {
    for (const [filePath] of this.sessions) {
      this.destroySession(filePath);
    }
  }

  private generateUserColor(light = false): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
    ];
    const lightColors = [
      '#FFE5E5', '#E5F9F7', '#E5F3FF', '#F0F8F0',
      '#FFFCE5', '#F5E5F5', '#F0FAF8', '#FEFAEF'
    ];
    
    const colorArray = light ? lightColors : colors;
    return colorArray[Math.floor(Math.random() * colorArray.length)];
  }

  // Check if a file has active collaborators
  hasActiveCollaborators(filePath: string): boolean {
    const session = this.getSession(filePath);
    if (!session) return false;
    
    const awarenessStates = session.awareness.getStates();
    return awarenessStates.size > 1;
  }

  // Get total number of users (including self)
  getUserCount(filePath: string): number {
    const session = this.getSession(filePath);
    if (!session) return 0;
    
    const awarenessStates = session.awareness.getStates();
    return awarenessStates.size;
  }

  // Get list of active collaborators for a file
  getActiveCollaborators(filePath: string): Array<{name: string, color: string}> {
    const session = this.getSession(filePath);
    if (!session) return [];
    
    const awarenessStates = session.awareness.getStates();
    const collaborators: Array<{name: string, color: string}> = [];
    
    awarenessStates.forEach((state: any, clientId: number) => {
      if (clientId !== session.awareness.clientID && state.user) {
        collaborators.push({
          name: state.user.name,
          color: state.user.color
        });
      }
    });
    
    return collaborators;
  }
}

// Global instance
let globalYjsManager: YjsCollaborationManager | null = null;

export function getYjsManager(config?: AppConfig): YjsCollaborationManager {
  if (!globalYjsManager && config) {
    globalYjsManager = new YjsCollaborationManager(config);
  } else if (globalYjsManager && config) {
    globalYjsManager.updateConfig(config);
  }
  
  if (!globalYjsManager) {
    throw new Error('YjsCollaborationManager not initialized. Call with config first.');
  }
  
  return globalYjsManager;
}