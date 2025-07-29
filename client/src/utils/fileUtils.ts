import { useState, useEffect } from 'react';
import { callOpenAI } from '@/lib/llmWrapper';

// 生成4个随机字母的后缀
const generateRandomSuffix = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// 使用LLM生成智能文件名
export const generateSmartFileName = async (codeContent: string): Promise<string> => {
  try {
    // 取代码的前5000字符进行分析
    const codeToAnalyze = codeContent.slice(0, 5000);
    
    const aiResponse = await callOpenAI([
      {
        role: 'system',
        content: `你是一个专业的代码分析师，专门根据代码内容生成合适的中文文件名。你需要：

1. 分析代码的功能和用途
2. 生成一个简洁的中文文件名（不包含扩展名）
3. 文件名应该反映代码的主要功能
4. 控制在2-8个中文字符
5. 避免使用特殊字符，只使用中文字符和数字

输出要求：
- 只返回文件名，不要任何解释
- 不要包含扩展名（如.tsx、.html等）
- 不要包含引号或其他标点符号`
      },
      {
        role: 'user',
        content: `请分析以下代码并生成合适的中文文件名：

\`\`\`
${codeToAnalyze}
\`\`\`

请直接返回中文文件名，不要添加任何其他文字。`
      }
    ]);

    // 清理AI响应，只保留中文字符、数字和基本符号
    const cleanedName = aiResponse
      .replace(/[^\u4e00-\u9fa5\u3400-\u4dbf\u3000-\u303f\uff00-\uffef0-9]/g, '')
      .slice(0, 16) // 限制长度
      .trim();

    if (cleanedName && cleanedName.length > 0) {
      return `${cleanedName}${generateRandomSuffix()}`;
    } else {
      // 如果AI生成失败或结果为空，使用默认名称
      return `智能应用${generateRandomSuffix()}`;
    }
  } catch (error) {
    console.error('AI文件名生成失败:', error);
    // 如果AI调用失败，使用默认名称
    return `智能应用${generateRandomSuffix()}`;
  }
};

// 生成随机文件名（备用方案）
export const generateRandomFileName = () => {
  return `WebApp${generateRandomSuffix()}`;
};

// 截断文本到指定长度
export const truncateText = (text: string, maxLength: number = 150) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
};

// 检测是否为移动设备

export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
};

// 格式化文件大小
export const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 验证文件名
export const validateFileName = (fileName: string) => {
  const invalidChars = /[<>:"/\\|?*]/g;
  return !invalidChars.test(fileName);
};

// 获取文件扩展名
export const getFileExtension = (fileName: string) => {
  return fileName.split('.').pop()?.toLowerCase() || '';
};

// 检查是否为有效的代码文件
export const isValidCodeFile = (fileName: string) => {
  const validExtensions = ['tsx', 'ts', 'jsx', 'js', 'html', 'htm', 'css', 'json'];
  const extension = getFileExtension(fileName);
  return validExtensions.includes(extension);
};