/**
 * 代码清理工具函数
 * 用于从LLM响应中提取纯净的代码内容
 */

import { 
  getGlobalConfig, 
  getDefaultCleaningOptions, 
  startPerformanceMonitor, 
  endPerformanceMonitor 
} from './codeCleaningConfig';

// 支持的代码语言类型
export type CodeLanguage = 'tsx' | 'typescript' | 'ts' | 'html' | 'javascript' | 'js' | 'css' | 'json' | 'xml' | 'yaml' | 'yml';

// 清理配置选项
export interface CleaningOptions {
  removeCodeblocks?: boolean;      // 移除代码块标记（默认true）
  removeIntroText?: boolean;       // 移除介绍文字（默认true）
  trimWhitespace?: boolean;        // 清理空白字符（默认true）
  preserveStructure?: boolean;     // 保持代码结构（默认true）
  debugMode?: boolean;             // 调试模式（默认false）
}

// 代码块提取结果
export interface CodeBlock {
  language: string;
  code: string;
  startIndex: number;
  endIndex: number;
}

// 注意：DEFAULT_OPTIONS 已被 getDefaultCleaningOptions() 替代
// const DEFAULT_OPTIONS: Required<CleaningOptions> = {
//   removeCodeblocks: true,
//   removeIntroText: true,
//   trimWhitespace: true,
//   preserveStructure: true,
//   debugMode: false
// };

/**
 * 主要清理函数 - 从LLM响应中提取纯代码
 */
export function extractCleanCode(
  rawContent: string, 
  expectedLanguage?: CodeLanguage,
  options: CleaningOptions = {}
): string {
  if (!rawContent || typeof rawContent !== 'string') {
    return '';
  }

  const globalConfig = getGlobalConfig();
  
  // 检查是否启用代码清理
  if (!globalConfig.enabled) {
    return rawContent;
  }

  // 检查内容长度限制
  if (rawContent.length > globalConfig.maxContentLength) {
    console.warn(`🧹 [CodeCleaning] Content too large (${rawContent.length} > ${globalConfig.maxContentLength}), skipping cleanup`);
    return rawContent;
  }

  // 合并配置
  const defaultOptions = getDefaultCleaningOptions();
  const config = { ...defaultOptions, ...options };
  
  // 开始性能监控
  const startTime = startPerformanceMonitor('extractCleanCode', rawContent.length);
  
  if (config.debugMode) {
    console.log('🧹 [CodeCleaning] Starting cleanup:', { 
      rawContent: rawContent.slice(0, 100) + '...', 
      expectedLanguage, 
      config,
      globalConfig 
    });
  }

  let cleaned = rawContent;
  let attemptCount = 0;
  const maxAttempts = globalConfig.retryAttempts + 1;

  while (attemptCount < maxAttempts) {
    try {
      attemptCount++;
      
      if (config.debugMode && attemptCount > 1) {
        console.log(`🧹 [CodeCleaning] Retry attempt ${attemptCount}/${maxAttempts}`);
      }

      // 第一步：检测并处理代码块
      if (config.removeCodeblocks && hasCodeblocks(cleaned)) {
        cleaned = extractFromCodeblocks(cleaned, expectedLanguage);
        if (config.debugMode) {
          console.log('🧹 [CodeCleaning] After codeblock extraction:', cleaned.slice(0, 100) + '...');
        }
      }

      // 第二步：移除介绍文字
      if (config.removeIntroText) {
        cleaned = removeIntroductoryText(cleaned, expectedLanguage);
        if (config.debugMode) {
          console.log('🧹 [CodeCleaning] After intro text removal:', cleaned.slice(0, 100) + '...');
        }
      }

      // 第三步：清理空白字符
      if (config.trimWhitespace) {
        cleaned = cleaned.trim();
        // 移除多余的空行，但保持代码结构
        if (config.preserveStructure) {
          cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n'); // 最多保留一个空行
        }
      }

      // 验证清理结果
      if (cleaned.length === 0) {
        throw new Error('Cleaning resulted in empty content');
      }

      if (!isValidCleanedCode(cleaned, expectedLanguage)) {
        throw new Error('Cleaned code failed validation');
      }

      // 成功清理
      if (config.debugMode) {
        console.log('🧹 [CodeCleaning] Final result:', { 
          originalLength: rawContent.length, 
          cleanedLength: cleaned.length,
          cleanedContent: cleaned.slice(0, 200) + '...',
          attempts: attemptCount
        });
      }

      endPerformanceMonitor('extractCleanCode', startTime, rawContent.length, true);
      return cleaned;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (config.debugMode) {
        console.warn(`🧹 [CodeCleaning] Attempt ${attemptCount} failed:`, errorMessage);
      }

      // 如果是最后一次尝试或不允许重试
      if (attemptCount >= maxAttempts) {
        console.error('🧹 [CodeCleaning] All attempts failed:', errorMessage);
        
        // 根据配置决定是否降级
        if (globalConfig.fallbackToOriginal) {
          // 降级到基础清理
          const fallbackResult = removeCodeblockMarkers(rawContent).trim();
          endPerformanceMonitor('extractCleanCode', startTime, rawContent.length, false, errorMessage);
          return fallbackResult || rawContent;
        } else {
          endPerformanceMonitor('extractCleanCode', startTime, rawContent.length, false, errorMessage);
          throw error;
        }
      }

      // 重置为原始内容进行重试
      cleaned = rawContent;
    }
  }

  // 不应该到达这里，但作为安全措施
  endPerformanceMonitor('extractCleanCode', startTime, rawContent.length, false, 'Unexpected end of function');
  return rawContent;
}

