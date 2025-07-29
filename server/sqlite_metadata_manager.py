import os
import sqlite3
import aiosqlite
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from pathlib import Path
import json

@dataclass
class FileMetadata:
    """统一的文件元数据结构"""
    filename: str
    size: int
    upload_time: str
    last_modified: str
    is_public: bool = False
    content_type: str = "application/octet-stream"
    created_by: Optional[str] = None
    tags: List[str] = None
    description: str = ""
    notes: str = ""
    original_url: Optional[str] = None
    locked: bool = False
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'FileMetadata':
        """从字典创建实例"""
        # 处理旧格式兼容性
        if 'tags' not in data:
            data['tags'] = []
        if 'notes' not in data:
            data['notes'] = ""
        if 'description' not in data:
            data['description'] = ""
        if 'is_public' not in data:
            data['is_public'] = False
        if 'content_type' not in data:
            data['content_type'] = "application/octet-stream"
        if 'created_by' not in data:
            data['created_by'] = None
        if 'original_url' not in data:
            data['original_url'] = None
        if 'locked' not in data:
            data['locked'] = False
        
        # 只保留FileMetadata类支持的字段
        valid_fields = {
            'filename', 'size', 'upload_time', 'last_modified', 
            'is_public', 'content_type', 'created_by', 'tags', 
            'description', 'notes', 'original_url', 'locked'
        }
        filtered_data = {k: v for k, v in data.items() if k in valid_fields}
            
        return cls(**filtered_data)

