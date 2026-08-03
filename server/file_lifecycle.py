"""File-system and metadata lifecycle for persisted user files."""

import os
import shutil
import tempfile
import uuid
from collections.abc import AsyncIterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import aiofiles

from sqlite_metadata_manager import FileMetadata, SQLiteMetadataManager
from utils import get_mime_type, is_safe_path


@dataclass(frozen=True)
class FileWriteOptions:
    is_public: bool = True
    content_type: Optional[str] = None
    created_by: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    description: str = ""
    notes: str = ""
    original_url: Optional[str] = None


@dataclass(frozen=True)
class StoredFile:
    path: str
    size: int
    metadata: FileMetadata


class FileLifecycleError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class FileLifecycle:
    """Owns file content, SQLite metadata, and the rollback between them."""

    def __init__(
        self,
        storage_root: str | Path,
        metadata_manager: SQLiteMetadataManager,
        *,
        max_file_size: int,
    ):
        self.storage_root = Path(storage_root).resolve()
        self.metadata_manager = metadata_manager
        self.max_file_size = max_file_size

    def _normalize_path(self, relative_path: str) -> str:
        if not relative_path or not is_safe_path(relative_path):
            raise FileLifecycleError("INVALID_PATH", "非法的文件路径")

        normalized = Path(relative_path)
        if normalized.is_absolute() or normalized == Path("."):
            raise FileLifecycleError("INVALID_PATH", "非法的文件路径")

        full_path = (self.storage_root / normalized).resolve()
        try:
            return str(full_path.relative_to(self.storage_root))
        except ValueError as error:
            raise FileLifecycleError("INVALID_PATH", "非法的文件路径") from error

    def _full_path(self, relative_path: str) -> Path:
        return self.storage_root / self._normalize_path(relative_path)

    async def _assert_parent_is_writable(self, relative_path: str) -> None:
        parent_path = str(Path(relative_path).parent)
        if parent_path != "." and await self.metadata_manager.is_directory_locked(parent_path):
            raise FileLifecycleError("DIRECTORY_LOCKED", "目标目录已被锁定")

    async def write_bytes(
        self,
        relative_path: str,
        content: bytes,
        options: Optional[FileWriteOptions] = None,
    ) -> StoredFile:
        async def chunks():
            yield content

        return await self.write_stream(relative_path, chunks(), options)

    async def write_stream(
        self,
        relative_path: str,
        chunks: AsyncIterable[bytes],
        options: Optional[FileWriteOptions] = None,
    ) -> StoredFile:
        relative_path = self._normalize_path(relative_path)
        options = options or FileWriteOptions()
        target_path = self.storage_root / relative_path
        temp_path: Optional[Path] = None
        published = False

        await self._assert_parent_is_writable(relative_path)
        if target_path.exists():
            raise FileLifecycleError("FILE_EXISTS", "文件已存在")

        target_path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(
            prefix=f".{target_path.name}.", suffix=".upload", dir=target_path.parent
        )
        os.close(fd)
        temp_path = Path(temp_name)
        size = 0

        try:
            async with aiofiles.open(temp_path, "wb") as output:
                async for chunk in chunks:
                    if not isinstance(chunk, bytes):
                        raise TypeError("文件内容必须是 bytes")
                    size += len(chunk)
                    if size > self.max_file_size:
                        raise FileLifecycleError("FILE_TOO_LARGE", "文件大小超过限制")
                    await output.write(chunk)

            os.replace(temp_path, target_path)
            temp_path = None
            published = True

            metadata = await self.metadata_manager.create_metadata(
                relative_path,
                size,
                is_public=options.is_public,
                content_type=options.content_type or get_mime_type(relative_path),
                created_by=options.created_by,
                tags=options.tags,
                description=options.description,
                notes=options.notes,
                original_url=options.original_url,
            )
            return StoredFile(path=relative_path, size=size, metadata=metadata)
        except Exception:
            if temp_path and temp_path.exists():
                temp_path.unlink()
            if published and target_path.exists():
                target_path.unlink()
            raise

    def next_available_path(self, relative_path: str) -> str:
        """Return a non-existing sibling path for adapters that preserve downloads."""
        relative_path = self._normalize_path(relative_path)
        candidate = self.storage_root / relative_path
        if not candidate.exists():
            return relative_path

        stem = candidate.stem
        suffix = candidate.suffix
        counter = 1
        while True:
            candidate = candidate.with_name(f"{stem}_{counter}{suffix}")
            if not candidate.exists():
                return str(candidate.relative_to(self.storage_root))
            counter += 1

    async def replace_bytes(
        self, relative_path: str, content: bytes, *, is_authenticated: bool
    ) -> StoredFile:
        """Replace existing content while rolling back when metadata persistence fails."""
        relative_path = self._normalize_path(relative_path)
        target_path = self.storage_root / relative_path
        if not target_path.exists() or not target_path.is_file():
            raise FileLifecycleError("FILE_NOT_FOUND", "文件不存在")
        if len(content) > self.max_file_size:
            raise FileLifecycleError("FILE_TOO_LARGE", "文件大小超过限制")

        await self._assert_can_mutate(relative_path, target_path, is_authenticated)
        metadata = await self.metadata_manager.load_metadata(relative_path)
        fd, temp_name = tempfile.mkstemp(
            prefix=f".{target_path.name}.", suffix=".upload", dir=target_path.parent
        )
        os.close(fd)
        temp_path = Path(temp_name)
        backup_path = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.backup")

        try:
            async with aiofiles.open(temp_path, "wb") as output:
                await output.write(content)

            os.replace(target_path, backup_path)
            os.replace(temp_path, target_path)

            if metadata is None:
                metadata = await self.metadata_manager.create_metadata(
                    relative_path,
                    len(content),
                    content_type=get_mime_type(relative_path),
                )
            else:
                metadata.size = len(content)
                await self.metadata_manager.save_metadata(relative_path, metadata)
        except Exception:
            if temp_path.exists():
                temp_path.unlink()
            if backup_path.exists():
                if target_path.exists():
                    target_path.unlink()
                os.replace(backup_path, target_path)
            raise
        else:
            backup_path.unlink()
            return StoredFile(path=relative_path, size=len(content), metadata=metadata)

    async def move(
        self, source_path: str, destination_path: str, *, is_authenticated: bool
    ) -> StoredFile:
        source_path = self._normalize_path(source_path)
        destination_path = self._normalize_path(destination_path)
        source = self.storage_root / source_path
        destination = self.storage_root / destination_path

        if not source.exists():
            raise FileLifecycleError("PATH_NOT_FOUND", "文件或目录不存在")
        if destination.exists():
            raise FileLifecycleError("FILE_EXISTS", "目标文件已存在")
        if source.is_dir() and destination.is_relative_to(source):
            raise FileLifecycleError("INVALID_PATH", "不能移动到自身目录中")

        await self._assert_parent_is_writable(destination_path)
        await self._assert_can_mutate(source_path, source, is_authenticated)
        destination.parent.mkdir(parents=True, exist_ok=True)
        os.replace(source, destination)

        try:
            await self.metadata_manager.move_metadata_tree(source_path, destination_path)
        except Exception:
            os.replace(destination, source)
            raise

        metadata = await self.metadata_manager.load_metadata(destination_path)
        size = destination.stat().st_size if destination.is_file() else 0
        if metadata is None:
            metadata = FileMetadata(
                filename=destination.name,
                size=size,
                upload_time="",
                last_modified="",
            )
        return StoredFile(path=destination_path, size=size, metadata=metadata)

    async def delete(self, relative_path: str, *, is_authenticated: bool) -> None:
        relative_path = self._normalize_path(relative_path)
        source = self.storage_root / relative_path
        if not source.exists():
            raise FileLifecycleError("PATH_NOT_FOUND", "文件或目录不存在")

        await self._assert_can_mutate(relative_path, source, is_authenticated)
        tombstone = source.with_name(f".{source.name}.{uuid.uuid4().hex}.delete")
        os.replace(source, tombstone)

        try:
            deleted = await self.metadata_manager.delete_metadata_tree(relative_path)
            if not deleted:
                raise RuntimeError("删除元数据失败")
        except Exception:
            os.replace(tombstone, source)
            raise

        if tombstone.is_dir():
            shutil.rmtree(tombstone)
        else:
            tombstone.unlink()

    async def _assert_can_mutate(
        self, relative_path: str, source: Path, is_authenticated: bool
    ) -> None:
        if source.is_dir():
            if await self.metadata_manager.is_directory_locked(relative_path):
                raise FileLifecycleError("DIRECTORY_LOCKED", "目录已被锁定")
            return

        access = await self.metadata_manager.check_file_access(
            relative_path, is_authenticated=is_authenticated
        )
        if access["reason"] == "private":
            raise FileLifecycleError("PERMISSION_DENIED", "没有权限修改此文件")
        if access["reason"] == "locked":
            raise FileLifecycleError("FILE_LOCKED", "文件已被锁定")


def get_file_lifecycle(storage_root: str | Path) -> FileLifecycle:
    """Build the production lifecycle around the existing filesystem and SQLite store."""
    from config import MAX_FILE_SIZE_BYTES
    from metadata_config import get_metadata_manager

    return FileLifecycle(
        storage_root,
        get_metadata_manager(str(storage_root)),
        max_file_size=MAX_FILE_SIZE_BYTES,
    )
