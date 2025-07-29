"""
文件服务器模块

一个基于FastAPI的文件服务器，支持文件上传、下载、管理等功能。

主要特性：
- 文件上传下载
- 分片上传支持
- 断点续传
- 文件管理（列表、删除、重命名等）
- 基于令牌的认证
- 文件内联显示支持
"""

__version__ = "2.0.0"
__author__ = "File Server Team"

from .main import app
from .config import *
from .models import FileResponse

__all__ = ["app", "FileResponse"]