/**
 * 检测内容是否包含代码块
 */
export function hasCodeblocks(content: string): boolean {
  return /```[\s\S]*?```/g.test(content);
}

/**
 * 检测并移除代码块标记
 */
export function removeCodeblockMarkers(content: string): string {
  if (!content) return '';
  
  return content
    // 移除开头的代码块标记（支持多种语言）
    .replace(/^```(?:tsx|typescript|ts|html|javascript|js|css|json|xml|yaml|yml)?\s*\n?/gm, '')
    // 移除结尾的代码块标记
    .replace(/\n?\s*```\s*$/gm, '')
    .trim();
}

/**
 * 从代码块中提取代码内容
 */
function extractFromCodeblocks(content: string, expectedLanguage?: CodeLanguage): string {
  const codeblocks = extractCodeblocks(content);
  
  if (codeblocks.length === 0) {
    return removeCodeblockMarkers(content);
  }

  // 如果指定了期望语言，优先选择匹配的代码块
  if (expectedLanguage) {
    const languageVariants = getLanguageVariants(expectedLanguage);
    const matchingBlock = codeblocks.find(block => 
      languageVariants.includes(block.language.toLowerCase())
    );
    
    if (matchingBlock) {
      return matchingBlock.code;
    }
  }

  // 选择最长的代码块（通常是主要内容）
  const longestBlock = codeblocks.reduce((prev, current) => 
    current.code.length > prev.code.length ? current : prev
  );

  return longestBlock.code;
}

/**
 * 提取所有代码块
 */
