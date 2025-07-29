#!/usr/bin/env python3
"""
SQLite元数据自动清理管理器
"""

import os
import time
import json
import asyncio
import aiosqlite
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Set
from pathlib import Path
from dataclasses import dataclass

from sqlite_metadata_manager import SQLiteMetadataManager


@dataclass
class CleanupResult:
    """清理结果"""
    cleanup_type: str
    files_checked: int
    orphans_found: int
    orphans_cleaned: int
    errors: int
    start_time: str
    end_time: str
    details: Dict[str, Any]
    duration: float


@dataclass
class CleanupConfig:
    """清理配置"""
    enabled: bool = True
    grace_period: int = 300  # 宽限期（秒）
    batch_size: int = 100
    scan_interval: int = 3600  # 扫描间隔（秒）
    max_orphans_per_run: int = 1000
    backup_before_cleanup: bool = True
    exclude_patterns: List[str] = None

    def __post_init__(self):
        if self.exclude_patterns is None:
            self.exclude_patterns = [".tmp", ".lock", ".temp", "~", "metadata_backup_", ".bak"]


class MetadataCleanupManager:
    """元数据清理管理器"""

    def __init__(self, metadata_manager: SQLiteMetadataManager):
        self.metadata_manager = metadata_manager
        self.storage_root = metadata_manager.storage_root
        self.db_path = metadata_manager.db_path
        self.config = CleanupConfig()
        self._running = False
        self._last_cleanup = None

    async def initialize(self):
        """初始化清理管理器"""
        await self._init_cleanup_tables()
        await self._load_config()

    async def _init_cleanup_tables(self):
        """初始化清理相关数据表"""
        async with aiosqlite.connect(self.db_path) as db:
            # 创建清理日志表
            await db.execute("""
                CREATE TABLE IF NOT EXISTS cleanup_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cleanup_type TEXT NOT NULL,
                    files_checked INTEGER NOT NULL,
                    orphans_found INTEGER NOT NULL,
                    orphans_cleaned INTEGER NOT NULL,
                    errors INTEGER NOT NULL DEFAULT 0,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    duration REAL NOT NULL,
                    details TEXT
                )
            """)

            # 创建清理配置表
            await db.execute("""
                CREATE TABLE IF NOT EXISTS cleanup_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    description TEXT,
                    updated_at TEXT NOT NULL
                )
            """)

            await db.commit()

    async def _load_config(self):
        """加载清理配置"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("SELECT key, value FROM cleanup_config")
                config_rows = await cursor.fetchall()

                config_dict = {row[0]: row[1] for row in config_rows}

                if config_dict:
                    # 更新配置
                    self.config.enabled = config_dict.get("enabled", "true").lower() == "true"
                    self.config.grace_period = int(config_dict.get("grace_period", "300"))
                    self.config.batch_size = int(config_dict.get("batch_size", "100"))
                    self.config.scan_interval = int(config_dict.get("scan_interval", "3600"))
                    self.config.max_orphans_per_run = int(config_dict.get("max_orphans_per_run", "1000"))
                    self.config.backup_before_cleanup = config_dict.get("backup_before_cleanup", "true").lower() == "true"
                    
                    exclude_patterns = config_dict.get("exclude_patterns")
                    if exclude_patterns:
                        self.config.exclude_patterns = json.loads(exclude_patterns)
                else:
                    # 保存默认配置
                    await self._save_config()

        except Exception as e:
            print(f"加载清理配置失败: {e}")

    async def _save_config(self):
        """保存清理配置"""
        now = datetime.now().isoformat()
        config_items = [
            ("enabled", str(self.config.enabled).lower(), "是否启用自动清理"),
            ("grace_period", str(self.config.grace_period), "宽限期（秒）"),
            ("batch_size", str(self.config.batch_size), "批量处理大小"),
            ("scan_interval", str(self.config.scan_interval), "扫描间隔（秒）"),
            ("max_orphans_per_run", str(self.config.max_orphans_per_run), "单次运行最大清理数量"),
            ("backup_before_cleanup", str(self.config.backup_before_cleanup).lower(), "清理前是否备份"),
            ("exclude_patterns", json.dumps(self.config.exclude_patterns), "排除模式")
        ]

        async with aiosqlite.connect(self.db_path) as db:
            for key, value, description in config_items:
                await db.execute("""
                    INSERT OR REPLACE INTO cleanup_config (key, value, description, updated_at)
                    VALUES (?, ?, ?, ?)
                """, (key, value, description, now))
            await db.commit()

    async def update_config(self, **kwargs):
        """更新清理配置"""
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
        await self._save_config()

    async def check_consistency(self, batch_size: int = None) -> Dict[str, Any]:
        """检查文件系统与数据库的一致性"""
        if batch_size is None:
            batch_size = self.config.batch_size

        result = {
            "files_checked": 0,
            "orphan_metadata": [],
            "missing_metadata": [],
            "errors": []
        }

        try:
            # 获取数据库中的所有文件元数据
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("SELECT id, file_path FROM file_metadata")
                db_files = await cursor.fetchall()

            # 检查数据库中的文件是否存在于文件系统
            for file_id, file_path in db_files:
                try:
                    full_path = self.storage_root / file_path
                    result["files_checked"] += 1

                    if not full_path.exists():
                        # 检查是否在排除列表中
                        if not self._should_exclude_file(file_path):
                            result["orphan_metadata"].append({
                                "id": file_id,
                                "file_path": file_path,
                                "full_path": str(full_path)
                            })

                except Exception as e:
                    result["errors"].append(f"检查文件 {file_path} 时出错: {e}")

            # 检查文件系统中的文件是否在数据库中有元数据
            if self.storage_root.exists():
                for file_path in self._scan_filesystem():
                    try:
                        relative_path = file_path.relative_to(self.storage_root)
                        metadata = await self.metadata_manager.load_metadata(str(relative_path))
                        
                        if not metadata:
                            result["missing_metadata"].append(str(relative_path))

                    except Exception as e:
                        result["errors"].append(f"检查元数据 {file_path} 时出错: {e}")

        except Exception as e:
            result["errors"].append(f"一致性检查失败: {e}")

        return result

    def _should_exclude_file(self, file_path: str) -> bool:
        """检查文件是否应该被排除"""
        for pattern in self.config.exclude_patterns:
            if pattern in file_path:
                return True
        return False

    def _scan_filesystem(self):
        """扫描文件系统获取所有文件"""
        try:
            for item in self.storage_root.rglob("*"):
                if (item.is_file() and 
                    not item.name.endswith('.meta') and 
                    item.name != 'metadata.db' and
                    not self._should_exclude_file(str(item.relative_to(self.storage_root)))):
                    yield item
        except Exception as e:
            print(f"扫描文件系统失败: {e}")

    async def cleanup_orphan_metadata(self, dry_run: bool = False, max_orphans: int = None) -> CleanupResult:
        """清理孤儿元数据"""
        start_time = datetime.now()
        cleanup_type = "manual" if not self._running else "scheduled"
        
        if max_orphans is None:
            max_orphans = self.config.max_orphans_per_run

        result = CleanupResult(
            cleanup_type=cleanup_type,
            files_checked=0,
            orphans_found=0,
            orphans_cleaned=0,
            errors=0,
            start_time=start_time.isoformat(),
            end_time="",
            details={},
            duration=0.0
        )

        try:
            # 检查一致性
            consistency_result = await self.check_consistency()
            result.files_checked = consistency_result["files_checked"]
            result.orphans_found = len(consistency_result["orphan_metadata"])
            
            if consistency_result["errors"]:
                result.errors = len(consistency_result["errors"])
                result.details["errors"] = consistency_result["errors"]

            # 清理孤儿元数据
            orphans_to_clean = consistency_result["orphan_metadata"][:max_orphans]
            
            if not dry_run and orphans_to_clean:
                # 备份（如果启用）
                if self.config.backup_before_cleanup:
                    backup_info = await self._backup_orphan_metadata(orphans_to_clean)
                    result.details["backup"] = backup_info

                # 执行清理
                cleaned_count = await self._delete_orphan_metadata(orphans_to_clean)
                result.orphans_cleaned = cleaned_count

            elif orphans_to_clean:
                result.details["dry_run"] = True
                result.details["would_clean"] = len(orphans_to_clean)

            result.details["orphan_files"] = [item["file_path"] for item in orphans_to_clean]
            
        except Exception as e:
            result.errors += 1
            result.details["cleanup_error"] = str(e)

        # 完成
        end_time = datetime.now()
        result.end_time = end_time.isoformat()
        result.duration = (end_time - start_time).total_seconds()

        # 记录日志
        if not dry_run:
            await self._log_cleanup_result(result)

        return result

    async def _backup_orphan_metadata(self, orphans: List[Dict[str, Any]]) -> Dict[str, Any]:
        """备份孤儿元数据"""
        backup_file = self.storage_root / f"metadata_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        backup_data = []
        
        async with aiosqlite.connect(self.db_path) as db:
            for orphan in orphans:
                file_id = orphan["id"]
                
                # 备份文件元数据
                cursor = await db.execute("""
                    SELECT * FROM file_metadata WHERE id = ?
                """, (file_id,))
                metadata_row = await cursor.fetchone()
                
                if metadata_row:
                    # 获取列名
                    columns = [description[0] for description in cursor.description]
                    metadata_dict = dict(zip(columns, metadata_row))
                    
                    # 备份文件标签
                    tag_cursor = await db.execute("""
                        SELECT tag FROM file_tags WHERE file_id = ?
                    """, (file_id,))
                    tags = [row[0] for row in await tag_cursor.fetchall()]
                    metadata_dict["tags"] = tags
                    
                    backup_data.append(metadata_dict)

        # 保存备份文件
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)

        return {
            "backup_file": str(backup_file),
            "backup_count": len(backup_data)
        }

    async def _delete_orphan_metadata(self, orphans: List[Dict[str, Any]]) -> int:
        """删除孤儿元数据"""
        cleaned_count = 0
        
        async with aiosqlite.connect(self.db_path) as db:
            for orphan in orphans:
                try:
                    file_id = orphan["id"]
                    
                    # 删除文件标签
                    await db.execute("DELETE FROM file_tags WHERE file_id = ?", (file_id,))
                    
                    # 删除文件元数据
                    await db.execute("DELETE FROM file_metadata WHERE id = ?", (file_id,))
                    
                    cleaned_count += 1
                    
                except Exception as e:
                    print(f"删除孤儿元数据失败 {orphan['file_path']}: {e}")
            
            await db.commit()

        return cleaned_count

    async def _log_cleanup_result(self, result: CleanupResult):
        """记录清理结果"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO cleanup_log (
                    cleanup_type, files_checked, orphans_found, orphans_cleaned,
                    errors, start_time, end_time, duration, details
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                result.cleanup_type, result.files_checked, result.orphans_found,
                result.orphans_cleaned, result.errors, result.start_time,
                result.end_time, result.duration, json.dumps(result.details)
            ))
            await db.commit()

    async def get_cleanup_stats(self, days: int = 7) -> Dict[str, Any]:
        """获取清理统计信息"""
        since_date = (datetime.now() - timedelta(days=days)).isoformat()
        
        async with aiosqlite.connect(self.db_path) as db:
            # 基本统计
            cursor = await db.execute("""
                SELECT 
                    COUNT(*) as total_runs,
                    SUM(files_checked) as total_files_checked,
                    SUM(orphans_found) as total_orphans_found,
                    SUM(orphans_cleaned) as total_orphans_cleaned,
                    SUM(errors) as total_errors,
                    AVG(duration) as avg_duration
                FROM cleanup_log 
                WHERE start_time >= ?
            """, (since_date,))
            
            stats = await cursor.fetchone()
            
            # 最近的清理记录
            cursor = await db.execute("""
                SELECT * FROM cleanup_log 
                WHERE start_time >= ?
                ORDER BY start_time DESC 
                LIMIT 10
            """, (since_date,))
            
            recent_logs = await cursor.fetchall()
            
            return {
                "period_days": days,
                "total_runs": stats[0] or 0,
                "total_files_checked": stats[1] or 0,
                "total_orphans_found": stats[2] or 0,
                "total_orphans_cleaned": stats[3] or 0,
                "total_errors": stats[4] or 0,
                "avg_duration": stats[5] or 0,
                "recent_logs": [dict(zip([d[0] for d in cursor.description], row)) for row in recent_logs]
            }

    async def quick_check(self) -> bool:
        """快速检查是否需要清理"""
        try:
            consistency_result = await self.check_consistency(batch_size=50)
            return len(consistency_result["orphan_metadata"]) > 0
        except Exception:
            return False

    async def start_scheduled_cleanup(self):
        """启动定期清理"""
        if not self.config.enabled:
            return

        self._running = True
        print(f"🔄 启动定期元数据清理，间隔: {self.config.scan_interval}秒")

        while self._running:
            try:
                # 执行清理
                result = await self.cleanup_orphan_metadata()
                self._last_cleanup = datetime.now()
                
                if result.orphans_cleaned > 0:
                    print(f"✅ 定期清理完成: 清理了 {result.orphans_cleaned} 个孤儿元数据")
                
                # 等待下次清理
                await asyncio.sleep(self.config.scan_interval)
                
            except Exception as e:
                print(f"❌ 定期清理失败: {e}")
                await asyncio.sleep(60)  # 出错时短暂休息

    def stop_scheduled_cleanup(self):
        """停止定期清理"""
        self._running = False
        print("⏹️ 定期元数据清理已停止")

    @property
    def is_running(self) -> bool:
        """检查是否正在运行定期清理"""
        return self._running

    @property
    def last_cleanup_time(self) -> Optional[datetime]:
        """最后一次清理时间"""
        return self._last_cleanup