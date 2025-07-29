import { useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { FileServerAPI } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { useCodeState, useTemplateState, useUIState } from '@/contexts/CreatePageContext';
import { generateRandomFileName, generateSmartFileName } from '@/utils/fileUtils';

// Utility function to convert string content to File object
const createFileFromContent = (content: string, filename: string): File => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  return new File([blob], filename, { type: 'text/plain' });
};

export function useFileFlow() {
  const { toast } = useToast();
  const { config } = useAppStore();
  const [api] = useState(() => new FileServerAPI(config));
  
  const { code, setFileName } = useCodeState();
  const { templates } = useTemplateState();
  const { setTopAlert } = useUIState();

  // 保存文件
  const handleSave = useCallback(async () => {
    if (!code.current.trim()) {
      toast({
        title: "No Code to Save",
        description: "Please generate or write some code first.",
        variant: "destructive",
        duration: 1000,
      });
      return;
    }

    try {
      console.log('💾 [保存] 当前状态:', { 
        hasFileName: !!code.fileName, 
        currentFileName: code.fileName,
        language: code.language,
        codeLength: code.current.length 
      });
      
      // Generate intelligent filename if not exists
      let fileName: string;
      if (code.fileName) {
        // If we already have a filename, use it (it should include extension)
        fileName = code.fileName;
      } else {
        // Generate new filename with AI analysis
        console.log('💾 [保存] 开始AI分析生成文件名...');
        try {
          const baseFileName = await generateSmartFileName(code.current);
          fileName = `${baseFileName}.${code.language}`;
          console.log('💾 [保存] AI生成文件名成功:', { baseFileName, language: code.language, fileName });
        } catch (error) {
          console.error('💾 [保存] AI生成文件名失败，使用默认方案:', error);
          const baseFileName = generateRandomFileName();
          fileName = `${baseFileName}.${code.language}`;
          console.log('💾 [保存] 使用默认文件名:', { baseFileName, language: code.language, fileName });
        }
      }
      
      let response;
      
      // 使用统一文件上传API，支持创建和覆盖
      const file = createFileFromContent(code.current, fileName);
      response = await api.uploadUnifiedFile(file, fileName, true);
      
      if (response.success) {
        setFileName(fileName); // Store the full filename with extension
        setTopAlert({
          message: `代码已保存: ${fileName}`,
          type: 'success'
        });
        setTimeout(() => setTopAlert(null), 2000);
      } else {
        throw new Error(response.error || 'Failed to save file');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save code. Please try again.",
        variant: "destructive",
        duration: 1000,
      });
    }
  }, [code.current, code.fileName, code.language, api, setFileName, setTopAlert, toast]);

  // 分享文件
  const handleShare = useCallback(async () => {
    if (!code.current.trim()) {
      toast({
        title: "No Code to Share",
        description: "Please generate or write some code first.",
        variant: "destructive",
        duration: 1000,
      });
      return;
    }

    try {
      // First save the file if not already saved
      let fileName: string;
      if (code.fileName) {
        // If we already have a filename, use it (it should include extension)
        fileName = code.fileName;
      } else {
        // Generate new filename with AI analysis
        console.log('🔗 [分享] 开始AI分析生成文件名...');
        try {
          const baseFileName = await generateSmartFileName(code.current);
          fileName = `${baseFileName}.${code.language}`;
          console.log('🔗 [分享] AI生成文件名成功:', { baseFileName, language: code.language, fileName });
        } catch (error) {
          console.error('🔗 [分享] AI生成文件名失败，使用默认方案:', error);
          const baseFileName = generateRandomFileName();
          fileName = `${baseFileName}.${code.language}`;
          console.log('🔗 [分享] 使用默认文件名:', { baseFileName, language: code.language, fileName });
        }
      }
      
      // 如果文件还没有保存过，需要先上传文件
      if (!code.fileName) {
        // 首次分享，需要上传文件
        const file = createFileFromContent(code.current, fileName);
        const uploadResponse = await api.uploadUnifiedFile(file, fileName, true); // Make public for sharing
        
        if (!uploadResponse.success) {
          throw new Error(uploadResponse.error || 'Failed to save file');
        }
        
        // 更新文件名状态
        setFileName(fileName);
      } else {
        // 文件已存在，确保文件内容是最新的（可能用户修改了代码但没有保存）
        if (code.current.trim()) {
          const file = createFileFromContent(code.current, fileName);
          const uploadResponse = await api.uploadUnifiedFile(file, fileName, true);
          
          if (!uploadResponse.success) {
            // 如果上传失败，记录错误但继续创建分享链接（因为文件可能已经存在且内容相同）
            console.warn('文件更新失败，但将继续创建分享链接:', uploadResponse.error);
          }
        }
      }
      
      // Create share link using the exact filename that was saved
      const shareResponse = await api.createShare(fileName, true);
      
      if (shareResponse.success) {
        const shareUrl = `${window.location.origin}/app/${shareResponse.share_id}`;
        
        // Copy to clipboard
        await navigator.clipboard.writeText(shareUrl);
        
        // Directly open the preview link
        window.open(shareUrl, '_blank');
        
        setTopAlert({
          message: "分享链接已创建并复制到剪贴板",
          type: 'success'
        });
        setTimeout(() => setTopAlert(null), 2000);
      } else {
        throw new Error('Failed to create share link');
      }
    } catch (error) {
      console.error('Share error:', error);
      toast({
        title: "Share Failed",
        description: error instanceof Error ? error.message : "Failed to create share link. Please try again.",
        variant: "destructive",
        duration: 1000,
      });
    }
  }, [code.current, code.fileName, code.language, api, setFileName, setTopAlert, toast]);

  // 导出文件
  const handleExport = useCallback(async (format: 'zip' | 'json') => {
    if (!code.current.trim()) {
      toast({
        title: "导出失败",
        description: "代码内容为空",
        variant: "destructive",
        duration: 1500,
      });
      return;
    }

    try {
      if (format === 'zip') {
        // 导出为ZIP文件
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        
        const fileName = code.fileName || 
          `WebApp.${code.language === 'html' ? 'html' : 'tsx'}`;
        
        zip.file(fileName, code.current);
        
        // 添加package.json（如果是TSX）
        if (code.language === 'tsx') {
          const packageJson = {
            name: "exported-webapp",
            version: "1.0.0",
            dependencies: {
              "react": "^18.0.0",
              "react-dom": "^18.0.0"
            },
            scripts: {
              "dev": "vite",
              "build": "vite build"
            }
          };
          zip.file('package.json', JSON.stringify(packageJson, null, 2));
        }
        
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${templates.selected?.title || 'WebApp'}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // 导出为JSON文件
        const exportData = {
          code: code.current,
          language: code.language,
          template: templates.selected,
          timestamp: new Date().toISOString(),
          metadata: {
            fileName: code.fileName,
            hasPreview: code.hasPreviewContent
          }
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
          type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${templates.selected?.title || 'WebApp'}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      
      toast({
        title: "导出成功",
        description: `文件已导出为 ${format.toUpperCase()} 格式`,
        duration: 2000,
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "导出失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [code.current, code.language, code.fileName, code.hasPreviewContent, templates.selected, toast]);

  return {
    handleSave,
    handleShare,
    handleExport,
  };
}