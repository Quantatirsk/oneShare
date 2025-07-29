import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Folder, Users, Lock, AlertTriangle } from 'lucide-react';

interface DirectoryPermissionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (isPublic: boolean, applyToChildren: boolean) => void;
  directoryName: string;
  currentPermission?: boolean;
  loading?: boolean;
}

export function DirectoryPermissionDialog({
  isOpen,
  onClose,
  onConfirm,
  directoryName,
  currentPermission = true,
  loading = false,
}: DirectoryPermissionDialogProps) {
  const [isPublic, setIsPublic] = useState(currentPermission);
  const [applyToChildren, setApplyToChildren] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsPublic(currentPermission);
      setApplyToChildren(false);
    }
  }, [isOpen, currentPermission]);

  const handleConfirm = () => {
    onConfirm(isPublic, applyToChildren);
  };

  const newPermissionText = isPublic ? '公开' : '私有';
  const currentPermissionText = currentPermission ? '公开' : '私有';
  const isChangingPermission = isPublic !== currentPermission;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        {/* 隐藏的聚焦元素，防止checkbox自动聚焦 */}
        <div tabIndex={0} className="sr-only" />
        
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-blue-500" />
            设置目录权限
          </DialogTitle>
          <DialogDescription>
            为目录 <span className="font-semibold">{directoryName}</span> 设置访问权限
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 当前权限状态 */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">当前权限:</span>
              <Badge variant={currentPermission ? "secondary" : "outline"}>
                {currentPermission ? (
                  <>
                    <Users className="w-3 h-3 mr-1" />
                    公开
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3 mr-1" />
                    私有
                  </>
                )}
              </Badge>
            </div>
          </div>

          {/* 权限选择 */}
          <div className="space-y-3">
            <Label className="text-base font-medium">设置新权限</Label>
            <div className="grid grid-cols-2 gap-3">
              <div
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  isPublic
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setIsPublic(true)}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full border-2 ${
                      isPublic
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground'
                    }`}
                  >
                    {isPublic && (
                      <div className="w-2 h-2 bg-background rounded-full m-0.5" />
                    )}
                  </div>
                  <Users className="w-4 h-4 text-primary" />
                  <span className="font-medium">公开</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-6">
                  任何人都可以访问此目录
                </p>
              </div>

              <div
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  !isPublic
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setIsPublic(false)}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full border-2 ${
                      !isPublic
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground'
                    }`}
                  >
                    {!isPublic && (
                      <div className="w-2 h-2 bg-background rounded-full m-0.5" />
                    )}
                  </div>
                  <Lock className="w-4 h-4 text-orange-500" />
                  <span className="font-medium">私有</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-6">
                  需要认证才能访问此目录
                </p>
              </div>
            </div>
          </div>

          {/* 递归应用选项 */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="apply-to-children"
                checked={applyToChildren}
                onCheckedChange={(checked: boolean) => setApplyToChildren(checked)}
              />
              <Label htmlFor="apply-to-children" className="text-sm font-medium">
                应用到所有子文件和子目录
              </Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              {isChangingPermission 
                ? "将新权限同时应用到目录内的所有子项目" 
                : "将当前目录权限应用到所有子项目，而不修改目录本身的权限"
              }
            </p>
            
            {applyToChildren && (
              <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-orange-700 dark:text-orange-300">
                  <p className="font-medium mb-1">注意：</p>
                  <p>
                    {isChangingPermission ? (
                      <>
                        这将把此目录下的所有文件和子目录都设置为
                        <span className="font-semibold mx-1">{newPermissionText}</span>
                        权限。此操作不可撤销，请谨慎操作。
                      </>
                    ) : (
                      <>
                        这将把此目录下的所有文件和子目录都设置为
                        <span className="font-semibold mx-1">{currentPermissionText}</span>
                        权限（与当前目录相同）。此操作不可撤销，请谨慎操作。
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 权限变更预览 */}
          {isChangingPermission && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">权限变更:</span>
              <Badge variant="outline">{currentPermissionText}</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant={isPublic ? "secondary" : "outline"}>
                {newPermissionText}
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={loading}
          >
            取消
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={loading || (!isChangingPermission && !applyToChildren)}
          >
            {loading ? '设置中...' : (
              isChangingPermission 
                ? `设置为${newPermissionText}` 
                : (applyToChildren ? '应用权限到子项目' : '确定')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}