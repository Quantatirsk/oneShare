// URL内容处理器

import { 
  isValidUrl, 
  getUrlHeaders, 
  getFileTypeFromContentType,
  fetchUrlText,
  convertHtmlToMarkdown,
  generateFileName,
  extractTitleFromMarkdown
} from './urlHandler';
import { FileServerAPI } from './api';
import type { AppConfig } from '@/types';

export interface UrlProcessResult {
  success: boolean;
  fileName?: string;
  content?: string;
  error?: string;
  needsDownload?: boolean; // 表示需要后端下载的二进制文件
}

export interface UrlProcessProgressCallback {
  (message: string): void;
}

export class UrlContentProcessor {
  private api: FileServerAPI;

  constructor(config: AppConfig) {
    this.api = new FileServerAPI(config);
  }

  /**
   * 处理粘贴的URL内容
   */
  async processUrl(url: string, progressCallback?: UrlProcessProgressCallback): Promise<UrlProcessResult> {
    try {
      // 1. 检测URL有效性
      if (!isValidUrl(url)) {
        return { success: false, error: '无效的URL格式' };
      }

      // 2. 获取URL头部信息
      const headers = await getUrlHeaders(url);
      const fileType = getFileTypeFromContentType(headers.contentType);

      console.log('URL分析结果:', { url, headers, fileType });

      // 3. 根据文件类型进行不同处理
      switch (fileType) {
        case 'text':
          progressCallback?.('正在读取文本内容...');
          return await this.handleTextFile(url, headers);
        
        case 'html':
          progressCallback?.('正在使用Jina AI转换为Markdown...');
          return await this.handleHtmlFile(url, headers);
        
        case 'binary':
          return { 
            success: true, 
            needsDownload: true,
            fileName: headers.fileName || this.extractFileNameFromUrl(url)
          };
        
        default:
          return { success: false, error: '不支持的文件类型' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '处理URL时发生未知错误'
      };
    }
  }

  /**
   * 处理文本文件
   */
  private async handleTextFile(url: string, headers: any): Promise<UrlProcessResult> {
    try {
      // 直接读取文本内容
      const content = await fetchUrlText(url);
      const fileName = generateFileName(url, content, headers.contentType);
      
      // 保存文件
      await this.saveContentAsFile(fileName, content);
      
      return {
        success: true,
        fileName,
        content
      };
    } catch (error) {
      return {
        success: false,
        error: `处理文本文件失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 处理HTML文件，转换为Markdown并保存为.md格式
   */
  private async handleHtmlFile(url: string, _headers: any): Promise<UrlProcessResult> {
    try {
      // 使用Jina AI转换为Markdown
      const markdownContent = await convertHtmlToMarkdown(url);
      
      // 从Markdown内容提取标题，生成.md文件名
      const title = extractTitleFromMarkdown(markdownContent);
      const sanitizedTitle = title.replace(/[^\w\u4e00-\u9fff\s-]/g, '').trim();
      const fileName = sanitizedTitle ? `${sanitizedTitle}.md` : 'webpage.md';
      
      // 保存为Markdown文件
      await this.saveContentAsFile(fileName, markdownContent);
      
      return {
        success: true,
        fileName,
        content: markdownContent
      };
    } catch (error) {
      return {
        success: false,
        error: `处理HTML文件失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 将内容保存为文件
   */
  private async saveContentAsFile(fileName: string, content: string): Promise<void> {
    // 创建文件对象
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const file = new File([blob], fileName, { type: 'text/plain' });
    
    // 上传文件
    const result = await this.api.uploadUnifiedFile(file, fileName, true);
    
    if (!result.success) {
      throw new Error(result.error || '保存文件失败');
    }
  }

  /**
   * 从URL中提取文件名
   */
  private extractFileNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const lastSlash = pathname.lastIndexOf('/');
      
      if (lastSlash !== -1 && lastSlash < pathname.length - 1) {
        let fileName = pathname.substring(lastSlash + 1);
        if (fileName && fileName.includes('.')) {
          // 解码可能的URI编码字符
          try {
            fileName = decodeURIComponent(fileName);
          } catch {
            // 如果解码失败，保持原字符串
          }
          return fileName;
        }
      }
      
      // 如果无法从路径提取，使用域名和时间戳
      const domain = urlObj.hostname.replace(/^www\./, '');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      return `${domain}-${timestamp}`;
    } catch {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      return `download-${timestamp}`;
    }
  }
}

/**
 * 工厂函数：创建URL内容处理器
 */
export function createUrlContentProcessor(config: AppConfig): UrlContentProcessor {
  return new UrlContentProcessor(config);
}