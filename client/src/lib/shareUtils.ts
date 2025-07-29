// 分享链接工具函数
import { FileServerAPI } from '@/lib/api';

export interface ShareInfo {
  id: string;
  filename: string;
  isPublic: boolean;
  createdAt: string;
}

export function createShareUrl(shareId: string, _filename?: string): string {
  // All files should go to CodeViewPage first (/s/), 
  // then use preview button to go to /app/ if needed
  // filename parameter kept for backward compatibility
  return `${window.location.origin}/s/${shareId}`;
}

export function parseShareUrl(url: string): string | null {
  // Match both /s/ and /app/ share URL formats
  const match = url.match(/\/(s|app)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
  return match ? match[2] : null;
}

// 通过后端API获取或创建分享链接
export async function getOrCreateShare(api: FileServerAPI, filename: string, isPublic: boolean): Promise<ShareInfo> {
  try {
    const response = await api.createShare(filename, isPublic);
    if (response.success) {
      return {
        id: response.share_id,
        filename: response.filename,
        isPublic: response.is_public,
        createdAt: response.created_at,
      };
    } else {
      throw new Error('Failed to create share');
    }
  } catch (error) {
    console.error('Error creating share:', error);
    throw error;
  }
}

// 通过后端API获取分享信息
export async function getShareInfo(api: FileServerAPI, shareId: string): Promise<ShareInfo | null> {
  try {
    const response = await api.getShareInfo(shareId);
    if (response.success) {
      return {
        id: response.share_id,
        filename: response.filename,
        isPublic: response.is_public,
        createdAt: response.created_at,
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting share info:', error);
    return null;
  }
}

// 通过后端API获取分享文件内容
export async function getSharedFileContent(api: FileServerAPI, shareId: string): Promise<{
  filename: string;
  content: string;
  isPublic: boolean;
  createdAt: string;
} | null> {
  try {
    const response = await api.getSharedFile(shareId);
    if (response.success) {
      return {
        filename: response.filename,
        content: response.content,
        isPublic: response.is_public,
        createdAt: response.created_at,
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting shared file content:', error);
    return null;
  }
}