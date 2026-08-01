import assert from 'node:assert/strict';
import test from 'node:test';
import { getPreviewOverlay } from './preview-overlay-state.ts';

test('agent thinking keeps the left preview loader visible before the first code delta', () => {
  assert.equal(getPreviewOverlay({
    stage: 'generating',
    templateLoading: false,
    hasPreviewContent: false,
    currentCode: '',
    isRendering: false,
  }), 'generating');
});

test('code generation overlays the previous preview with its loader', () => {
  assert.equal(getPreviewOverlay({
    stage: 'generating',
    templateLoading: false,
    hasPreviewContent: true,
    currentCode: '<div />',
    isRendering: false,
  }), 'generating');
});
