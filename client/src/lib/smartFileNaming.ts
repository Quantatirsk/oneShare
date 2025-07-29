import { callOpenAI } from './llmWrapper';
import type { FileItem, Message } from '@/types';

interface NameSuggestion {
  filename: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
}

interface SmartNamingConfig {
  maxContentLength: number;
  timeoutMs: number;
  fallbackPrefix: string;
}

const DEFAULT_CONFIG: SmartNamingConfig = {
  maxContentLength: 4000,
  timeoutMs: 6000,
  fallbackPrefix: 'paste-'
};

/**
 * 使用AI智能分析内容并建议文件名
 */
export async function suggestFileName(
  content: string, 
  config: SmartNamingConfig = DEFAULT_CONFIG
): Promise<NameSuggestion> {
  try {
    // 截取前N个字符进行分析
    const analysisContent = content.slice(0, config.maxContentLength);
    
    const prompt = `
内容:
${analysisContent}

指令:
请分析以上内容并建议一个合适的文件名(包含扩展名),只返回文件名,不要任何解释或额外文字
- 如果是编程代码,使用对应语言扩展名(.py/.js/.ts/.html/.css/.sql/.json/.yml等)
- 如果是Markdown文档或技术文档,使用.md
- 如果是配置文件,使用对应扩展名
- 如果是纯文本,使用.txt
请直接返回文件名：
`;

    // 设置超时Promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI分析超时')), config.timeoutMs);
    });

    // 调用AI分析
    const messages: Message[] = [
      {
        role: 'user',
        content: prompt
      }
    ];
    const analysisPromise = callOpenAI(messages);
    
    const response = await Promise.race([analysisPromise, timeoutPromise]);
    
    // 解析AI返回的文件名
    const filename = parseAIResponse(response);
    
    if (filename && isValidFilename(filename)) {
      return {
        filename,
        confidence: 'high',
        reasoning: 'AI分析建议'
      };
    } else {
      throw new Error('AI返回的文件名无效');
    }
    
  } catch (error) {
    console.warn('AI文件命名失败:', error);
    
    // Fallback: 使用简单规则检测
    const fallbackName = getFallbackName(content, config.fallbackPrefix);
    
    return {
      filename: fallbackName,
      confidence: 'low',
      reasoning: error instanceof Error ? error.message : 'AI分析失败，使用默认命名'
    };
  }
}

/**
 * 解析AI返回的响应，提取文件名
 */
function parseAIResponse(response: string): string | null {
  if (!response) return null;
  
  // 清理响应文本，移除多余的空白和标点
  const cleaned = response.trim()
    .replace(/^['""`]|['""`]$/g, '') // 移除引号
    .replace(/\n.*$/s, '') // 只取第一行
    .trim();
  
  // 检查是否看起来像文件名
  if (cleaned && /^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+$/.test(cleaned)) {
    return cleaned;
  }
  
  return null;
}

/**
 * 验证文件名是否有效
 */
function isValidFilename(filename: string): boolean {
  // 检查文件名格式
  const filenameRegex = /^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+$/;
  if (!filenameRegex.test(filename)) return false;
  
  // 检查文件名长度
  if (filename.length > 100) return false;
  
  // 检查是否包含无效字符
  const invalidChars = /[<>:"/\\|?*]/;
  if (invalidChars.test(filename)) return false;
  
  // 检查扩展名是否合理
  const extension = filename.split('.').pop()?.toLowerCase();
  const validExtensions = [
    'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h',
    'html', 'css', 'scss', 'sass', 'less', 'sql', 'json', 'xml', 'yml', 'yaml',
    'md', 'txt', 'csv', 'log', 'sh', 'bat', 'ps1', 'php', 'rb', 'go', 'rs',
    'swift', 'kt', 'dart', 'vue', 'svelte', 'config', 'conf', 'ini'
  ];
  
  return extension ? validExtensions.includes(extension) : false;
}

/**
 * Fallback命名策略：使用简单规则检测
 */
function getFallbackName(content: string, prefix: string): string {
  const timestamp = new Date().toLocaleString('zh-CN', { 
    year: 'numeric', month: '2-digit', day: '2-digit', 
    hour: '2-digit', minute: '2-digit', second: '2-digit', 
    hour12: false 
  }).replace(/[\s\-:\/]/g, '');
  
  // 简单检测常见格式
  const lowerContent = content.toLowerCase();
  
  // 检测JSON
  if (lowerContent.trim().startsWith('{') && lowerContent.includes('"')) {
    return `${prefix}${timestamp}.json`;
  }
  
  // 检测HTML
  if (lowerContent.includes('<html') || lowerContent.includes('<!doctype')) {
    return `${prefix}${timestamp}.html`;
  }
  
  // 检测CSS
  if (lowerContent.includes('{') && lowerContent.includes(':') && lowerContent.includes(';')) {
    return `${prefix}${timestamp}.css`;
  }
  
  // 检测SQL
  if (/\b(select|insert|update|delete|create|drop|alter)\b/i.test(content)) {
    return `${prefix}${timestamp}.sql`;
  }
  
  // 检测Markdown特征
  if (content.includes('# ') || content.includes('## ') || content.includes('```')) {
    return `${prefix}${timestamp}.md`;
  }
  
  // 默认为txt
  return `${prefix}${timestamp}.txt`;
}

/**
 * 确保文件名在当前目录中唯一
 */
export function ensureUniqueFilename(suggestedName: string, existingFiles: FileItem[]): string {
  const existingNames = new Set(
    existingFiles
      .filter(file => file.type !== 'directory' && file.type !== 'parent_dir')
      .map(file => file.display_name.toLowerCase())
  );
  
  // 如果建议的文件名不重复，直接返回
  if (!existingNames.has(suggestedName.toLowerCase())) {
    return suggestedName;
  }
  
  // 分离文件名和扩展名
  const lastDotIndex = suggestedName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // 没有扩展名的情况（不太可能，但安全起见）
    let counter = 1;
    let newName = `${suggestedName}(${counter})`;
    while (existingNames.has(newName.toLowerCase())) {
      counter++;
      newName = `${suggestedName}(${counter})`;
    }
    return newName;
  }
  
  const baseName = suggestedName.substring(0, lastDotIndex);
  const extension = suggestedName.substring(lastDotIndex);
  
  // 尝试添加编号
  let counter = 1;
  let newName = `${baseName}(${counter})${extension}`;
  
  while (existingNames.has(newName.toLowerCase())) {
    counter++;
    newName = `${baseName}(${counter})${extension}`;
  }
  
  return newName;
}

/**
 * 完整的智能文件命名流程
 */
export async function generateSmartFilename(
  content: string,
  existingFiles: FileItem[],
  config?: Partial<SmartNamingConfig>
): Promise<{ filename: string; suggestion: NameSuggestion }> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // 1. 获取AI建议
  const suggestion = await suggestFileName(content, finalConfig);
  
  // 2. 确保文件名唯一
  const uniqueFilename = ensureUniqueFilename(suggestion.filename, existingFiles);
  
  return {
    filename: uniqueFilename,
    suggestion: {
      ...suggestion,
      filename: uniqueFilename
    }
  };
}