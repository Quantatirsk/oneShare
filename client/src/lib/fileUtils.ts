import { FileServerAPI } from './api';
import type { FileItem } from '@/types';

export interface ProcessedFile extends File {
  originalName: string;
  finalName: string;
}

export async function processFilesForUpload(
  files: File[],
  api: FileServerAPI,
  currentPath: string = '',
  existingFilesList?: FileItem[]
): Promise<ProcessedFile[]> {
  if (!files || files.length === 0) return [];

  let existingFiles: FileItem[] = [];

  // 如果提供了现有文件列表，直接使用它
  if (existingFilesList && existingFilesList.length > 0) {
    existingFiles = existingFilesList;
  } else {
    try {
      // 获取当前目录的文件列表
      const response = await api.listUnifiedFiles(currentPath, 'all');
      if (!response.success || !response.data) {
        console.warn('无法获取文件列表，跳过重名检测');
        return files.map(file => Object.assign(file, {
          originalName: file.name,
          finalName: file.name
        }));
      }
      existingFiles = response.data.files || [];
    } catch (error) {
      console.error('获取文件列表失败:', error);
      return files.map(file => Object.assign(file, {
        originalName: file.name,
        finalName: file.name
      }));
    }
  }
  
  // 处理每个文件，为重名文件添加后缀
  return files.map(file => {
    const fileName = file.name;
    let uniqueFileName = fileName;
    
    // 提取基本名称和扩展名
    let baseName = fileName;
    let extension = '';
    
    if (fileName.includes('.')) {
      const lastDotIndex = fileName.lastIndexOf('.');
      baseName = fileName.substring(0, lastDotIndex);
      extension = fileName.substring(lastDotIndex);
    }
    
    // 检查是否存在同名文件
    let counter = 1;
    while (existingFiles.some(existingFile => 
      existingFile.type !== 'directory' && 
      existingFile.type !== 'parent_dir' && 
      existingFile.display_name === uniqueFileName)) {
      uniqueFileName = `${baseName}(${counter})${extension}`;
      counter++;
    }
    
    // 如果文件名已更改，创建新的File对象
    if (uniqueFileName !== fileName) {
      const newFile = new File([file], uniqueFileName, { type: file.type });
      return Object.assign(newFile, {
        originalName: fileName,
        finalName: uniqueFileName
      });
    }
    
    return Object.assign(file, {
      originalName: fileName,
      finalName: fileName
    });
  });
}

export function generateUniqueDirectoryName(
  dirName: string,
  existingFiles: FileItem[]
): string {
  let uniqueDirName = dirName;
  let counter = 1;
  
  // 检查是否存在同名目录
  while (existingFiles.some(file => 
    file.type === 'directory' && 
    file.display_name === uniqueDirName)) {
    uniqueDirName = `${dirName}(${counter})`;
    counter++;
  }
  
  return uniqueDirName;
}

export function generateUniqueFileName(
  fileName: string,
  existingFiles: FileItem[]
): string {
  let uniqueFileName = fileName;
  let counter = 1;
  
  // 提取基本名称和扩展名
  let baseName = fileName;
  let extension = '';
  
  if (fileName.includes('.')) {
    const lastDotIndex = fileName.lastIndexOf('.');
    baseName = fileName.substring(0, lastDotIndex);
    extension = fileName.substring(lastDotIndex);
  }
  
  // 检查是否存在同名文件
  while (existingFiles.some(existingFile => 
    existingFile.type !== 'directory' && 
    existingFile.type !== 'parent_dir' && 
    existingFile.display_name === uniqueFileName)) {
    uniqueFileName = `${baseName}(${counter})${extension}`;
    counter++;
  }
  
  return uniqueFileName;
}

