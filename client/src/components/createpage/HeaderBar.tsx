import React from 'react';
import { Button } from '@/components/ui/button';
import { LottieLoader } from '@/components/common/LottieAnimations';

interface HeaderBarProps {
  templateLibraryOpen: boolean;
  isSaving: boolean;
  onToggleTemplateLibrary: () => void;
  onSave: () => void;
  onShare: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  isSaving,
  onToggleTemplateLibrary,
  onSave,
  onShare
}) => {
  return (
    <div className="h-12 border-b flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleTemplateLibrary}
        >
          模板库
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? <LottieLoader size={16} /> : '保存'}
        </Button>
        <Button variant="outline" size="sm" onClick={onShare}>
          分享
        </Button>
      </div>
    </div>
  );
};

export default React.memo(HeaderBar);