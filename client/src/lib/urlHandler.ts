// URL处理工具函数

/**
 * 检测文本是否为有效的URL
 */
export function isValidUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 文件扩展名到MIME类型的映射
 */
const EDITABLE_TEXT_EXTENSIONS = [
  'txt', 'md', 'mdx', 'csv', 'py', 'js', 'jsx', 'ts', 'tsx', 
  'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'php', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'bat', 'ps1', 'sql', 'r', 'swift', 'kt'
];

/**
 * 根据Content-Type判断文件类型
 */
export function getFileTypeFromContentType(contentType: string): 'text' | 'html' | 'binary' {
  const type = contentType.toLowerCase();
  
  // HTML类型
  if (type.includes('text/html') || type.includes('application/xhtml')) {
    return 'html';
  }
  
  // 文本类型
  if (type.startsWith('text/') || 
      type.includes('application/json') ||
      type.includes('application/xml') ||
      type.includes('application/javascript') ||
      type.includes('application/typescript')) {
    return 'text';
  }
  
  // 其他都视为二进制文件
  return 'binary';
}

/**
 * 从URL获取文件扩展名
 */
export function getExtensionFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const lastDot = pathname.lastIndexOf('.');
    const lastSlash = pathname.lastIndexOf('/');
    
    if (lastDot > lastSlash && lastDot !== -1) {
      return pathname.substring(lastDot + 1).toLowerCase();
    }
  } catch {
    // URL解析失败
  }
  return '';
}

/**
 * 判断扩展名是否为可编辑的文本文件
 */
export function isEditableTextExtension(extension: string): boolean {
  return EDITABLE_TEXT_EXTENSIONS.includes(extension.toLowerCase());
}

/**
 * 获取URL的HEAD信息
 */
export async function getUrlHeaders(url: string): Promise<{
  contentType: string;
  contentLength?: number;
  fileName?: string;
}> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    
    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    const contentDisposition = response.headers.get('content-disposition');
    
    // 尝试从Content-Disposition获取文件名
    let fileName: string | undefined;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        fileName = match[1].replace(/['"]/g, '');
        // 解码可能的URI编码字符
        try {
          fileName = decodeURIComponent(fileName);
        } catch {
          // 如果解码失败，保持原字符串
        }
      }
    }
    
    // 如果没有从headers获取到文件名，尝试从URL获取
    if (!fileName) {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const lastSlash = pathname.lastIndexOf('/');
      if (lastSlash !== -1 && lastSlash < pathname.length - 1) {
        fileName = pathname.substring(lastSlash + 1);
        // 解码可能的URI编码字符
        try {
          fileName = decodeURIComponent(fileName);
        } catch {
          // 如果解码失败，保持原字符串
        }
      }
    }
    
    return {
      contentType,
      contentLength: contentLength ? parseInt(contentLength, 10) : undefined,
      fileName
    };
  } catch (error) {
    throw new Error(`无法获取URL头部信息: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 读取URL的文本内容
 */
export async function fetchUrlText(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    throw new Error(`无法读取URL内容: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 使用Jina AI将HTML转换为Markdown
 */
export async function convertHtmlToMarkdown(url: string): Promise<string> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl);
    
    if (!response.ok) {
      throw new Error(`Jina AI转换失败: HTTP ${response.status}`);
    }
    
    return await response.text();
  } catch (error) {
    throw new Error(`HTML转Markdown失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 从Markdown内容中提取标题
 * 优先查找第一行的 "Title: xxx" 格式，然后查找 # 标题
 */
export function extractTitleFromMarkdown(content: string): string {
  const lines = content.split('\n');
  
  // 首先查找第一行的 "Title: xxx" 格式
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.startsWith('Title: ')) {
      return firstLine.substring(7).trim(); // 移除 "Title: " 前缀
    }
  }
  
  // 如果第一行不是Title格式，查找第一个 # 标题
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.substring(2).trim();
    }
  }
  
  // 如果都没有找到标题，返回默认名称
  return '网页内容';
}

/**
 * 根据URL和内容生成合适的文件名
 */
export function generateFileName(url: string, content?: string, contentType?: string): string {
  // 首先尝试从URL获取文件名
  const extension = getExtensionFromUrl(url);
  if (extension && isEditableTextExtension(extension)) {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const lastSlash = pathname.lastIndexOf('/');
    if (lastSlash !== -1 && lastSlash < pathname.length - 1) {
      let fileName = pathname.substring(lastSlash + 1);
      // 解码可能的URI编码字符
      try {
        fileName = decodeURIComponent(fileName);
      } catch {
        // 如果解码失败，保持原字符串
      }
      return fileName;
    }
  }
  
  // 如果是Markdown内容，尝试提取标题
  if (content && (contentType?.includes('text/html') || content.includes('# '))) {
    const title = extractTitleFromMarkdown(content);
    return `${title}.md`;
  }
  
  // 根据Content-Type决定扩展名
  let ext = 'txt';
  if (contentType) {
    if (contentType.includes('application/json')) ext = 'json';
    else if (contentType.includes('text/html')) ext = 'html';
    else if (contentType.includes('text/css')) ext = 'css';
    else if (contentType.includes('application/javascript')) ext = 'js';
    else if (contentType.includes('text/csv')) ext = 'csv';
    else if (contentType.includes('application/xml') || contentType.includes('text/xml')) ext = 'xml';
  }
  
  // 使用域名作为文件名前缀
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, '');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return `${domain}-${timestamp}.${ext}`;
  } catch {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return `url-content-${timestamp}.${ext}`;
  }
}