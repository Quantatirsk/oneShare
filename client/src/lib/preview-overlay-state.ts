export type PreviewOverlay = 'template' | 'generating' | 'rendering' | 'empty' | undefined;

export interface PreviewOverlayInput {
  stage: 'idle' | 'analyzing' | 'ready_to_generate' | 'generating' | 'validating' | 'repairing' | 'completed' | 'error';
  templateLoading: boolean;
  hasPreviewContent: boolean;
  currentCode: string;
  isRendering: boolean;
}

export function getPreviewOverlay(input: PreviewOverlayInput): PreviewOverlay {
  if (input.templateLoading) return 'template';
  if (input.stage === 'validating' || input.isRendering) return 'rendering';
  if (['analyzing', 'generating', 'repairing'].includes(input.stage)) return 'generating';
  if (!input.hasPreviewContent && !input.currentCode) return 'empty';
  return undefined;
}
