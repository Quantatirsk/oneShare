-- SQLite数据库模式设计
-- 文件元数据管理系统

-- 文件元数据表
CREATE TABLE IF NOT EXISTS file_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,                    -- 文件名
    file_path TEXT NOT NULL UNIQUE,           -- 文件路径（相对于storage_root）
    size INTEGER NOT NULL,                    -- 文件大小（字节）
    upload_time TEXT NOT NULL,               -- 上传时间（ISO格式）
    last_modified TEXT NOT NULL,             -- 最后修改时间（ISO格式）
    is_public INTEGER NOT NULL DEFAULT 0,    -- 是否公开（1=公开，0=私有）
    content_type TEXT DEFAULT 'application/octet-stream', -- MIME类型
    created_by TEXT,                         -- 创建者标识
    description TEXT DEFAULT '',             -- 文件描述
    notes TEXT DEFAULT '',                   -- 用户笔记
    original_url TEXT,                       -- 原始下载URL
    locked INTEGER NOT NULL DEFAULT 0,       -- 锁定状态（1=锁定，0=未锁定）
    created_at TEXT NOT NULL,                -- 记录创建时间
    updated_at TEXT NOT NULL                 -- 记录更新时间
);

-- 文件标签表
CREATE TABLE IF NOT EXISTS file_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,               -- 文件ID（外键）
    tag TEXT NOT NULL,                      -- 标签名
    created_at TEXT NOT NULL,               -- 创建时间
    FOREIGN KEY (file_id) REFERENCES file_metadata(id) ON DELETE CASCADE,
    UNIQUE(file_id, tag)                    -- 防止重复标签
);

-- 目录元数据表
CREATE TABLE IF NOT EXISTS directory_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    directory_path TEXT NOT NULL UNIQUE,    -- 目录路径（相对于storage_root）
    is_public INTEGER,                      -- 是否公开（NULL=继承，1=公开，0=私有）
    locked INTEGER NOT NULL DEFAULT 0,      -- 锁定状态（1=锁定，0=未锁定）
    description TEXT DEFAULT '',            -- 目录描述
    created_by TEXT,                        -- 创建者标识
    created_at TEXT NOT NULL,               -- 记录创建时间
    updated_at TEXT NOT NULL                -- 记录更新时间
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

-- FTS搜索功能暂时移除，使用简单搜索

-- 版本信息表
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL,
    description TEXT
);

-- 插入初始版本信息
INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES (1, datetime('now'), 'Initial schema for file metadata management');