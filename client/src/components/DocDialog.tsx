import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ModernMarkdownViewer } from './ModernMarkdownViewer';

interface DocDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  showCopyButton?: boolean;
}

export function DocDialog({ 
  isOpen, 
  onClose, 
  title, 
  content,
  showCopyButton = false 
}: DocDialogProps) {
  const { toast } = useToast();

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "复制成功",
        description: `${title}已复制到剪贴板`,
        duration: 1500,
      });
    } catch (error) {
      toast({
        title: "复制失败",
        description: "复制到剪贴板失败",
        variant: "destructive",
        duration: 1500,
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="flex-shrink-0 px-6 py-3 border-b bg-muted/50">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-medium">{title}</DialogTitle>
            <div className="flex items-center gap-2">
              {showCopyButton && (
                <Button variant="outline" size="sm" onClick={handleCopyAll} className="h-8 w-8 p-0" title="复制全部内容">
                  <Copy className="w-4 h-4" />
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose} className="h-8 w-8 p-0" title="关闭">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="overflow-auto h-full container max-w-screen-2xl px-10 py-4">
          <ModernMarkdownViewer content={content} />
        </div>
      </DialogContent>
    </Dialog>
  );
}