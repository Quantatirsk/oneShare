import asyncio
from pathlib import Path

import pytest

from file_lifecycle import FileLifecycle, FileLifecycleError, FileWriteOptions
from sqlite_metadata_manager import SQLiteMetadataManager


def run(coroutine):
    return asyncio.run(coroutine)


def create_lifecycle(tmp_path: Path, manager_class=SQLiteMetadataManager):
    storage_root = tmp_path / "storage"
    storage_root.mkdir()
    metadata_manager = manager_class(storage_root)
    return storage_root, metadata_manager, FileLifecycle(storage_root, metadata_manager, max_file_size=8)


def test_write_commits_content_and_inherited_metadata(tmp_path: Path):
    async def scenario():
        storage_root, metadata_manager, lifecycle = create_lifecycle(tmp_path)
        (storage_root / "private").mkdir()
        assert await metadata_manager.set_directory_permission("private", False)

        stored = await lifecycle.write_bytes(
            "private/report.txt",
            b"hello",
            FileWriteOptions(
                is_public=True,
                content_type="text/plain",
                created_by="user-1",
                tags=["report"],
                description="weekly report",
                original_url="https://example.test/report",
            ),
        )

        assert stored.path == "private/report.txt"
        assert stored.size == 5
        assert (storage_root / "private/report.txt").read_bytes() == b"hello"

        metadata = await metadata_manager.load_metadata("private/report.txt")
        assert metadata is not None
        assert metadata.is_public is False
        assert metadata.tags == ["report"]
        assert metadata.original_url == "https://example.test/report"

    run(scenario())


def test_write_failure_leaves_no_content_or_metadata(tmp_path: Path):
    async def scenario():
        storage_root, metadata_manager, lifecycle = create_lifecycle(tmp_path)

        with pytest.raises(FileLifecycleError) as error:
            await lifecycle.write_bytes("too-large.txt", b"123456789")

        assert error.value.code == "FILE_TOO_LARGE"
        assert not (storage_root / "too-large.txt").exists()
        assert await metadata_manager.load_metadata("too-large.txt") is None
        assert not list(storage_root.glob(".*.upload"))

    run(scenario())


def test_retry_does_not_overwrite_a_completed_file(tmp_path: Path):
    async def scenario():
        storage_root, metadata_manager, lifecycle = create_lifecycle(tmp_path)
        await lifecycle.write_bytes("report.txt", b"first")

        with pytest.raises(FileLifecycleError) as error:
            await lifecycle.write_bytes("report.txt", b"second")

        assert error.value.code == "FILE_EXISTS"
        assert (storage_root / "report.txt").read_bytes() == b"first"
        metadata = await metadata_manager.load_metadata("report.txt")
        assert metadata is not None
        assert metadata.size == 5

    run(scenario())


def test_metadata_failure_rolls_back_published_content(tmp_path: Path):
    class FailingMetadataManager(SQLiteMetadataManager):
        async def create_metadata(self, *args, **kwargs):
            raise RuntimeError("database unavailable")

    async def scenario():
        storage_root, _, lifecycle = create_lifecycle(tmp_path, FailingMetadataManager)

        with pytest.raises(RuntimeError, match="database unavailable"):
            await lifecycle.write_bytes("report.txt", b"hello")

        assert not (storage_root / "report.txt").exists()
        assert not list(storage_root.glob(".*.upload"))

    run(scenario())


def test_locked_directory_rejects_write(tmp_path: Path):
    async def scenario():
        storage_root, metadata_manager, lifecycle = create_lifecycle(tmp_path)
        (storage_root / "locked").mkdir()
        assert await metadata_manager.set_directory_lock("locked", True)

        with pytest.raises(FileLifecycleError) as error:
            await lifecycle.write_bytes("locked/report.txt", b"hello")

        assert error.value.code == "DIRECTORY_LOCKED"
        assert not (storage_root / "locked/report.txt").exists()

    run(scenario())


def test_move_and_delete_keep_filesystem_and_metadata_together(tmp_path: Path):
    async def scenario():
        storage_root, metadata_manager, lifecycle = create_lifecycle(tmp_path)
        await lifecycle.write_bytes("source.txt", b"hello")

        moved = await lifecycle.move("source.txt", "archive/moved.txt", is_authenticated=True)
        assert moved.path == "archive/moved.txt"
        assert not (storage_root / "source.txt").exists()
        assert (storage_root / "archive/moved.txt").read_bytes() == b"hello"
        assert await metadata_manager.load_metadata("source.txt") is None
        assert await metadata_manager.load_metadata("archive/moved.txt") is not None

        await lifecycle.delete("archive/moved.txt", is_authenticated=True)
        assert not (storage_root / "archive/moved.txt").exists()
        assert await metadata_manager.load_metadata("archive/moved.txt") is None

    run(scenario())


def test_directory_move_and_delete_keep_descendant_metadata_together(tmp_path: Path):
    async def scenario():
        storage_root, metadata_manager, lifecycle = create_lifecycle(tmp_path)
        (storage_root / "source").mkdir()
        assert await metadata_manager.set_directory_permission("source", False)
        await lifecycle.write_bytes("source/nested.txt", b"hello")

        await lifecycle.move("source", "archive", is_authenticated=True)
        assert (storage_root / "archive/nested.txt").read_bytes() == b"hello"
        assert await metadata_manager.load_metadata("source/nested.txt") is None
        assert await metadata_manager.load_metadata("archive/nested.txt") is not None
        assert await metadata_manager.get_directory_permission("archive") is False

        await lifecycle.delete("archive", is_authenticated=True)
        assert not (storage_root / "archive").exists()
        assert await metadata_manager.load_metadata("archive/nested.txt") is None
        assert await metadata_manager.get_directory_permission("archive") is None

    run(scenario())


def test_replace_rolls_back_content_when_metadata_update_fails(tmp_path: Path):
    async def scenario():
        storage_root, metadata_manager, lifecycle = create_lifecycle(tmp_path)
        await lifecycle.write_bytes("report.txt", b"hello")

        async def reject_save(*args, **kwargs):
            raise RuntimeError("database unavailable")

        metadata_manager.save_metadata = reject_save
        with pytest.raises(RuntimeError, match="database unavailable"):
            await lifecycle.replace_bytes("report.txt", b"updated", is_authenticated=True)

        assert (storage_root / "report.txt").read_bytes() == b"hello"
        metadata = await metadata_manager.load_metadata("report.txt")
        assert metadata is not None
        assert metadata.size == 5
        assert not list(storage_root.glob(".*.backup"))

    run(scenario())
