"""
元数据管理器配置文件
用于控制使用哪种元数据存储方式
"""

import os
from typing import Union

# 配置选项
USE_SQLITE_METADATA = os.getenv("USE_SQLITE_METADATA", "true").lower() == "true"
SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", None)  # None表示使用默认路径

def get_metadata_manager(storage_root: str = None) -> Union['SQLiteMetadataManager', 'MetadataManager']:
    """
    获取元数据管理器实例
    
    根据配置返回SQLite或JSON文件管理器
    """
    if USE_SQLITE_METADATA:
        from sqlite_metadata_manager import get_metadata_manager as get_sqlite_manager
        return get_sqlite_manager(storage_root)
    else:
        from metadata_manager import get_metadata_manager as get_json_manager
        return get_json_manager(storage_root)