export function extractCodeblocks(content: string): CodeBlock[] {
  const codeblocks: CodeBlock[] = [];
  const regex = /```(\w*)\s*\n?([\s\S]*?)\n?\s*```/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    codeblocks.push({
      language: match[1] || 'unknown',
      code: match[2].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }

  return codeblocks;
}

/**
 * 智能移除介绍文字（代码块前的解释文字）
 */
export function removeIntroductoryText(content: string, expectedLanguage?: CodeLanguage): string {
  if (!content) return '';

  // 如果已经看起来是纯代码，直接返回
  if (looksLikeCode(content, expectedLanguage)) {
    return content;
  }

  // 尝试找到代码开始的位置
  const codeStartIndex = findCodeStartIndex(content, expectedLanguage);
  
  if (codeStartIndex > 0) {
    const withoutIntro = content.substring(codeStartIndex);
    // 验证移除介绍文字后的内容是否合理
    if (withoutIntro.trim().length > content.length * 0.3) { // 至少保留30%的内容
      return withoutIntro.trim();
    }
  }

  return content;
}

/**
 * 检测内容是否看起来像代码
 */
function looksLikeCode(content: string, expectedLanguage?: CodeLanguage): boolean {
  const trimmed = content.trim();
  
  if (!expectedLanguage) {
    // 通用代码特征检测
    return /^(import\s|export\s|const\s|let\s|var\s|function\s|class\s|interface\s|type\s|<!DOCTYPE|<html|<\?xml)/i.test(trimmed);
  }

  // 特定语言的代码特征检测
  switch (expectedLanguage) {
    case 'tsx':
    case 'typescript':
    case 'ts':
      return /^(import\s|export\s|const\s|let\s|var\s|function\s|class\s|interface\s|type\s|enum\s)/i.test(trimmed) ||
             /^\/\*[\s\S]*?\*\/|^\/\//.test(trimmed); // 注释开头也算代码

    case 'html':
      return /^<!DOCTYPE\s+html|^<html|^<\?xml|^<(!--)?\s*\w+/i.test(trimmed);

    case 'javascript':
    case 'js':
      return /^(import\s|export\s|const\s|let\s|var\s|function\s|class\s)/i.test(trimmed) ||
             /^\/\*[\s\S]*?\*\/|^\/\//.test(trimmed);

    case 'css':
      return /^[@.]?[\w-]+\s*\{|^\/\*/.test(trimmed);

    case 'json':
      return /^[[{]/.test(trimmed);

    case 'xml':
      return /^<\?xml|^<\w+/.test(trimmed);

    case 'yaml':
    case 'yml':
      return /^[\w-]+\s*:|^-\s+/.test(trimmed);

    default:
      return false;
  }
}

/**
 * 查找代码开始的索引位置
 */
function findCodeStartIndex(content: string, expectedLanguage?: CodeLanguage): number {
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 跳过空行和明显的介绍性文字
    if (!line || isIntroductoryLine(line)) {
      continue;
    }

    // 检查这一行是否看起来像代码开始
    if (looksLikeCodeLine(line, expectedLanguage)) {
      // 返回这一行在原文中的开始位置
      return content.indexOf(lines[i]);
    }
  }

  return 0; // 没找到明确的代码开始位置
}

/**
 * 检测是否为介绍性文字行
 */
function isIntroductoryLine(line: string): boolean {
  const introPatterns = [
    /^这是/i,
    /^以下是/i,
    /^下面是/i,
    /^这里是/i,
    /^here is/i,
    /^this is/i,
    /^the following/i,
    /^below is/i,
    /^代码如下/i,
    /^完整代码/i,
    /^示例代码/i,
    /^例如/i,
    /^for example/i,
    /^example/i,
    /^注意/i,
    /^note/i,
    /^说明/i
  ];

  return introPatterns.some(pattern => pattern.test(line));
}

/**
 * 检测行是否看起来像代码行
 */
function looksLikeCodeLine(line: string, expectedLanguage?: CodeLanguage): boolean {
  // 通用代码行特征
  const codePatterns = [
    /^import\s/i,
    /^export\s/i,
    /^const\s/i,
    /^let\s/i,
    /^var\s/i,
    /^function\s/i,
    /^class\s/i,
    /^interface\s/i,
    /^type\s/i,
    /^enum\s/i,
    /^<!DOCTYPE/i,
    /^<html/i,
    /^<\?xml/i,
    /^<\w+/,
    /^\/\*|^\/\//,  // 注释
    /^\{/,          // JSON 对象开始
    /^\[/,          // JSON 数组开始
    /^[\w-]+\s*\{/, // CSS 选择器
    /^@\w+/,        // CSS at-rules
    /^[\w-]+\s*:/, // YAML 键值对
  ];

  // 语言特定的检测规则
  if (expectedLanguage) {
    const languageSpecificPatterns = getLanguageSpecificPatterns(expectedLanguage);
    return codePatterns.concat(languageSpecificPatterns).some(pattern => pattern.test(line));
  }

  return codePatterns.some(pattern => pattern.test(line));
}

/**
 * 获取语言特定的代码行模式
 */
function getLanguageSpecificPatterns(language: CodeLanguage): RegExp[] {
  switch (language) {
    case 'tsx':
    case 'typescript':
    case 'ts':
      return [
        /^import\s+.*from\s+/i,
        /^export\s+default\s+/i,
        /^export\s+\{/i,
        /^interface\s+\w+/i,
        /^type\s+\w+\s*=/i,
        /^enum\s+\w+/i,
        /^namespace\s+\w+/i,
        /^declare\s+/i,
        /^abstract\s+class/i,
        /^public\s+|^private\s+|^protected\s+/i,
        /^readonly\s+/i,
        /^async\s+function/i,
        /^\s*\w+\s*:\s*\w+/,  // 类型注解
        /^React\./i,
        /^useEffect\(|^useState\(|^useCallback\(|^useMemo\(/i,
        /^<\w+.*>/,  // JSX 标签
      ];

    case 'html':
      return [
        /^<!DOCTYPE\s+html/i,
        /^<html[^>]*>/i,
        /^<head[^>]*>/i,
        /^<body[^>]*>/i,
        /^<meta[^>]*>/i,
        /^<link[^>]*>/i,
        /^<script[^>]*>/i,
        /^<style[^>]*>/i,
        /^<div[^>]*>/i,
        /^<\w+[^>]*>/,  // 任何HTML标签
        /^<!--.*-->/,   // HTML注释
      ];

    case 'javascript':
    case 'js':
      return [
        /^require\(/i,
        /^module\.exports\s*=/i,
        /^exports\./i,
        /^window\./i,
        /^document\./i,
        /^console\./i,
        /^\$\(/,  // jQuery
        /^async\s+function/i,
        /^function\*/i,  // Generator函数
        /^=>\s*\{/,      // 箭头函数
      ];

    case 'css':
      return [
        /^@import\s+/i,
        /^@media\s+/i,
        /^@keyframes\s+/i,
        /^@charset\s+/i,
        /^@font-face\s*\{/i,
        /^\.[\w-]+\s*\{/,     // CSS类选择器
        /^#[\w-]+\s*\{/,      // CSS ID选择器
        /^[\w-]+\s*\{/,       // CSS元素选择器
        /^[\w-]+\s*:\s*[\w-]/,  // CSS属性
        /^\/\*.*\*\//,        // CSS注释
      ];

    case 'json':
      return [
        /^\s*\{/,           // JSON对象开始
        /^\s*\[/,           // JSON数组开始
        /^\s*"[\w-]+"\s*:/,  // JSON键值对
        /^\s*\}/,           // JSON对象结束
        /^\s*\]/,           // JSON数组结束
      ];

    case 'xml':
      return [
        /^<\?xml\s+/i,
        /^<\w+[^>]*>/,      // XML标签
        /^<\/\w+>/,         // XML结束标签
        /^<!--.*-->/,       // XML注释
        /^\s*<\w+/,         // 缩进的XML标签
      ];

    case 'yaml':
    case 'yml':
      return [
        /^---\s*$/,         // YAML文档开始
        /^\.\.\.\s*$/,      // YAML文档结束
        /^[\w-]+\s*:/,      // YAML键
        /^\s*-\s+/,         // YAML列表项
        /^#.*$/,            // YAML注释
        /^\s+[\w-]+\s*:/,   // 缩进的YAML键
      ];

    default:
      return [];
  }
}

/**
 * 获取语言的变体形式
 */
function getLanguageVariants(language: CodeLanguage): string[] {
  const variants: Record<CodeLanguage, string[]> = {
    'tsx': ['tsx', 'typescript', 'ts'],
    'typescript': ['typescript', 'ts', 'tsx'],
    'ts': ['ts', 'typescript', 'tsx'],
    'html': ['html', 'htm'],
    'javascript': ['javascript', 'js'],
    'js': ['js', 'javascript'],
    'css': ['css'],
    'json': ['json'],
    'xml': ['xml'],
    'yaml': ['yaml', 'yml'],
    'yml': ['yml', 'yaml']
  };

  return variants[language] || [language];
}

/**
 * 验证清理后的代码是否合理
 */
export function isValidCleanedCode(code: string, expectedLanguage?: CodeLanguage): boolean {
  if (!code || code.trim().length === 0) {
    return false;
  }

  // 基本检查：不能全是空白字符
  if (!/\S/.test(code)) {
    return false;
  }

  // 检查是否还包含明显的介绍文字
  const hasIntroText = /^(这是|以下是|下面是|here is|this is|for example)/i.test(code.trim());
  if (hasIntroText) {
    return false;
  }

  // 语言特定验证
  if (expectedLanguage) {
    return looksLikeCode(code, expectedLanguage);
  }

  return true;
}

/**
 * 调试辅助函数 - 显示清理步骤
 */
export function debugCleaningSteps(rawContent: string, expectedLanguage?: CodeLanguage): {
  original: string;
  afterCodeblockRemoval: string;
  afterIntroRemoval: string;
  final: string;
} {
  const original = rawContent;
  const afterCodeblockRemoval = hasCodeblocks(rawContent) 
    ? extractFromCodeblocks(rawContent, expectedLanguage)
    : removeCodeblockMarkers(rawContent);
  const afterIntroRemoval = removeIntroductoryText(afterCodeblockRemoval, expectedLanguage);
  const final = afterIntroRemoval.trim();

  return {
    original,
    afterCodeblockRemoval,
    afterIntroRemoval,
    final
  };
}