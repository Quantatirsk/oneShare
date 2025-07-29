export const codeExtensions = [
  'js', 'jsx', 'ts', 'tsx', 'vue', 'py', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'json', 'xml', 'yaml', 'yml', 'sh', 'bash', 'sql', 'php', 'java', 'c', 'cpp',
  'cs', 'go', 'rs', 'rb', 'swift', 'kt', 'dart', 'r', 'm', 'vb', 'fs', 'pl',
  'lua', 'dockerfile', 'vue', 'svelte', 'astro', 'csv', 'key', 'crt', 'pem', 'csr', 'cert'
];

export const markdownExtensions = ['md', 'markdown', 'rst', 'txt'];

export const textExtensions = [
  'log', 'cfg', 'conf', 'ini', 'env', 'gitignore', 'gitattributes', 'editorconfig', 'readme'
];

export const mediaExtensions = {
  video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp', 'm4v', 'mpg', 'mpeg'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus', 'webm']
};

export const pdfExtensions = ['pdf'];

export const officeExtensions = {
  word: ['doc', 'docx', 'rtf'],
  excel: ['xls', 'xlsx', 'csv'],
  powerpoint: ['ppt', 'pptx'],
  other: ['odt', 'ods', 'odp']
};

export const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif'];

export const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];

export const executableExtensions = ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'appimage'];

// Helper functions
export const isCodeFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return codeExtensions.includes(ext || '');
};

export const isMarkdownFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return markdownExtensions.includes(ext || '');
};

export const isTextFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return textExtensions.includes(ext || '') || 
         markdownExtensions.includes(ext || '') || 
         codeExtensions.includes(ext || '') || 
         !ext;
};

export const isMediaFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return [...mediaExtensions.video, ...mediaExtensions.audio].includes(ext || '');
};

export const isVideoFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return mediaExtensions.video.includes(ext || '');
};

export const isAudioFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return mediaExtensions.audio.includes(ext || '');
};

export const isPdfFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return pdfExtensions.includes(ext || '');
};

export const isOfficeFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return [...officeExtensions.word, ...officeExtensions.excel, ...officeExtensions.powerpoint, ...officeExtensions.other].includes(ext || '');
};

export const isImageFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return imageExtensions.includes(ext || '');
};

export const isArchiveFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return archiveExtensions.includes(ext || '');
};

export const isExecutableFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return executableExtensions.includes(ext || '');
};

export const getFileType = (filename: string): 'text' | 'code' | 'media' | 'pdf' | 'office' | 'image' | 'archive' | 'executable' | 'other' => {
  if (isCodeFile(filename)) return 'code';
  if (isMarkdownFile(filename)) return 'text';
  if (isMediaFile(filename)) return 'media';
  if (isPdfFile(filename)) return 'pdf';
  if (isOfficeFile(filename)) return 'office';
  if (isImageFile(filename)) return 'image';
  if (isArchiveFile(filename)) return 'archive';
  if (isExecutableFile(filename)) return 'executable';
  return 'other';
}; 