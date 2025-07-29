import os
import json
import aiofiles
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from pathlib import Path

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
    notes: str = ""  # 用户笔记字段
    original_url: Optional[str] = None  # URL下载来源
    locked: bool = False  # 锁定状态
    
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
            data['is_public'] = False  # 默认私有
        if 'content_type' not in data:
            data['content_type'] = "application/octet-stream"
        if 'created_by' not in data:
            data['created_by'] = None
        if 'original_url' not in data:
            data['original_url'] = None
        if 'locked' not in data:
            data['locked'] = False  # 默认未锁定
        
        # 只保留FileMetadata类支持的字段，过滤额外字段
        valid_fields = {
            'filename', 'size', 'upload_time', 'last_modified', 
            'is_public', 'content_type', 'created_by', 'tags', 
            'description', 'notes', 'original_url', 'locked'
        }
        filtered_data = {k: v for k, v in data.items() if k in valid_fields}
            
        return cls(**filtered_data)

class MetadataManager:
    """统一的元数据管理器"""
    
    def __init__(self, storage_root: str):
        self.storage_root = Path(storage_root)
        # 确保存储目录存在
        self.storage_root.mkdir(parents=True, exist_ok=True)
    
    def get_metadata_path(self, file_path: str) -> Path:
        """获取元数据文件路径"""
        file_path = Path(file_path)
        if file_path.is_absolute():
            # 如果是绝对路径，获取相对于storage_root的路径
            try:
                relative_path = file_path.relative_to(self.storage_root)
            except ValueError:
                # 如果不在storage_root下，使用文件名
                relative_path = file_path.name
        else:
            relative_path = file_path
        
        full_file_path = self.storage_root / relative_path
        return Path(str(full_file_path) + ".meta")
    
    async def save_metadata(self, file_path: str, metadata: FileMetadata) -> None:
        """保存文件元数据"""
        meta_path = self.get_metadata_path(file_path)
        
        # 确保元数据文件的目录存在
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 更新修改时间
        metadata.last_modified = datetime.now().isoformat()
        
        async with aiofiles.open(meta_path, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(metadata.to_dict(), ensure_ascii=False, indent=2))
    
    async def load_metadata(self, file_path: str) -> Optional[FileMetadata]:
        """加载文件元数据"""
        meta_path = self.get_metadata_path(file_path)
        
        if not meta_path.exists():
            return None
        
        try:
            async with aiofiles.open(meta_path, 'r', encoding='utf-8') as f:
                content = await f.read()
                data = json.loads(content)
                return FileMetadata.from_dict(data)
        except (json.JSONDecodeError, FileNotFoundError, KeyError) as e:
            print(f"加载元数据失败 {meta_path}: {e}")
            return None
    
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
        metadata = await self.load_metadata(file_path)
        if not metadata:
            return False
        
        metadata.is_public = is_public
        await self.save_metadata(file_path, metadata)
        return True
    
    async def get_file_permission(self, file_path: str) -> Optional[bool]:
        """获取文件权限"""
        metadata = await self.load_metadata(file_path)
        return metadata.is_public if metadata else None
    
    async def set_file_lock(self, file_path: str, locked: bool) -> bool:
        """设置文件锁定状态"""
        metadata = await self.load_metadata(file_path)
        if not metadata:
            return False
        
        metadata.locked = locked
        await self.save_metadata(file_path, metadata)
        return True
    
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
        meta_path = self.get_metadata_path(file_path)
        try:
            if meta_path.exists():
                meta_path.unlink()
                return True
        except OSError as e:
            print(f"删除元数据失败 {meta_path}: {e}")
        return False
    
    async def move_metadata(self, old_path: str, new_path: str) -> bool:
        """移动/重命名元数据文件"""
        old_meta_path = self.get_metadata_path(old_path)
        new_meta_path = self.get_metadata_path(new_path)
        
        try:
            if old_meta_path.exists():
                # 确保新元数据文件的目录存在
                new_meta_path.parent.mkdir(parents=True, exist_ok=True)
                
                # 先读取元数据，更新文件名，再保存到新位置
                metadata = await self.load_metadata(old_path)
                if metadata:
                    metadata.filename = os.path.basename(new_path)
                    await self.save_metadata(new_path, metadata)
                    # 删除旧的元数据文件
                    old_meta_path.unlink()
                    return True
                else:
                    # 如果无法读取元数据，直接移动文件
                    old_meta_path.rename(new_meta_path)
                    return True
        except OSError as e:
            print(f"移动元数据失败 {old_meta_path} -> {new_meta_path}: {e}")
        return False
    
    async def list_files_with_metadata(self, directory: str = "", 
                                     filter_public: Optional[bool] = None,
                                     user_can_access_private: bool = False) -> List[Dict[str, Any]]:
        """列出目录下的文件及其元数据
        
        Args:
            directory: 要列出的目录路径（相对于storage_root）
            filter_public: None=所有文件，True=仅公有文件，False=仅私有文件
            user_can_access_private: 用户是否可以访问私有文件
        """
        dir_path = self.storage_root / directory if directory else self.storage_root
        
        if not dir_path.exists() or not dir_path.is_dir():
            return []
        
        files_with_metadata = []
        
        try:
            for item in dir_path.iterdir():
                # 跳过元数据文件
                if item.name.endswith('.meta'):
                    continue
                
                # 计算相对路径
                try:
                    relative_path = item.relative_to(self.storage_root)
                except ValueError:
                    relative_path = Path(item.name)
                
                if item.is_file():
                    # 加载元数据
                    metadata = await self.load_metadata(str(relative_path))
                    
                    # 如果没有元数据，创建默认元数据
                    if not metadata:
                        try:
                            file_size = item.stat().st_size
                            metadata = await self.create_metadata(
                                str(relative_path), 
                                file_size, 
                                is_public=False  # 默认私有
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
                            "download_url": f"/{relative_path}"  # 这里可能需要根据实际API调整
                        }
                        files_with_metadata.append(file_info)
                    except OSError:
                        continue
                        
                elif item.is_dir():
                    # 目录处理 - 获取真实的目录权限和锁定状态
                    try:
                        stat = item.stat()
                        # 获取目录的实际权限设置
                        dir_permission = await self.get_directory_permission(str(relative_path))
                        # 如果没有明确设置权限，则默认为公有
                        is_public = dir_permission if dir_permission is not None else True
                        
                        # 获取目录的锁定状态
                        dir_locked = await self.get_directory_lock(str(relative_path))
                        
                        # 权限过滤 - 检查目录是否应该显示
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
                            "locked": dir_locked  # 从元数据中获取实际锁定状态
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
        """搜索文件（按文件名、标签、描述、笔记）"""
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
            return None  # 根目录没有权限设置
        
        dir_meta_path = self.get_metadata_path(directory_path + "/.directory")
        
        # 检查当前目录是否有权限设置
        if dir_meta_path.exists():
            try:
                async with aiofiles.open(dir_meta_path, 'r', encoding='utf-8') as f:
                    content = await f.read()
                    data = json.loads(content)
                    return data.get('is_public')
            except:
                pass
        
        # 递归检查父目录权限
        parent_dir = str(Path(directory_path).parent)
        if parent_dir != directory_path:  # 避免无限递归
            return await self.get_directory_permission(parent_dir)
        
        return None  # 没有找到权限设置
    
    async def set_directory_permission(self, directory_path: str, is_public: bool, 
                                     apply_to_children: bool = False) -> bool:
        """设置目录权限"""
        if not directory_path or directory_path == ".":
            return False  # 不能设置根目录权限
        
        try:
            # 确保目录存在
            dir_full_path = self.storage_root / directory_path
            if not dir_full_path.exists() or not dir_full_path.is_dir():
                return False
            
            # 获取现有的目录元数据或创建新的
            dir_meta_path = self.get_metadata_path(directory_path + "/.directory")
            dir_meta_data = {}
            
            # 尝试加载现有元数据
            if dir_meta_path.exists():
                try:
                    async with aiofiles.open(dir_meta_path, 'r', encoding='utf-8') as f:
                        content = await f.read()
                        dir_meta_data = json.loads(content)
                except:
                    pass
            
            # 更新权限
            dir_meta_data.update({
                "is_public": is_public,
                "type": "directory",
                "created_at": dir_meta_data.get("created_at", datetime.now().isoformat()),
                "updated_at": datetime.now().isoformat(),
                "description": f"目录权限设置 - {'公开' if is_public else '私有'}",
                "locked": dir_meta_data.get("locked", False)  # 保留现有锁定状态
            })
            
            dir_meta_path.parent.mkdir(parents=True, exist_ok=True)
            
            async with aiofiles.open(dir_meta_path, 'w', encoding='utf-8') as f:
                await f.write(json.dumps(dir_meta_data, ensure_ascii=False, indent=2))
            
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
                if item.name.endswith('.meta') or item.name == '.directory':
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
            file_count = sum(1 for item in items if item.is_file() and not item.name.endswith('.meta'))
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
    
    async def create_directory_with_permission(self, directory_path: str, created_by: str = None) -> bool:
        """创建目录并设置权限继承"""
        try:
            # 确保目录存在
            dir_full_path = self.storage_root / directory_path
            dir_full_path.mkdir(parents=True, exist_ok=True)
            
            # 检查父目录权限并继承
            parent_dir = str(Path(directory_path).parent)
            if parent_dir != directory_path and parent_dir != ".":
                parent_permission = await self.get_directory_permission(parent_dir)
                if parent_permission is not None:
                    # 继承父目录权限
                    await self.set_directory_permission(directory_path, parent_permission, apply_to_children=False)
            
            return True
        except Exception as e:
            print(f"创建目录失败 {directory_path}: {e}")
            return False
    
    async def ensure_directory_permission_inheritance(self, file_path: str) -> Optional[bool]:
        """确保新创建的文件/目录继承正确的权限"""
        directory_path = os.path.dirname(file_path)
        if directory_path and directory_path != ".":
            return await self.get_directory_permission(directory_path)
        return None
    
    # ============= 目录锁定管理 =============
    
    async def set_directory_lock(self, directory_path: str, locked: bool, 
                               apply_to_children: bool = False) -> bool:
        """设置目录锁定状态"""
        if not directory_path or directory_path == ".":
            return False  # 不能锁定根目录
        
        try:
            # 确保目录存在
            dir_full_path = self.storage_root / directory_path
            if not dir_full_path.exists() or not dir_full_path.is_dir():
                return False
            
            # 获取现有的目录元数据或创建新的
            dir_meta_path = self.get_metadata_path(directory_path + "/.directory")
            dir_meta_data = {}
            
            # 尝试加载现有元数据
            if dir_meta_path.exists():
                try:
                    async with aiofiles.open(dir_meta_path, 'r', encoding='utf-8') as f:
                        content = await f.read()
                        dir_meta_data = json.loads(content)
                except:
                    pass
            
            # 更新锁定状态
            dir_meta_data.update({
                "locked": locked,
                "type": "directory",
                "created_at": dir_meta_data.get("created_at", datetime.now().isoformat()),  
                "updated_at": datetime.now().isoformat(),
                "is_public": dir_meta_data.get("is_public", True),  # 保留现有权限
                "description": dir_meta_data.get("description", f"目录{'锁定' if locked else '解锁'}")
            })
            
            dir_meta_path.parent.mkdir(parents=True, exist_ok=True)
            
            async with aiofiles.open(dir_meta_path, 'w', encoding='utf-8') as f:
                await f.write(json.dumps(dir_meta_data, ensure_ascii=False, indent=2))
            
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
        
        dir_meta_path = self.get_metadata_path(directory_path + "/.directory")
        
        if dir_meta_path.exists():
            try:
                async with aiofiles.open(dir_meta_path, 'r', encoding='utf-8') as f:
                    content = await f.read()
                    data = json.loads(content)
                    return data.get('locked', False)  # 默认未锁定
            except:
                pass
        
        return False  # 默认未锁定
    
    async def is_directory_locked(self, directory_path: str) -> bool:
        """检查目录是否被锁定"""
        lock_status = await self.get_directory_lock(directory_path)
        return lock_status if lock_status is not None else False
    
    async def _apply_lock_to_children(self, directory_path: str, locked: bool):
        """递归应用锁定状态到所有子文件和子目录"""
        try:
            dir_full_path = self.storage_root / directory_path
            
            for item in dir_full_path.rglob("*"):
                if item.name.endswith('.meta') or item.name == '.directory':
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

# 全局元数据管理器实例
_metadata_manager: Optional[MetadataManager] = None

def get_metadata_manager(storage_root: str = None) -> MetadataManager:
    """获取全局元数据管理器实例"""
    global _metadata_manager
    if _metadata_manager is None or (storage_root and str(_metadata_manager.storage_root) != storage_root):
        _metadata_manager = MetadataManager(storage_root or "./storage/files")
    return _metadata_manager