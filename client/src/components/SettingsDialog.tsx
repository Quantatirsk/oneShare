import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/use-toast';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { config, setConfig } = useAppStore();
  const { toast } = useToast();
  
  const [serverAddress, setServerAddress] = React.useState(config.serverAddress);
  const [authToken, setAuthToken] = React.useState(config.authToken);

  React.useEffect(() => {
    if (isOpen) {
      setServerAddress(config.serverAddress);
      setAuthToken(config.authToken);
    }
  }, [isOpen, config]);

  const handleSave = () => {
    if (!serverAddress.trim()) {
      toast({
        title: "错误",
        description: "请输入服务器地址",
        variant: "destructive",
        duration: 1500,
      });
      return;
    }

    setConfig({
      serverAddress: serverAddress.trim(),
      authToken: authToken.trim(),
    });

    toast({
      title: "设置已保存",
      description: "服务器配置已更新",
      duration: 1500,
    });

    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>服务器设置</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="serverAddress">服务器地址</Label>
            <Input
              id="serverAddress"
              type="url"
              placeholder="例如: http://localhost:8000"
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="authToken">认证令牌</Label>
            <Input
              id="authToken"
              type="password"
              placeholder="默认: your-secret-token"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave}>
            保存设置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}