import { isAiRequestAborted, streamGenerate } from './aiClient';

export async function callRequirementAnalysisStream(
  userRequirement: string,
  onChunk: (content: string) => void,
  onThinking?: (content: string) => void,
  onComplete?: () => void,
  onError?: (error: string) => void,
  model?: string,
  selectedTemplate?: unknown,
  signal?: AbortSignal,
): Promise<void> {
  const systemPrompt = selectedTemplate
    ? '你是产品需求分析助手，处在本项目的【需求文档（spec）阶段】。你的唯一输出是一份结构化的产品需求文档（spec），当前阶段不写任何代码、不生成任何实现。\n\n要求：\n1. 只输出需求文档，禁止输出可运行代码（禁止一切代码块，包括 JSX / TSX / HTML / CSS / JavaScript，也禁止返回一个完整页面的实现）。\n2. 语言必须是自然语言描述，覆盖：目标用户、功能清单、页面/区域设计、内容、视觉与交互。\n3. 结构清晰、可执行，供后续阶段据此生成代码。\n4. 直接输出文档结果，不要解释过程或用代码包住内容。'
    : '你是产品需求分析助手，处在本项目的【需求文档（spec）阶段】。你的唯一输出是一份结构化的产品需求文档（spec），当前阶段不写任何代码、不生成任何实现。\n\n要求：\n1. 只输出需求文档，禁止输出可运行代码（禁止一切代码块，包括 JSX / TSX / HTML / CSS / JavaScript，也禁止返回一个完整页面的实现）。\n2. 语言必须是自然语言描述，覆盖：目标用户、功能清单、页面/区域设计、内容、视觉与交互。\n3. 结构清晰、可执行，供后续阶段据此生成代码。\n4. 直接输出文档结果，不要解释过程或用代码包住内容。';
  try {
    await streamGenerate({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userRequirement }],
    }, { onThinkingDelta: onThinking, onDelta: onChunk, onCompleted: onComplete }, signal);
  } catch (error) {
    if (isAiRequestAborted(error)) {
      throw error;
    }
    onError?.(error instanceof Error ? error.message : '需求分析失败');
  }
}
