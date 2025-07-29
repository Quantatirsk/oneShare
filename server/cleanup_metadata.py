#!/usr/bin/env python3
"""
元数据清理工具脚本
用于手动执行元数据一致性检查和清理操作
"""

import asyncio
import argparse
import json
from pathlib import Path
from datetime import datetime
from metadata_config import get_metadata_manager
from metadata_cleanup_manager import MetadataCleanupManager


async def check_consistency(storage_root: str):
    """检查元数据一致性"""
    print("🔍 开始检查元数据一致性...")
    
    manager = get_metadata_manager(storage_root)
    cleanup_manager = MetadataCleanupManager(manager)
    await cleanup_manager.initialize()
    
    result = await cleanup_manager.check_consistency()
    
    print(f"\n📊 一致性检查结果:")
    print(f"   检查文件数: {result['files_checked']}")
    print(f"   孤儿元数据: {len(result['orphan_metadata'])}")
    print(f"   缺失元数据: {len(result['missing_metadata'])}")
    print(f"   错误数量: {len(result['errors'])}")
    
    if result['orphan_metadata']:
        print(f"\n🚨 发现孤儿元数据:")
        for i, orphan in enumerate(result['orphan_metadata'][:10], 1):
            print(f"   {i:3d}. {orphan['file_path']}")
        if len(result['orphan_metadata']) > 10:
            print(f"   ... 还有 {len(result['orphan_metadata']) - 10} 个")
    
    if result['missing_metadata']:
        print(f"\n⚠️  发现缺失元数据的文件:")
        for i, missing in enumerate(result['missing_metadata'][:10], 1):
            print(f"   {i:3d}. {missing}")
        if len(result['missing_metadata']) > 10:
            print(f"   ... 还有 {len(result['missing_metadata']) - 10} 个")
    
    if result['errors']:
        print(f"\n❌ 检查过程中的错误:")
        for error in result['errors'][:5]:
            print(f"   - {error}")
        if len(result['errors']) > 5:
            print(f"   ... 还有 {len(result['errors']) - 5} 个错误")
    
    return result


async def cleanup_orphans(storage_root: str, dry_run: bool = True, max_orphans: int = None):
    """清理孤儿元数据"""
    action = "试运行清理" if dry_run else "执行清理"
    print(f"🧹 开始{action}孤儿元数据...")
    
    manager = get_metadata_manager(storage_root)
    cleanup_manager = MetadataCleanupManager(manager)
    await cleanup_manager.initialize()
    
    result = await cleanup_manager.cleanup_orphan_metadata(dry_run=dry_run, max_orphans=max_orphans)
    
    print(f"\n📊 清理结果:")
    print(f"   清理类型: {result.cleanup_type}")
    print(f"   检查文件数: {result.files_checked}")
    print(f"   发现孤儿: {result.orphans_found}")
    print(f"   清理孤儿: {result.orphans_cleaned}")
    print(f"   错误数量: {result.errors}")
    print(f"   执行时间: {result.duration:.2f}秒")
    
    if dry_run and result.orphans_found > 0:
        print(f"\n⚠️  这是试运行模式，没有实际删除元数据")
        print(f"   要执行实际清理，请添加 --execute 参数")
        
        if "orphan_files" in result.details:
            print(f"\n📋 将要清理的孤儿元数据:")
            for i, file_path in enumerate(result.details["orphan_files"][:10], 1):
                print(f"   {i:3d}. {file_path}")
            if len(result.details["orphan_files"]) > 10:
                print(f"   ... 还有 {len(result.details['orphan_files']) - 10} 个")
    
    elif not dry_run and result.orphans_cleaned > 0:
        print(f"\n✅ 成功清理了 {result.orphans_cleaned} 个孤儿元数据")
        
        if "backup" in result.details:
            backup_info = result.details["backup"]
            print(f"   备份文件: {backup_info['backup_file']}")
    
    if result.errors > 0:
        print(f"\n❌ 清理过程中出现 {result.errors} 个错误")
        if "errors" in result.details:
            for error in result.details["errors"][:3]:
                print(f"   - {error}")
    
    return result


async def show_stats(storage_root: str, days: int = 7):
    """显示清理统计信息"""
    print(f"📈 显示最近 {days} 天的清理统计...")
    
    manager = get_metadata_manager(storage_root)
    cleanup_manager = MetadataCleanupManager(manager)
    await cleanup_manager.initialize()
    
    stats = await cleanup_manager.get_cleanup_stats(days)
    
    print(f"\n📊 清理统计 (最近 {days} 天):")
    print(f"   总运行次数: {stats['total_runs']}")
    print(f"   检查文件总数: {stats['total_files_checked']}")
    print(f"   发现孤儿总数: {stats['total_orphans_found']}")
    print(f"   清理孤儿总数: {stats['total_orphans_cleaned']}")
    print(f"   错误总数: {stats['total_errors']}")
    print(f"   平均执行时间: {stats['avg_duration']:.2f}秒")
    
    if stats['recent_logs']:
        print(f"\n📋 最近的清理记录:")
        for i, log in enumerate(stats['recent_logs'][:5], 1):
            print(f"   {i}. {log['start_time'][:19]} - {log['cleanup_type']} - "
                  f"发现 {log['orphans_found']} 清理 {log['orphans_cleaned']}")


