import os
import hashlib
import urllib.parse
import aiofiles
from fastapi import HTTPException
from config import FILE_STORAGE_PATH, DOWNLOAD_CHUNK_SIZE

def is_safe_path(file_path: str) -> bool:
    """检查路径是否安全，防止目录遍历攻击"""
    normalized_path = os.path.normpath(file_path)
    return not ('..' in normalized_path or normalized_path.startswith('/'))

def get_unified_storage_directory(sub_path: str = "") -> str:
    """获取统一存储目录路径"""
    unified_dir = FILE_STORAGE_PATH
    
    if sub_path:
        # 规范化路径并移除任何尝试访问上级目录的部分
        safe_path = os.path.normpath(sub_path).lstrip(os.sep)
        if '..' in safe_path:
            raise HTTPException(status_code=400, detail="非法的路径")
        unified_dir = os.path.join(unified_dir, safe_path)
    
    os.makedirs(unified_dir, exist_ok=True)
    return unified_dir


def get_relative_path(base_path: str, full_path: str) -> str:
    """获取相对于基础路径的相对路径"""
    return os.path.relpath(full_path, base_path)

def get_mime_type(filename: str) -> str:
    """获取文件MIME类型"""
    ext = filename.split('.')[-1].lower() if '.' in filename else ''
    # 如果文件没有扩展名，默认作为文本文件处理
    if not ext:
        return 'text/plain'
        
    mime_map = {
        'txt': 'text/plain',
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'jsx': 'application/javascript',
        'ts': 'application/typescript',
        'tsx': 'application/typescript',
        'py': 'text/x-python',
        'md': 'text/markdown',
        'markdown': 'text/markdown',
        'sh': 'text/x-shellscript',
        'bat': 'text/x-bat',
        'cmd': 'text/x-bat',
        'ps1': 'text/x-powershell',
        'java': 'text/x-java',
        'c': 'text/x-c',
        'cpp': 'text/x-c++',
        'cc': 'text/x-c++',
        'h': 'text/x-c++',
        'hpp': 'text/x-c++',
        'c++': 'text/x-c++',
        'h++': 'text/x-c++',
        'cs': 'text/x-csharp',
        'go': 'text/x-go',
        'rs': 'text/x-rust',
        'rb': 'text/x-ruby',
        'php': 'text/x-php',
        'pl': 'text/x-perl',
        'swift': 'text/x-swift',
        'kt': 'text/x-kotlin',
        'kts': 'text/x-kotlin',
        'dart': 'text/x-dart',
        'lua': 'text/x-lua',
        'groovy': 'text/x-groovy',
        'scala': 'text/x-scala',
        'sql': 'text/x-sql',
        'r': 'text/x-r',
        'yaml': 'text/x-yaml',
        'yml': 'text/x-yaml',
        'toml': 'text/x-toml',
        'ini': 'text/plain',
        'conf': 'text/plain',
        'config': 'text/plain',
        'log': 'text/plain',
        'vue': 'text/x-vue',
        'svelte': 'text/x-svelte',
        'json': 'application/json',
        'xml': 'application/xml',
        'csv': 'text/plain',
        'tsv': 'text/tab-separated-values',
        'pdf': 'application/pdf',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'webp': 'image/webp',
        'ico': 'image/x-icon',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogv': 'video/ogg',
        'avi': 'video/x-msvideo',
        'mkv': 'video/x-matroska',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',
        'bz2': 'application/x-bzip2',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    }
    return mime_map.get(ext, 'application/octet-stream')

def should_display_inline(filename: str, mime_type: str) -> bool:
    """判断文件是否应该在浏览器中内联显示"""
    # 如果文件没有扩展名，默认内联显示
    ext = filename.split('.')[-1].lower() if '.' in filename else ''
    if not ext:
        return True
    
    # 检查MIME类型前缀
    mime_prefixes = ['text/', 'image/', 'audio/', 'video/']
    if any(mime_type.startswith(prefix) for prefix in mime_prefixes):
        return True
    
    # 检查特定的应用类型
    app_mimes = ['application/pdf', 'application/json', 'application/xml', 
                'application/javascript', 'application/typescript', 'application/csv']
    if mime_type in app_mimes:
        return True
    
    # 内联显示的文件扩展名列表
    inline_extensions = (
        # 文本文件
        'txt md markdown html htm css scss sass less '
        'js jsx ts tsx json xml yaml yml toml ini '
        'csv tsv log conf config '
        # 代码文件
        'py java c cpp cc h hpp cs php rb go rs '
        'swift kt kts dart lua groovy scala sql r '
        'sh bash zsh fish bat cmd ps1 pl pm '
        # Web开发
        'vue svelte jsx tsx graphql gql '
        # 媒体文件
        'png jpg jpeg gif svg webp ico bmp tiff '
        'mp3 wav ogg flac aac '
        'mp4 webm ogv avi mov wmv mkv '
        # 文档
        'pdf'
    ).split()
    
    return ext in inline_extensions

async def aiofile_chunks(file_path: str, start: int = 0, end: int = None, chunk_size: int = DOWNLOAD_CHUNK_SIZE):
    """异步分块读取文件"""
    file_size = os.path.getsize(file_path)
    end = end or file_size
    position = start
    
    async with aiofiles.open(file_path, "rb") as f:
        await f.seek(position)
        
        while position < end:
            read_size = min(chunk_size, end - position)
            chunk = await f.read(read_size)
            
            if not chunk:
                break
                
            position += len(chunk)
            yield chunk

def generate_file_etag(file_path: str, file_size: int, mtime: float) -> str:
    """生成文件的ETag"""
    return f'"{hashlib.md5(f"{file_path}-{file_size}-{mtime}".encode()).hexdigest()}"'

def encode_filename(filename: str) -> str:
    """编码文件名用于HTTP头"""
    return urllib.parse.quote(filename.encode('utf-8'))