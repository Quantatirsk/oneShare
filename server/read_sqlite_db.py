#!/usr/bin/env python3
"""
读取SQLite数据库文件内容
"""

import sqlite3
import json
from pathlib import Path


def read_sqlite_database(db_path: str):
    """读取并打印SQLite数据库内容"""
    db_file = Path(db_path)
    
    if not db_file.exists():
        print(f"❌ 数据库文件不存在: {db_path}")
        return
    
    print(f"📊 读取数据库: {db_path}")
    print("=" * 60)
    
    try:
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            
            # 获取所有表
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            
            print(f"🗂️  数据库包含 {len(tables)} 个表:")
            for table in tables:
                print(f"   - {table[0]}")
            print()
            
            # 读取每个表的内容
            for table_name, in tables:
                print(f"📋 表: {table_name}")
                print("-" * 40)
                
                # 获取表结构
                cursor.execute(f"PRAGMA table_info({table_name});")
                columns = cursor.fetchall()
                column_names = [col[1] for col in columns]
                
                print(f"📝 列: {', '.join(column_names)}")
                
                # 获取表数据
                cursor.execute(f"SELECT * FROM {table_name};")
                rows = cursor.fetchall()
                
                print(f"📊 记录数: {len(rows)}")
                
                if rows:
                    print("📄 数据:")
                    for i, row in enumerate(rows, 1):
                        print(f"  [{i}] ", end="")
                        row_dict = dict(zip(column_names, row))
                        print(json.dumps(row_dict, ensure_ascii=False, indent=None))
                else:
                    print("   (空表)")
                
                print()
    
    except Exception as e:
        print(f"❌ 读取数据库失败: {e}")
        import traceback
        traceback.print_exc()


def main():
    db_path = "/opt/file-server/server/storage/metadata.db"
    read_sqlite_database(db_path)


if __name__ == "__main__":
    main()