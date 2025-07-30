import type { Message } from '@/types';
import { getLLMConfig } from './llmConfig';

/**
 * LLM API 请求接口
 */
interface LLMApiRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * 模型类型定义
 */
export interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/**
 * 获取模型列表
 */
export const fetchModelList = async (): Promise<OpenAIModel[]> => {
  try {
    const response = await fetch('/api/llm/models');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('获取模型列表失败:', error);
    return [];
  }
};

/**
 * 按 ID 过滤模型列表
 */
export const getFilteredModels = async (filter?: string): Promise<OpenAIModel[]> => {
  const models = await fetchModelList();
  if (filter) {
    return models.filter(model => model.id.toLowerCase().includes(filter.toLowerCase()));
  }
  return models;
};

/**
 * 获取所有可用模型 ID
 */
export const getAvailableModelIds = async (): Promise<string[]> => {
  const models = await fetchModelList();
  return models.map(model => model.id);
};

/**
 * 从后端获取 LLM 配置
 */
export const fetchLLMConfig = async () => {
  try {
    const response = await fetch('/api/llm/config');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('获取 LLM 配置失败:', error);
    return {
      default_model: 'google/gemini-2.5-flash-lite',
      temperature: 0.6,
      max_tokens: 32000,
      available: false
    };
  }
};

/**
 * 检查模型是否可用
 */
export const isModelAvailable = async (modelId: string): Promise<boolean> => {
  try {
    const models = await fetchModelList();
    return models.some(model => model.id === modelId);
  } catch (error) {
    console.error(`检查模型 ${modelId} 是否可用时出错:`, error);
    return false;
  }
};

/**
 * 调用 OpenAI API
 */
export const callOpenAI = async (
  messages: Message[],
  model?: string,
  temperature?: number,
  max_tokens?: number
): Promise<string> => {
  // 获取配置的默认值
  const llmConfig = await getLLMConfig();
  
  const request: LLMApiRequest = {
    messages,
    model: model || llmConfig.default_model,
    temperature: temperature ?? llmConfig.temperature,
    max_tokens: max_tokens || llmConfig.max_tokens
  };
  
  try {
    const response = await fetch('/api/llm/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'API调用失败');
    }

    return result.data || '';
  } catch (error) {
    console.error('OpenAI API调用失败:', error);
    throw error;
  }
};

/**
 * 流式调用 OpenAI API
 */
export const callOpenAIStream = async (
  messages: Message[],
  onChunk: (content: string) => void,
  onComplete?: () => void,
  onError?: (error: string) => void,
  model?: string,
  temperature?: number,
  max_tokens?: number
): Promise<void> => {
  // 获取配置的默认值
  const llmConfig = await getLLMConfig();
  
  const request: LLMApiRequest = {
    messages,
    model: model || llmConfig.default_model,
    temperature: temperature ?? llmConfig.temperature,
    max_tokens: max_tokens || llmConfig.max_tokens
  };

  console.log('callOpenAIStream - making request to:', '/api/llm/chat/stream');
  console.log('callOpenAIStream - request body:', request);

  try {
    const response = await fetch('/api/llm/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });

    console.log('callOpenAIStream - response status:', response.status);
    console.log('callOpenAIStream - response ok:', response.ok);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              onChunk(data.content);
            } else if (data.done) {
              onComplete?.();
              return;
            } else if (data.error) {
              onError?.(data.error);
              return;
            }
          } catch (e) {
            console.warn('解析流数据失败:', line);
          }
        }
      }
    }
  } catch (error) {
    console.error('流式API调用失败:', error);
    onError?.(error instanceof Error ? error.message : '流式调用失败');
  }
};

/**
 * Agent专用：需求分析调用函数 (流式) - 专注设计分析
 */
