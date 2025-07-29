import { useMemo, useCallback, useRef, useEffect } from 'react';
import { FileService } from '@/services/fileService';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/use-toast';

export const useFileService = () => {
  const { config } = useAppStore();
  const { toast } = useToast();
  const serviceRef = useRef<FileService | null>(null);

  // 创建FileService实例
  const fileService = useMemo(() => {
    const api = new FileServerAPI(config);
    const service = new FileService(api);
    serviceRef.current = service;
    return service;
  }, [config]);

  // 清理过期请求的定时器
  useEffect(() => {
    const interval = setInterval(() => {
      serviceRef.current?.cleanupExpiredRequests();
    }, 30000); // 每30秒清理一次

    return () => clearInterval(interval);
  }, []);

  // 刷新文件列表
  const refreshFileList = useCallback(async (skipLoading = false, targetPath?: string) => {
    try {
      await fileService.refreshFileList(skipLoading, targetPath);
    } catch (error) {
      toast({
        title: "加载失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
    }
  }, [fileService, toast]);

  // 删除文件
  const deleteFile = useCallback(async (filename: string) => {
    try {
      await fileService.deleteFile(filename);
      toast({
        title: "删除成功",
        description: `已删除 ${filename}`,
        duration: 1500,
      });
    } catch (error) {
      toast({
        title: "删除失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
      throw error;
    }
  }, [fileService, toast]);

  // 更改文件权限
  const changeFilePermission = useCallback(async (filename: string, isPublic: boolean) => {
    try {
      await fileService.changeFilePermission(filename, isPublic);
      toast({
        title: "权限修改成功",
        description: `文件已设置为${isPublic ? '公开' : '私有'}`,
        duration: 1500,
      });
    } catch (error) {
      toast({
        title: "权限修改失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
      throw error;
    }
  }, [fileService, toast]);

  // 批量删除文件
  const batchDeleteFiles = useCallback(async (filenames: string[]) => {
    try {
      const result = await fileService.batchDeleteFiles(filenames);
      
      if (result.failed === 0) {
        toast({
          title: "批量删除成功",
          description: `已删除 ${result.success} 个项目`,
          duration: 1500,
        });
      } else {
        toast({
          title: "部分删除成功",
          description: `成功 ${result.success} 个，失败 ${result.failed} 个`,
          variant: "destructive",
          duration: 2000,
        });
      }
    } catch (error) {
      toast({
        title: "批量删除失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
      throw error;
    }
  }, [fileService, toast]);

  // 批量更改权限
  const batchChangePermission = useCallback(async (filenames: string[], isPublic: boolean) => {
    try {
      const result = await fileService.batchChangePermission(filenames, isPublic);
      
      if (result.failed === 0) {
        toast({
          title: "批量权限修改成功",
          description: `已将 ${result.success} 个文件设置为${isPublic ? '公开' : '私有'}`,
          duration: 1500,
        });
      } else {
        toast({
          title: "部分权限修改成功",
          description: `成功 ${result.success} 个，失败 ${result.failed} 个`,
          duration: 2000,
        });
      }
    } catch (error) {
      toast({
        title: "批量权限修改失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 1500,
      });
      throw error;
    }
  }, [fileService, toast]);

  return {
    fileService,
    refreshFileList,
    deleteFile,
    changeFilePermission,
    batchDeleteFiles,
    batchChangePermission,
  };
};