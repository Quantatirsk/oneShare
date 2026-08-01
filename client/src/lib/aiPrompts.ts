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
    ? '整理用户需求为简洁、可执行的结构化需求。直接输出结果，不要解释过程。'
    : '将用户需求转化为实用的页面设计方案。覆盖目标用户、功能、内容、视觉与交互，保持具体、简洁、可执行。';
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