export const callRequirementAnalysisStream = async (
  userRequirement: string,
  onChunk: (content: string) => void,
  onComplete?: () => void,
  onError?: (error: string) => void,
  model?: string,
  selectedTemplate?: any
): Promise<void> => {
  // 根据是否选中模板使用不同的提示词策略
  let systemPrompt: string;
  
  if (selectedTemplate) {
    // 选中模板时：简化分析，只需要结构化用户需求
    systemPrompt = `你是需求内容整理专家，负责整理用户输入的文本。

**任务：** 将用户输入的内容进行结构化重构，输出格式如下：

---
**需求详情**

（bulllet points 结构化重构用户内容原文，附加用户的明确提示指示）
---

**要求：** 简洁明了，直接输出结果。`;
  } else {
    // 未选中模板时：详细的设计分析
    systemPrompt = `你是世界级的页面设计师和用户体验专家，曾在 Apple、Google、微软等公司担任首席设计师。请将用户需求转化为详细的页面设计文档，包含设计分析和页面内容，输出不要有多余解释，直接输出设计文档本身。

## 设计分析要点

### 需求理解
- 识别页面类型（工具类/展示类/娱乐类/社交类）
- 明确核心功能和目标用户
- 分析主要使用场景

### 功能架构
- 规划主要功能模块和优先级
- 设计用户操作流程
- 确定关键页面结构

### 视觉设计
- 选择合适的设计风格（现代简约/温暖亲和/专业商务/创意活泼）
- 确定主色调和辅助色彩
- 规划布局网格和组件层次

### 交互体验
- 设计核心交互方式和反馈
- 考虑不同设备的操作差异
- 规划动效和过渡效果

## 输出要求

请按以下结构输出设计方案：

**1. 需求分析**
- Web页面定位和核心价值
- 目标用户群体和使用场景

**2. 内容规划**  
- 主要功能模块列表
- 页面具体内容及呈现方式
- 特色功能和亮点

**3. 视觉设计**
- 整体风格和设计理念
- 色彩方案和视觉层次
- 关键界面布局规划

**4. 交互设计**
- 主要交互方式和用户路径
- 反馈机制和状态提示
- 响应式适配策略

**5. 原始需求**
（结构化提炼用户需求原文）

**要求：重点突出，逻辑清晰，避免过度冗长的理论描述。直接输出实用的设计方案：**`;
  }

  // 构建消息历史
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userRequirement }
  ];

  return await callOpenAIStream(messages, onChunk, onComplete, onError, model);
};

/**
 * Agent专用：代码生成调用函数 (流式) - 专注技术实现
 */
