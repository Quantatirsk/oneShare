"""
元数据管理器配置
SQLite 是当前唯一存储后端。
"""

from sqlite_metadata_manager import get_metadata_manager

__all__ = ["get_metadata_manager"]