class SQLiteMetadataManager:
    """基于SQLite的元数据管理器"""
    
    def __init__(self, storage_root: str, db_path: str = None):
        self.storage_root = Path(storage_root)
        self.storage_root.mkdir(parents=True, exist_ok=True)
        
        # 数据库文件路径
        if db_path is None:
            db_path = self.storage_root / "metadata.db"
        self.db_path = Path(db_path)
        
        # 初始化数据库
        self._init_database()
        
        # 清理管理器（延迟初始化）
        self._cleanup_manager = None
    
    def _init_database(self):
        """初始化数据库结构"""
        try:
            # 读取schema文件
            schema_path = Path(__file__).parent / "database_schema.sql"
            if not schema_path.exists():
                # 如果schema文件不存在，使用内嵌SQL
                schema_sql = self._get_embedded_schema()
            else:
                with open(schema_path, 'r', encoding='utf-8') as f:
                    schema_sql = f.read()
            
            # 创建数据库
            with sqlite3.connect(self.db_path) as conn:
                conn.executescript(schema_sql)
                conn.commit()
        except Exception as e:
            print(f"初始化数据库失败: {e}")
            raise
    
    def _get_embedded_schema(self) -> str:
        """获取内嵌的数据库模式"""
        return """
-- SQLite数据库模式设计
-- 文件元数据管理系统

-- 文件元数据表
CREATE TABLE IF NOT EXISTS file_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL,
    upload_time TEXT NOT NULL,
    last_modified TEXT NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 0,
    content_type TEXT DEFAULT 'application/octet-stream',
    created_by TEXT,
    description TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    original_url TEXT,
    locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 文件标签表
CREATE TABLE IF NOT EXISTS file_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES file_metadata(id) ON DELETE CASCADE,
    UNIQUE(file_id, tag)
);

-- 目录元数据表
CREATE TABLE IF NOT EXISTS directory_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    directory_path TEXT NOT NULL UNIQUE,
    is_public INTEGER,
    locked INTEGER NOT NULL DEFAULT 0,
    description TEXT DEFAULT '',
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_file_metadata_path ON file_metadata(file_path);
CREATE INDEX IF NOT EXISTS idx_file_metadata_public ON file_metadata(is_public);
CREATE INDEX IF NOT EXISTS idx_file_metadata_locked ON file_metadata(locked);
CREATE INDEX IF NOT EXISTS idx_file_metadata_created_by ON file_metadata(created_by);
CREATE INDEX IF NOT EXISTS idx_file_metadata_upload_time ON file_metadata(upload_time);
CREATE INDEX IF NOT EXISTS idx_file_tags_file_id ON file_tags(file_id);
CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag);
CREATE INDEX IF NOT EXISTS idx_directory_metadata_path ON directory_metadata(directory_path);
CREATE INDEX IF NOT EXISTS idx_directory_metadata_public ON directory_metadata(is_public);
"""
    
    async def _get_file_id(self, file_path: str) -> Optional[int]:
        """获取文件ID"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT id FROM file_metadata WHERE file_path = ?", 
                (file_path,)
            )
            row = await cursor.fetchone()
            return row[0] if row else None
    
    async def save_metadata(self, file_path: str, metadata: FileMetadata) -> None:
        """保存文件元数据"""
        now = datetime.now().isoformat()
        metadata.last_modified = now
        
        async with aiosqlite.connect(self.db_path) as db:
            # 检查是否已存在
            file_id = await self._get_file_id(file_path)
            
            if file_id:
                # 更新现有记录
                await db.execute("""
                    UPDATE file_metadata SET
                        filename = ?, size = ?, upload_time = ?, last_modified = ?,
                        is_public = ?, content_type = ?, created_by = ?,
                        description = ?, notes = ?, original_url = ?, locked = ?,
                        updated_at = ?
                    WHERE id = ?
                """, (
                    metadata.filename, metadata.size, metadata.upload_time, metadata.last_modified,
                    int(metadata.is_public), metadata.content_type, metadata.created_by,
                    metadata.description, metadata.notes, metadata.original_url, int(metadata.locked),
                    now, file_id
                ))
                
                # 更新标签
                await db.execute("DELETE FROM file_tags WHERE file_id = ?", (file_id,))
                for tag in metadata.tags:
                    await db.execute(
                        "INSERT INTO file_tags (file_id, tag, created_at) VALUES (?, ?, ?)",
                        (file_id, tag, now)
                    )
            else:
                # 插入新记录
                cursor = await db.execute("""
                    INSERT INTO file_metadata (
                        filename, file_path, size, upload_time, last_modified,
                        is_public, content_type, created_by, description, notes,
                        original_url, locked, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    metadata.filename, file_path, metadata.size, metadata.upload_time, metadata.last_modified,
                    int(metadata.is_public), metadata.content_type, metadata.created_by,
                    metadata.description, metadata.notes, metadata.original_url, int(metadata.locked),
                    now, now
                ))
                
                file_id = cursor.lastrowid
                
                # 插入标签
                for tag in metadata.tags:
                    await db.execute(
                        "INSERT INTO file_tags (file_id, tag, created_at) VALUES (?, ?, ?)",
                        (file_id, tag, now)
                    )
            
            await db.commit()
    
    async def load_metadata(self, file_path: str) -> Optional[FileMetadata]:
        """加载文件元数据"""
        async with aiosqlite.connect(self.db_path) as db:
            # 获取文件基本信息
            cursor = await db.execute("""
                SELECT filename, size, upload_time, last_modified, is_public,
                       content_type, created_by, description, notes, original_url, locked
                FROM file_metadata WHERE file_path = ?
            """, (file_path,))
            
            row = await cursor.fetchone()
            if not row:
                return None
            
            # 获取标签
            file_id = await self._get_file_id(file_path)
            tags = []
            if file_id:
                tag_cursor = await db.execute(
                    "SELECT tag FROM file_tags WHERE file_id = ? ORDER BY tag",
                    (file_id,)
                )
                tags = [tag[0] for tag in await tag_cursor.fetchall()]
            
            # 构建元数据对象
            return FileMetadata(
                filename=row[0],
                size=row[1],
                upload_time=row[2],
                last_modified=row[3],
                is_public=bool(row[4]),
                content_type=row[5],
                created_by=row[6],
                tags=tags,
                description=row[7],
                notes=row[8],
                original_url=row[9],
                locked=bool(row[10])
            )
    
    async def create_metadata(self, file_path: str, file_size: int, 
                            is_public: bool = False, content_type: str = None,
                            created_by: str = None, tags: List[str] = None,
                            description: str = "", notes: str = "", locked: bool = False) -> FileMetadata:
        """创建新的文件元数据"""
        filename = os.path.basename(file_path)
        now = datetime.now().isoformat()
        
        # 检查目录权限继承
        inherited_permission = await self.get_directory_permission(os.path.dirname(file_path))
        if inherited_permission is not None:
            is_public = inherited_permission
        
        metadata = FileMetadata(
            filename=filename,
            size=file_size,
            upload_time=now,
            last_modified=now,
            is_public=is_public,
            content_type=content_type or "application/octet-stream",
            created_by=created_by,
            tags=tags or [],
            description=description,
            notes=notes,
            locked=locked
        )
        
        await self.save_metadata(file_path, metadata)
        return metadata
    
    async def update_metadata(self, file_path: str, **updates) -> Optional[FileMetadata]:
        """更新文件元数据"""
        metadata = await self.load_metadata(file_path)
        if not metadata:
            return None
        
        # 更新指定字段
        for key, value in updates.items():
            if hasattr(metadata, key):
                setattr(metadata, key, value)
        
        await self.save_metadata(file_path, metadata)
        return metadata
    
    async def set_file_permission(self, file_path: str, is_public: bool) -> bool:
        """设置文件权限"""
        return await self.update_metadata(file_path, is_public=is_public) is not None
    
    async def get_file_permission(self, file_path: str) -> Optional[bool]:
        """获取文件权限"""
        metadata = await self.load_metadata(file_path)
        return metadata.is_public if metadata else None
    
    async def set_file_lock(self, file_path: str, locked: bool) -> bool:
        """设置文件锁定状态"""
        return await self.update_metadata(file_path, locked=locked) is not None
    
    async def get_file_lock(self, file_path: str) -> Optional[bool]:
        """获取文件锁定状态"""
        metadata = await self.load_metadata(file_path)
        return metadata.locked if metadata else None
    
    async def is_file_locked(self, file_path: str) -> bool:
        """检查文件是否被锁定"""
        metadata = await self.load_metadata(file_path)
        return metadata.locked if metadata else False
    
    async def delete_metadata(self, file_path: str) -> bool:
        """删除文件元数据"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("DELETE FROM file_metadata WHERE file_path = ?", (file_path,))
                await db.commit()
                return True
        except Exception as e:
            print(f"删除元数据失败 {file_path}: {e}")
            return False
    
    async def move_metadata(self, old_path: str, new_path: str) -> bool:
        """移动/重命名元数据"""
        try:
            filename = os.path.basename(new_path)
            now = datetime.now().isoformat()
            
            async with aiosqlite.connect(self.db_path) as db:
                result = await db.execute("""
                    UPDATE file_metadata SET 
                        file_path = ?, filename = ?, updated_at = ?
                    WHERE file_path = ?
                """, (new_path, filename, now, old_path))
                
                await db.commit()
                return result.rowcount > 0
        except Exception as e:
            print(f"移动元数据失败 {old_path} -> {new_path}: {e}")
            return False
    
    async def list_files_with_metadata(self, directory: str = "", 
                                     filter_public: Optional[bool] = None,
                                     user_can_access_private: bool = False) -> List[Dict[str, Any]]:
        """列出目录下的文件及其元数据"""
        dir_path = self.storage_root / directory if directory else self.storage_root
        
        if not dir_path.exists() or not dir_path.is_dir():
            return []
        
        files_with_metadata = []
        
        try:
            async with aiosqlite.connect(self.db_path) as db:
                for item in dir_path.iterdir():
                    # 跳过数据库文件和其他系统文件
                    if item.name in ['.DS_Store', 'metadata.db'] or item.name.endswith('.meta'):
                        continue
                    
                    # 计算相对路径
                    try:
                        relative_path = item.relative_to(self.storage_root)
                    except ValueError:
                        relative_path = Path(item.name)
                    
                    if item.is_file():
                        # 处理文件
                        metadata = await self.load_metadata(str(relative_path))
                        
                        # 如果没有元数据，创建默认元数据
                        if not metadata:
                            try:
                                file_size = item.stat().st_size
                                metadata = await self.create_metadata(
                                    str(relative_path), 
                                    file_size, 
                                    is_public=False
                                )
                            except OSError:
                                continue
                        
                        # 权限过滤
                        if filter_public is not None and metadata.is_public != filter_public:
                            continue
                        
                        # 私有文件权限检查
                        if not metadata.is_public and not user_can_access_private:
                            continue
                        
                        # 获取文件统计信息
                        try:
                            stat = item.stat()
                            file_info = {
                                "filename": str(relative_path),
                                "display_name": item.name,
                                "type": "file",
                                "size": stat.st_size,
                                "modified_time": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                                "upload_time": metadata.upload_time,
                                "is_public": metadata.is_public,
                                "content_type": metadata.content_type,
                                "tags": metadata.tags,
                                "description": metadata.description,
                                "notes": metadata.notes,
                                "created_by": metadata.created_by,
                                "locked": metadata.locked,
                                "download_url": f"/{relative_path}"
                            }
                            files_with_metadata.append(file_info)
                        except OSError:
                            continue
                            
                    elif item.is_dir():
                        # 处理目录
                        try:
                            stat = item.stat()
                            dir_permission = await self.get_directory_permission(str(relative_path))
                            is_public = dir_permission if dir_permission is not None else True
                            
                            dir_locked = await self.get_directory_lock(str(relative_path))
                            
                            # 权限过滤
                            if filter_public is not None and is_public != filter_public:
                                continue
                            
                            # 私有目录权限检查
                            if not is_public and not user_can_access_private:
                                continue
                            
                            dir_info = {
                                "filename": str(relative_path),
                                "display_name": item.name,
                                "type": "directory",
                                "size": 0,
                                "modified_time": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                                "upload_time": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                                "is_public": is_public,
                                "content_type": "directory",
                                "tags": [],
                                "description": "",
                                "notes": "",
                                "created_by": None,
                                "locked": dir_locked
                            }
                            files_with_metadata.append(dir_info)
                        except OSError:
                            continue
        
        except OSError as e:
            print(f"列出目录失败 {dir_path}: {e}")
        
        return files_with_metadata
    
    async def search_files(self, query: str, 
                          filter_public: Optional[bool] = None,
                          user_can_access_private: bool = False) -> List[Dict[str, Any]]:
        """搜索文件（使用简单搜索）"""
        return await self._simple_search(query, filter_public, user_can_access_private)
    
    async def _simple_search(self, query: str, filter_public: Optional[bool], 
                           user_can_access_private: bool) -> List[Dict[str, Any]]:
        """简单搜索（降级方案）"""
        all_files = await self.list_files_with_metadata(
            directory="", 
            filter_public=filter_public,
            user_can_access_private=user_can_access_private
        )
        
        query_lower = query.lower()
        matched_files = []
        
        for file_info in all_files:
            # 搜索文件名
            if query_lower in file_info["display_name"].lower():
                matched_files.append(file_info)
                continue
            
            # 搜索标签
            if any(query_lower in tag.lower() for tag in file_info.get("tags", [])):
                matched_files.append(file_info)
                continue
            
            # 搜索描述
            if query_lower in file_info.get("description", "").lower():
                matched_files.append(file_info)
                continue
            
            # 搜索笔记
            if query_lower in file_info.get("notes", "").lower():
                matched_files.append(file_info)
                continue
        
        return matched_files
    
    # ============= 目录权限管理 =============
    
    async def get_directory_permission(self, directory_path: str) -> Optional[bool]:
        """获取目录权限设置，支持权限继承"""
        if not directory_path or directory_path == ".":
            return None
        
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT is_public FROM directory_metadata WHERE directory_path = ?",
                (directory_path,)
            )
            row = await cursor.fetchone()
            
            if row and row[0] is not None:
                return bool(row[0])
        
        # 递归检查父目录权限
        parent_dir = str(Path(directory_path).parent)
        if parent_dir != directory_path:
            return await self.get_directory_permission(parent_dir)
        
        return None
    
    async def set_directory_permission(self, directory_path: str, is_public: bool, 
                                     apply_to_children: bool = False) -> bool:
        """设置目录权限"""
        if not directory_path or directory_path == ".":
            return False
        
        try:
            # 确保目录存在
            dir_full_path = self.storage_root / directory_path
            if not dir_full_path.exists() or not dir_full_path.is_dir():
                return False
            
            now = datetime.now().isoformat()
            
            async with aiosqlite.connect(self.db_path) as db:
                # 检查是否已存在记录
                cursor = await db.execute(
                    "SELECT id FROM directory_metadata WHERE directory_path = ?",
                    (directory_path,)
                )
                row = await cursor.fetchone()
                
                if row:
                    # 更新现有记录
                    await db.execute("""
                        UPDATE directory_metadata SET
                            is_public = ?, updated_at = ?
                        WHERE directory_path = ?
                    """, (int(is_public), now, directory_path))
                else:
                    # 插入新记录
                    await db.execute("""
                        INSERT INTO directory_metadata 
                        (directory_path, is_public, created_at, updated_at)
                        VALUES (?, ?, ?, ?)
                    """, (directory_path, int(is_public), now, now))
                
                await db.commit()
            
            # 如果需要应用到子文件和子目录
            if apply_to_children:
                await self._apply_permission_to_children(directory_path, is_public)
            
            return True
        
        except Exception as e:
            print(f"设置目录权限失败 {directory_path}: {e}")
            return False
    
    async def _apply_permission_to_children(self, directory_path: str, is_public: bool):
        """递归应用权限到所有子文件和子目录"""
        try:
            dir_full_path = self.storage_root / directory_path
            
            for item in dir_full_path.rglob("*"):
                if item.name in ['.DS_Store', 'metadata.db'] or item.name.endswith('.meta'):
                    continue
                
                # 计算相对路径
                try:
                    relative_path = item.relative_to(self.storage_root)
                except ValueError:
                    continue
                
                if item.is_file():
                    # 更新文件权限
                    await self.set_file_permission(str(relative_path), is_public)
                elif item.is_dir():
                    # 更新子目录权限
                    await self.set_directory_permission(str(relative_path), is_public, apply_to_children=False)
        
        except Exception as e:
            print(f"应用权限到子项目失败 {directory_path}: {e}")
    
    async def get_directory_info(self, directory_path: str) -> Dict[str, Any]:
        """获取目录信息，包括权限设置"""
        if not directory_path:
            directory_path = "."
        
        dir_full_path = self.storage_root / directory_path
        if not dir_full_path.exists() or not dir_full_path.is_dir():
            return {}
        
        # 获取目录权限
        permission = await self.get_directory_permission(directory_path)
        
        # 统计子项目
        try:
            items = list(dir_full_path.iterdir())
            file_count = sum(1 for item in items 
                           if item.is_file() and item.name not in ['.DS_Store', 'metadata.db'] 
                           and not item.name.endswith('.meta'))
            dir_count = sum(1 for item in items if item.is_dir())
            
            return {
                "path": directory_path,
                "is_public": permission,
                "has_permission_setting": permission is not None,
                "file_count": file_count,
                "directory_count": dir_count,
                "total_items": file_count + dir_count
            }
        except Exception as e:
            print(f"获取目录信息失败 {directory_path}: {e}")
            return {"path": directory_path, "is_public": permission}
    
    # ============= 目录锁定管理 =============
    
    async def set_directory_lock(self, directory_path: str, locked: bool, 
                               apply_to_children: bool = False) -> bool:
        """设置目录锁定状态"""
        if not directory_path or directory_path == ".":
            return False
        
        try:
            # 确保目录存在
            dir_full_path = self.storage_root / directory_path
            if not dir_full_path.exists() or not dir_full_path.is_dir():
                return False
            
            now = datetime.now().isoformat()
            
            async with aiosqlite.connect(self.db_path) as db:
                # 检查是否已存在记录
                cursor = await db.execute(
                    "SELECT id FROM directory_metadata WHERE directory_path = ?",
                    (directory_path,)
                )
                row = await cursor.fetchone()
                
                if row:
                    # 更新现有记录
                    await db.execute("""
                        UPDATE directory_metadata SET
                            locked = ?, updated_at = ?
                        WHERE directory_path = ?
                    """, (int(locked), now, directory_path))
                else:
                    # 插入新记录
                    await db.execute("""
                        INSERT INTO directory_metadata 
                        (directory_path, locked, created_at, updated_at)
                        VALUES (?, ?, ?, ?)
                    """, (directory_path, int(locked), now, now))
                
                await db.commit()
            
            # 如果需要应用到子文件和子目录
            if apply_to_children:
                await self._apply_lock_to_children(directory_path, locked)
            
            return True
        
        except Exception as e:
            print(f"设置目录锁定失败 {directory_path}: {e}")
            return False
    
    async def get_directory_lock(self, directory_path: str) -> Optional[bool]:
        """获取目录锁定状态"""
        if not directory_path or directory_path == ".":
            return None
        
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT locked FROM directory_metadata WHERE directory_path = ?",
                (directory_path,)
            )
            row = await cursor.fetchone()
            return bool(row[0]) if row else False
    
    async def is_directory_locked(self, directory_path: str) -> bool:
        """检查目录是否被锁定"""
        lock_status = await self.get_directory_lock(directory_path)
        return lock_status if lock_status is not None else False
    
    async def _apply_lock_to_children(self, directory_path: str, locked: bool):
        """递归应用锁定状态到所有子文件和子目录"""
        try:
            dir_full_path = self.storage_root / directory_path
            
            for item in dir_full_path.rglob("*"):
                if item.name in ['.DS_Store', 'metadata.db'] or item.name.endswith('.meta'):
                    continue
                
                # 计算相对路径
                try:
                    relative_path = item.relative_to(self.storage_root)
                except ValueError:
                    continue
                
                if item.is_file():
                    # 更新文件锁定状态
                    await self.set_file_lock(str(relative_path), locked)
                elif item.is_dir():
                    # 更新子目录锁定状态
                    await self.set_directory_lock(str(relative_path), locked, apply_to_children=False)
        
        except Exception as e:
            print(f"应用锁定状态到子项目失败 {directory_path}: {e}")
    
    async def get_cleanup_manager(self):
        """获取清理管理器（延迟初始化）"""
        if self._cleanup_manager is None:
            # 延迟导入避免循环依赖
            from metadata_cleanup_manager import MetadataCleanupManager
            self._cleanup_manager = MetadataCleanupManager(self)
            await self._cleanup_manager.initialize()
        return self._cleanup_manager
    
    async def cleanup_orphan_metadata(self, dry_run: bool = False):
        """清理孤儿元数据的便捷方法"""
        cleanup_manager = await self.get_cleanup_manager()
        return await cleanup_manager.cleanup_orphan_metadata(dry_run=dry_run)
    
    async def check_metadata_consistency(self):
        """检查元数据一致性的便捷方法"""
        cleanup_manager = await self.get_cleanup_manager()
        return await cleanup_manager.check_consistency()
    
    async def start_auto_cleanup(self):
        """启动自动清理"""
        cleanup_manager = await self.get_cleanup_manager()
        # 启动后台任务
        import asyncio
        asyncio.create_task(cleanup_manager.start_scheduled_cleanup())
    
    async def stop_auto_cleanup(self):
        """停止自动清理"""
        if self._cleanup_manager:
            self._cleanup_manager.stop_scheduled_cleanup()


# 全局元数据管理器实例
_metadata_manager: Optional[SQLiteMetadataManager] = None

def get_metadata_manager(storage_root: str = None) -> SQLiteMetadataManager:
    """获取全局元数据管理器实例"""
    global _metadata_manager
    if _metadata_manager is None or (storage_root and str(_metadata_manager.storage_root) != storage_root):
        _metadata_manager = SQLiteMetadataManager(storage_root or "./storage/files")
    return _metadata_manager