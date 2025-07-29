#!/usr/bin/env python3
"""
数据迁移脚本：从JSON文件存储迁移到SQLite数据库
"""

import os
import json
import asyncio
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

from metadata_manager import MetadataManager as JSONMetadataManager
from sqlite_metadata_manager import SQLiteMetadataManager


class MigrationManager:
    """数据迁移管理器"""
    
    def __init__(self, storage_root: str):
        self.storage_root = Path(storage_root)
        self.json_manager = JSONMetadataManager(str(self.storage_root))
        self.sqlite_manager = SQLiteMetadataManager(str(self.storage_root))
        self.migration_log = []
    
    def log(self, message: str, level: str = "INFO"):
        """记录迁移日志"""
        timestamp = datetime.now().isoformat()
        log_entry = f"[{timestamp}] {level}: {message}"
        self.migration_log.append(log_entry)
        print(log_entry)
    
    async def migrate_all_metadata(self) -> Dict[str, Any]:
        """迁移所有元数据"""
        self.log("开始迁移元数据到SQLite数据库")
        
        stats = {
            "total_files": 0,
            "migrated_files": 0,
            "skipped_files": 0,
            "failed_files": 0,
            "migrated_directories": 0,
            "failed_directories": 0,
            "errors": []
        }
        
        try:
            # 1. 迁移文件元数据
            await self._migrate_file_metadata(stats)
            
            # 2. 迁移目录元数据
            await self._migrate_directory_metadata(stats)
            
            # 3. 验证迁移结果
            await self._verify_migration(stats)
            
            self.log("迁移完成")
            
        except Exception as e:
            error_msg = f"迁移过程中发生错误: {e}"
            self.log(error_msg, "ERROR")
            stats["errors"].append(error_msg)
        
        return stats
    
    async def _migrate_file_metadata(self, stats: Dict[str, Any]):
        """迁移文件元数据"""
        self.log("开始迁移文件元数据")
        
        # 遍历所有.meta文件
        for meta_file in self.storage_root.rglob("*.meta"):
            try:
                # 跳过目录元数据文件
                if meta_file.name.endswith('.directory.meta'):
                    continue
                
                # 获取对应的文件路径
                file_path = meta_file.with_suffix('')
                
                # 检查原文件是否存在
                if not file_path.exists():
                    self.log(f"跳过不存在的文件: {file_path}", "WARNING")
                    stats["skipped_files"] += 1
                    continue
                
                # 计算相对路径
                try:
                    relative_path = file_path.relative_to(self.storage_root)
                except ValueError:
                    self.log(f"无法计算相对路径: {file_path}", "WARNING")
                    stats["skipped_files"] += 1
                    continue
                
                stats["total_files"] += 1
                
                # 读取JSON元数据
                try:
                    async with open(meta_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                        json_data = json.loads(content)
                except Exception as e:
                    error_msg = f"读取元数据文件失败 {meta_file}: {e}"
                    self.log(error_msg, "ERROR")
                    stats["errors"].append(error_msg)
                    stats["failed_files"] += 1
                    continue
                
                # 转换为FileMetadata对象
                try:
                    from sqlite_metadata_manager import FileMetadata
                    metadata = FileMetadata.from_dict(json_data)
                    
                    # 保存到SQLite
                    await self.sqlite_manager.save_metadata(str(relative_path), metadata)
                    
                    self.log(f"成功迁移文件: {relative_path}")
                    stats["migrated_files"] += 1
                    
                except Exception as e:
                    error_msg = f"迁移文件元数据失败 {relative_path}: {e}"
                    self.log(error_msg, "ERROR")
                    stats["errors"].append(error_msg)
                    stats["failed_files"] += 1
                    
            except Exception as e:
                error_msg = f"处理元数据文件失败 {meta_file}: {e}"
                self.log(error_msg, "ERROR")
                stats["errors"].append(error_msg)
                stats["failed_files"] += 1
    
    async def _migrate_directory_metadata(self, stats: Dict[str, Any]):
        """迁移目录元数据"""
        self.log("开始迁移目录元数据")
        
        # 查找所有目录元数据文件
        for meta_file in self.storage_root.rglob("*.directory.meta"):
            try:
                # 获取目录路径
                dir_path = meta_file.parent
                
                # 计算相对路径
                try:
                    relative_path = dir_path.relative_to(self.storage_root)
                except ValueError:
                    self.log(f"无法计算目录相对路径: {dir_path}", "WARNING")
                    continue
                
                # 读取JSON元数据
                try:
                    async with open(meta_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                        json_data = json.loads(content)
                except Exception as e:
                    error_msg = f"读取目录元数据文件失败 {meta_file}: {e}"
                    self.log(error_msg, "ERROR")
                    stats["errors"].append(error_msg)
                    stats["failed_directories"] += 1
                    continue
                
                # 迁移目录权限设置
                try:
                    is_public = json_data.get('is_public')
                    locked = json_data.get('locked', False)
                    
                    if is_public is not None:
                        await self.sqlite_manager.set_directory_permission(
                            str(relative_path), is_public, apply_to_children=False
                        )
                    
                    if locked:
                        await self.sqlite_manager.set_directory_lock(
                            str(relative_path), locked, apply_to_children=False
                        )
                    
                    self.log(f"成功迁移目录: {relative_path}")
                    stats["migrated_directories"] += 1
                    
                except Exception as e:
                    error_msg = f"迁移目录元数据失败 {relative_path}: {e}"
                    self.log(error_msg, "ERROR")
                    stats["errors"].append(error_msg)
                    stats["failed_directories"] += 1
                    
            except Exception as e:
                error_msg = f"处理目录元数据文件失败 {meta_file}: {e}"
                self.log(error_msg, "ERROR")
                stats["errors"].append(error_msg)
                stats["failed_directories"] += 1
    
    async def _verify_migration(self, stats: Dict[str, Any]):
        """验证迁移结果"""
        self.log("开始验证迁移结果")
        
        # 随机抽样验证几个文件
        sample_files = []
        for file_path in self.storage_root.rglob("*"):
            if file_path.is_file() and not file_path.name.endswith('.meta') and file_path.name != 'metadata.db':
                try:
                    relative_path = file_path.relative_to(self.storage_root)
                    sample_files.append(str(relative_path))
                    if len(sample_files) >= 5:  # 验证前5个文件
                        break
                except ValueError:
                    continue
        
        verified_count = 0
        for file_path in sample_files:
            try:
                # 检查SQLite中是否存在该文件的元数据
                metadata = await self.sqlite_manager.load_metadata(file_path)
                if metadata:
                    verified_count += 1
                    self.log(f"验证成功: {file_path}")
                else:
                    self.log(f"验证失败: {file_path} - 未找到元数据", "WARNING")
            except Exception as e:
                self.log(f"验证错误: {file_path} - {e}", "ERROR")
        
        self.log(f"验证完成: {verified_count}/{len(sample_files)} 个文件验证通过")
    
    async def backup_json_metadata(self, backup_dir: str = None) -> str:
        """备份原始JSON元数据"""
        if backup_dir is None:
            backup_dir = self.storage_root / "metadata_backup" / datetime.now().strftime("%Y%m%d_%H%M%S")
        
        backup_path = Path(backup_dir)
        backup_path.mkdir(parents=True, exist_ok=True)
        
        self.log(f"备份JSON元数据到: {backup_path}")
        
        # 备份所有.meta文件
        backed_up_count = 0
        for meta_file in self.storage_root.rglob("*.meta"):
            try:
                # 计算相对路径
                relative_path = meta_file.relative_to(self.storage_root)
                backup_file_path = backup_path / relative_path
                
                # 确保备份目录存在
                backup_file_path.parent.mkdir(parents=True, exist_ok=True)
                
                # 复制文件
                shutil.copy2(meta_file, backup_file_path)
                backed_up_count += 1
                
            except Exception as e:
                self.log(f"备份文件失败 {meta_file}: {e}", "ERROR")
        
        self.log(f"备份完成: {backed_up_count} 个文件已备份")
        return str(backup_path)
    
    async def cleanup_json_metadata(self, confirm: bool = False):
        """清理JSON元数据文件"""
        if not confirm:
            self.log("跳过清理JSON元数据文件（需要确认）", "WARNING")
            return
        
        self.log("开始清理JSON元数据文件")
        
        cleaned_count = 0
        for meta_file in self.storage_root.rglob("*.meta"):
            try:
                meta_file.unlink()
                cleaned_count += 1
            except Exception as e:
                self.log(f"删除文件失败 {meta_file}: {e}", "ERROR")
        
        self.log(f"清理完成: {cleaned_count} 个元数据文件已删除")
    
    def save_migration_log(self, log_file: str = None):
        """保存迁移日志"""
        if log_file is None:
            log_file = self.storage_root / f"migration_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        
        try:
            with open(log_file, 'w', encoding='utf-8') as f:
                f.write("\n".join(self.migration_log))
            print(f"迁移日志已保存到: {log_file}")
        except Exception as e:
            print(f"保存迁移日志失败: {e}")


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="迁移元数据从JSON到SQLite")
    parser.add_argument("--storage-root", default="./storage/files", help="存储根目录")
    parser.add_argument("--backup", action="store_true", help="备份原始JSON元数据")
    parser.add_argument("--cleanup", action="store_true", help="清理JSON元数据文件")
    parser.add_argument("--dry-run", action="store_true", help="试运行（不执行实际迁移）")
    
    args = parser.parse_args()
    
    # 检查存储目录
    storage_root = Path(args.storage_root)
    if not storage_root.exists():
        print(f"错误: 存储目录不存在: {storage_root}")
        return
    
    # 创建迁移管理器
    migration_manager = MigrationManager(str(storage_root))
    
    try:
        # 备份原始数据
        if args.backup:
            backup_path = await migration_manager.backup_json_metadata()
            print(f"原始数据已备份到: {backup_path}")
        
        # 执行迁移
        if not args.dry_run:
            stats = await migration_manager.migrate_all_metadata()
            
            # 打印统计信息
            print("\n迁移统计:")
            print(f"总文件数: {stats['total_files']}")
            print(f"成功迁移: {stats['migrated_files']}")
            print(f"跳过文件: {stats['skipped_files']}")
            print(f"失败文件: {stats['failed_files']}")
            print(f"迁移目录: {stats['migrated_directories']}")
            print(f"失败目录: {stats['failed_directories']}")
            
            if stats['errors']:
                print(f"\n错误数量: {len(stats['errors'])}")
                for error in stats['errors'][:5]:  # 显示前5个错误
                    print(f"  - {error}")
            
            # 清理JSON文件
            if args.cleanup:
                await migration_manager.cleanup_json_metadata(confirm=True)
            
            # 保存日志
            migration_manager.save_migration_log()
            
            print("\n迁移完成!")
        else:
            print("试运行模式 - 未执行实际迁移")
            
    except Exception as e:
        print(f"迁移失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())