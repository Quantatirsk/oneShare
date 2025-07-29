#!/usr/bin/env python3
"""
批量更新现有文件权限为私有
这是一个可选的脚本，用于将现有的公开文件设置为私有
"""

import asyncio
import argparse
from pathlib import Path
from metadata_config import get_metadata_manager


async def update_existing_files_to_private(storage_root: str, dry_run: bool = True):
    """批量更新现有文件为私有"""
    print(f"🔄 {'[试运行] ' if dry_run else ''}开始更新现有文件权限为私有...")
    print(f"📁 存储目录: {storage_root}")
    
    manager = get_metadata_manager(storage_root)
    
    # 获取所有文件（包括公开和私有）
    all_files = await manager.list_files_with_metadata(user_can_access_private=True)
    
    public_files = [f for f in all_files if f["is_public"] == True]
    
    print(f"\n📊 统计信息:")
    print(f"   总文件数: {len(all_files)}")
    print(f"   公开文件数: {len(public_files)}")
    print(f"   私有文件数: {len(all_files) - len(public_files)}")
    
    if not public_files:
        print("\n✅ 没有需要更新的公开文件")
        return
    
    print(f"\n📋 将要更新的公开文件:")
    for i, file_info in enumerate(public_files, 1):
        print(f"   {i:3d}. {file_info['filename']} ({file_info['size']} bytes)")
    
    if dry_run:
        print(f"\n⚠️  这是试运行模式，不会进行实际修改")
        print(f"   要执行实际更新，请添加 --execute 参数")
        return
    
    # 确认操作
    print(f"\n⚠️  即将将 {len(public_files)} 个公开文件设置为私有")
    confirm = input("是否继续？(y/N): ").lower().strip()
    
    if confirm != 'y':
        print("❌ 操作已取消")
        return
    
    # 执行更新
    updated_count = 0
    failed_count = 0
    
    print(f"\n🔄 开始更新文件权限...")
    
    for i, file_info in enumerate(public_files, 1):
        filename = file_info["filename"]
        try:
            success = await manager.set_file_permission(filename, False)  # 设置为私有
            if success:
                updated_count += 1
                print(f"   ✅ [{i:3d}/{len(public_files)}] {filename}")
            else:
                failed_count += 1
                print(f"   ❌ [{i:3d}/{len(public_files)}] {filename} - 更新失败")
        except Exception as e:
            failed_count += 1
            print(f"   ❌ [{i:3d}/{len(public_files)}] {filename} - 错误: {e}")
    
    print(f"\n📊 更新结果:")
    print(f"   成功更新: {updated_count} 个文件")
    print(f"   更新失败: {failed_count} 个文件")
    
    if failed_count > 0:
        print(f"   ⚠️  有 {failed_count} 个文件更新失败，请检查日志")
    else:
        print(f"   🎉 所有文件更新成功！")


async def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="批量更新现有文件权限为私有")
    parser.add_argument("--storage-root", default="./storage", help="存储根目录")
    parser.add_argument("--execute", action="store_true", help="执行实际更新（默认为试运行）")
    
    args = parser.parse_args()
    
    # 检查存储目录
    storage_root = Path(args.storage_root)
    if not storage_root.exists():
        print(f"❌ 存储目录不存在: {storage_root}")
        return
    
    try:
        await update_existing_files_to_private(str(storage_root), dry_run=not args.execute)
    except Exception as e:
        print(f"❌ 更新失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())