export const callCodeGenerationStream = async (
  prompt: string,
  conversationHistory: Message[],
  selectedTemplate: any,
  currentCode: string,
  onChunk: (content: string) => void,
  onComplete?: () => void,
  onError?: (error: string) => void,
  model?: string,
  isFirstGeneration: boolean = true,
  codeLang: 'tsx' | 'html' = 'tsx'
): Promise<void> => {
  const baseCode = currentCode || (selectedTemplate ? selectedTemplate.code : '');
  
  // TSX代码生成提示词 - 直接输出代码
  const getTSXSystemPrompt = (baseCode: string) => `你是资深的 React + TypeScript 开发专家。请根据需求生成完整的单文件 TSX 组件，请只输出代码本身，不要任何解释。

## 技术栈要求
- **React 19** + TypeScript + TailwindCSS
- **可用库**: font-awesome, lucide-react, framer-motion, three.js, d3, recharts, plotly.js, badge-maker, p5js, react-toastify, codemirror, @uiw/react-codemirror, lodash, classnames, uuid, react-hook-form, papaparse, xlsx, mathjs, jspdf, html2canvas, react-pdf等

## 在线资源
- **占位图片**: 使用 https://picsum.photos/ 、https://api.dicebear.com/9.x/notionists/svg?seed= 、https://i.pravatar.cc/ 、https://ui-avatars.com/api/?name= 或 https://placehold.co/ 等在线服务
- **视频地址**: 使用 https://www.youtube.com/results?search_query=keyword
- **关键词搜索**: 使用 https://www.google.com/search?q=keyword
- **AI 人像**: 使用 https://thispersondoesnotexist.com/ （AI 人像生成）
- **数据集**: 使用 https://randomuser.me/api （随机用户数据）

## 开发规范
- **完整的单文件 TSX 页面**
- **TailwindCSS 响应式样式** (320px - 桌面端)
- **包含所有必要的 import 语句**
- **错误处理机制**

## 样式要求
- 主要使用 TailwindCSS 类名
- 完整响应式适配
- 平滑动画效果 (transition, transform)
- 现代设计风格

## LLM API 集成
如需集成 AI 功能（window.llm默认已开启），使用以下标准化 API：

\`\`\`typescript
// Complete API - 获取完整回复
const response = await (window as any).llm?.complete(messages);

// Stream API - 实时流式回复
(window as any).llm?.stream(messages, 
  (chunk: string) => console.log(chunk),     // onChunk callback
  () => console.log('completed'),            // onComplete callback
  (error: string) => console.error(error)   // onError callback
);

// Messages 格式
const messages = [
  {role: 'system', content: 'system prompt'},
  {role: 'user', content: 'user message'},
  {role: 'assistant', content: 'assistant response'}
];
\`\`\`

${baseCode ? `\n## 模板页面\n\`\`\`tsx\n${baseCode}\n\`\`\`\n用户提供了上述模板，请在此模板上进行内容填充。\n\n` : ''}**重要：请直接输出完整的 TSX 代码，确保仅仅输出代码：**\n\n`;;

  // HTML代码生成提示词 - 直接输出代码
  const getHTMLSystemPrompt = (baseCode: string) => `你是资深的前端开发专家。请根据需求生成完整的 HTML 单文件应用，直接输出代码本身，不要多余的解释。

## 技术要求
- **TailwindCSS** (通过 CDN 引入)
- **图标库**: font-awesome (通过 CDN 引入)
- **动效**: framer-motion (https://cdn.jsdelivr.net/npm/framer-motion@12.23.0/+esm)

## HTML 结构模板
\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>应用标题</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: { extend: {} }
        }
    </script>
</head>
<body class="font-sans antialiased">
    <div id="app" class="min-h-screen">
        <!-- 应用内容 -->
    </div>
    
    <script type="module">
        // 应用逻辑
    </script>
</body>
</html>
\`\`\`

## 在线资源
- **占位图片**: 使用 https://picsum.photos/ 、https://api.dicebear.com/9.x/notionists/svg?seed= 、https://i.pravatar.cc/ 、https://ui-avatars.com/api/?name= 或 https://placehold.co/ 等在线服务
- **视频地址**: 使用 https://www.youtube.com/results?search_query=keyword
- **关键词搜索**: 使用 https://www.google.com/search?q=keyword
- **AI 人像**: 使用 https://thispersondoesnotexist.com/ （AI 人像生成）
- **数据集**: 使用 https://randomuser.me/api （随机用户数据）

## 开发规范
- **完整的单文件 HTML 应用**
- **语义化 HTML5 标签**
- **TailwindCSS 响应式设计** (320px - 桌面端)
- **错误处理机制**
- **纯代码输出** 不包含任何解释性文字

## 样式要求
- 主要使用 TailwindCSS 类名，最小化自定义 CSS
- 完整响应式适配
- 平滑动画效果

## LLM API 集成
如需集成 AI 功能（window.llm默认已开启），使用以下标准化 API：

\`\`\`javascript
// Complete API - 获取完整回复
const response = await window.llm?.complete(messages);

// Stream API - 实时流式回复
window.llm?.stream(messages, 
  (chunk) => console.log(chunk),     // onChunk callback
  () => console.log('completed'),    // onComplete callback
  (error) => console.error(error)    // onError callback
);

// Messages 格式
const messages = [
  {role: 'system', content: 'system prompt'},
  {role: 'user', content: 'user message'},
  {role: 'assistant', content: 'assistant response'}
];
\`\`\`

${baseCode ? `\n## 模板页面\n\`\`\`html\n${baseCode}\n\`\`\`\n用户提供了上述模板，请在此模板上进行内容填充。\n\n` : ''}**重要：请确保仅仅输出完整的、可运行的 HTML 代码：**\n\n`;

  // 根据代码语言选择提示词
  const codeSystemPrompt = codeLang === 'html' 
    ? getHTMLSystemPrompt(baseCode)
    : getTSXSystemPrompt(baseCode);

  // 构建消息历史
  let messages: Message[];
  
  if (isFirstGeneration) {
    messages = [
      { role: 'system', content: codeSystemPrompt },
      { role: 'user', content: prompt }
    ];
  } else {
    const firstUserRequirement = conversationHistory.find(msg => msg.role === 'user');
    const lastAssistantCode = conversationHistory
      .slice()
      .reverse()
      .find(msg => msg.role === 'assistant');
    const latestUserChange = conversationHistory
      .slice()
      .reverse()
      .find(msg => msg.role === 'user');
    
    messages = [
      { role: 'system', content: codeSystemPrompt }
    ];
    
    if (firstUserRequirement) {
      messages.push({
        role: 'user',
        content: `原始需求：${firstUserRequirement.content}`
      });
    }
    
    if (lastAssistantCode) {
      messages.push({
        role: 'assistant',
        content: lastAssistantCode.content
      });
    }
    
    if (latestUserChange && latestUserChange !== firstUserRequirement) {
      messages.push({
        role: 'user',
        content: `修改要求：${latestUserChange.content}`
      });
    }
  }
  const temperature = isFirstGeneration ? 0.7 : 0.4; // 初次生成使用较低温度，后续修改使用较高温度
  return await callOpenAIStream(messages, onChunk, onComplete, onError, model, temperature);
};