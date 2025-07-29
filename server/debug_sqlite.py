#!/usr/bin/env python3
"""
调试SQLite创建过程
"""

import sqlite3
import tempfile
from pathlib import Path

def test_sqlite_creation():
    """测试SQLite数据库创建"""
    with tempfile.TemporaryDirectory() as temp_dir:
        db_path = Path(temp_dir) / "test.db"
        
        schema_sql = """
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
    is_public INTEGER NOT NULL DEFAULT 1,
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
        
        print(f"创建数据库: {db_path}")
        
        # 创建数据库
        with sqlite3.connect(db_path) as conn:
            conn.executescript(schema_sql)
            conn.commit()
            print("✅ 数据库创建成功")
            
            # 验证表结构
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            print(f"表: {tables}")
            
            # 验证文件元数据表结构
            cursor = conn.execute("PRAGMA table_info(file_metadata);")
            columns = cursor.fetchall()
            print(f"file_metadata列: {columns}")
            
            # 验证文件标签表结构
            cursor = conn.execute("PRAGMA table_info(file_tags);")
            columns = cursor.fetchall()
            print(f"file_tags列: {columns}")
            
            # 测试插入
            print("测试插入数据...")
            cursor = conn.execute("""
                INSERT INTO file_metadata (
                    filename, file_path, size, upload_time, last_modified,
                    is_public, content_type, created_by, description, notes,
                    original_url, locked, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "test.txt", "test.txt", 13, "2025-06-23T10:00:00", "2025-06-23T10:00:00",
                1, "text/plain", "test_user", "test description", "test notes",
                None, 0, "2025-06-23T10:00:00", "2025-06-23T10:00:00"
            ))
            
            file_id = cursor.lastrowid
            print(f"✅ 插入文件元数据成功，ID: {file_id}")
            
            # 插入标签
            conn.execute(
                "INSERT INTO file_tags (file_id, tag, created_at) VALUES (?, ?, ?)",
                (file_id, "test", "2025-06-23T10:00:00")
            )
            conn.execute(
                "INSERT INTO file_tags (file_id, tag, created_at) VALUES (?, ?, ?)",
                (file_id, "sample", "2025-06-23T10:00:00")
            )
            
            conn.commit()
            print("✅ 插入标签成功")
            
            # 测试查询
            cursor = conn.execute("""
                SELECT fm.filename, fm.size, GROUP_CONCAT(ft.tag) as tags
                FROM file_metadata fm
                LEFT JOIN file_tags ft ON fm.id = ft.file_id
                WHERE fm.file_path = ?
                GROUP BY fm.id
            """, ("test.txt",))
            
            row = cursor.fetchone()
            print(f"✅ 查询结果: {row}")
            
            print("🎉 所有操作成功！")

if __name__ == "__main__":
    test_sqlite_creation()