async def update_config(storage_root: str, config_updates: dict):
    """更新清理配置"""
    print("⚙️ 更新清理配置...")
    
    manager = get_metadata_manager(storage_root)
    cleanup_manager = MetadataCleanupManager(manager)
    await cleanup_manager.initialize()
    
    await cleanup_manager.update_config(**config_updates)
    
    print("✅ 配置更新成功")
    print("\n📋 当前配置:")
    config = cleanup_manager.config
    print(f"   启用自动清理: {config.enabled}")
    print(f"   宽限期: {config.grace_period}秒")
    print(f"   批量大小: {config.batch_size}")
    print(f"   扫描间隔: {config.scan_interval}秒")
    print(f"   单次最大清理: {config.max_orphans_per_run}")
    print(f"   清理前备份: {config.backup_before_cleanup}")
    print(f"   排除模式: {config.exclude_patterns}")


async def create_missing_metadata(storage_root: str, dry_run: bool = True):
    """为缺失元数据的文件创建元数据"""
    action = "试运行创建" if dry_run else "创建"
    print(f"📝 开始{action}缺失的元数据...")
    
    manager = get_metadata_manager(storage_root)
    cleanup_manager = MetadataCleanupManager(manager)
    await cleanup_manager.initialize()
    
    # 先检查一致性
    result = await cleanup_manager.check_consistency()
    missing_files = result['missing_metadata']
    
    if not missing_files:
        print("✅ 没有发现缺失元数据的文件")
        return
    
    print(f"📊 发现 {len(missing_files)} 个缺失元数据的文件")
    
    if dry_run:
        print(f"\n📋 将要创建元数据的文件:")
        for i, file_path in enumerate(missing_files[:10], 1):
            print(f"   {i:3d}. {file_path}")
        if len(missing_files) > 10:
            print(f"   ... 还有 {len(missing_files) - 10} 个")
        print(f"\n⚠️  这是试运行模式，要执行实际创建，请添加 --execute 参数")
        return
    
    # 执行创建
    created_count = 0
    errors = []
    
    for file_path in missing_files:
        try:
            full_path = cleanup_manager.storage_root / file_path
            if full_path.exists():
                file_size = full_path.stat().st_size
                await manager.create_metadata(file_path, file_size)
                created_count += 1
                print(f"   ✅ {file_path}")
            else:
                errors.append(f"文件不存在: {file_path}")
        except Exception as e:
            errors.append(f"创建元数据失败 {file_path}: {e}")
    
    print(f"\n📊 创建结果:")
    print(f"   成功创建: {created_count}")
    print(f"   失败数量: {len(errors)}")
    
    if errors:
        print(f"\n❌ 创建错误:")
        for error in errors[:5]:
            print(f"   - {error}")


async def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="元数据清理工具")
    parser.add_argument("--storage-root", default="./storage", help="存储根目录")
    
    subparsers = parser.add_subparsers(dest="command", help="可用命令")
    
    # 检查一致性
    check_parser = subparsers.add_parser("check", help="检查元数据一致性")
    
    # 清理孤儿元数据
    cleanup_parser = subparsers.add_parser("cleanup", help="清理孤儿元数据")
    cleanup_parser.add_argument("--execute", action="store_true", help="执行实际清理（默认试运行）")
    cleanup_parser.add_argument("--max-orphans", type=int, help="单次最大清理数量")
    
    # 显示统计
    stats_parser = subparsers.add_parser("stats", help="显示清理统计")
    stats_parser.add_argument("--days", type=int, default=7, help="统计天数")
    
    # 更新配置
    config_parser = subparsers.add_parser("config", help="更新清理配置")
    config_parser.add_argument("--enabled", type=bool, help="启用/禁用自动清理")
    config_parser.add_argument("--grace-period", type=int, help="宽限期（秒）")
    config_parser.add_argument("--batch-size", type=int, help="批量处理大小")
    config_parser.add_argument("--scan-interval", type=int, help="扫描间隔（秒）")
    config_parser.add_argument("--max-orphans-per-run", type=int, help="单次最大清理数量")
    config_parser.add_argument("--backup-before-cleanup", type=bool, help="清理前是否备份")
    
    # 创建缺失元数据
    create_parser = subparsers.add_parser("create-missing", help="为缺失元数据的文件创建元数据")
    create_parser.add_argument("--execute", action="store_true", help="执行实际创建（默认试运行）")
    
    args = parser.parse_args()
    
    # 检查存储目录
    storage_root = Path(args.storage_root)
    if not storage_root.exists():
        print(f"❌ 存储目录不存在: {storage_root}")
        return
    
    try:
        if args.command == "check":
            await check_consistency(str(storage_root))
        
        elif args.command == "cleanup":
            await cleanup_orphans(
                str(storage_root), 
                dry_run=not args.execute,
                max_orphans=args.max_orphans
            )
        
        elif args.command == "stats":
            await show_stats(str(storage_root), args.days)
        
        elif args.command == "config":
            config_updates = {}
            if args.enabled is not None:
                config_updates["enabled"] = args.enabled
            if args.grace_period is not None:
                config_updates["grace_period"] = args.grace_period
            if args.batch_size is not None:
                config_updates["batch_size"] = args.batch_size
            if args.scan_interval is not None:
                config_updates["scan_interval"] = args.scan_interval
            if args.max_orphans_per_run is not None:
                config_updates["max_orphans_per_run"] = args.max_orphans_per_run
            if args.backup_before_cleanup is not None:
                config_updates["backup_before_cleanup"] = args.backup_before_cleanup
            
            if config_updates:
                await update_config(str(storage_root), config_updates)
            else:
                print("❌ 没有指定要更新的配置项")
        
        elif args.command == "create-missing":
            await create_missing_metadata(str(storage_root), dry_run=not args.execute)
        
        else:
            print("❌ 请指定一个命令。使用 -h 查看帮助")
            parser.print_help()
    
    except Exception as e:
        print(f"❌ 执行失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())