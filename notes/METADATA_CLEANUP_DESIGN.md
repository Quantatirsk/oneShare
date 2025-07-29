# SQLite元数据自动清理机制设计

## 问题分析

### 🚨 孤儿元数据问题
当文件在文件系统层面被删除而数据库元数据仍然存在时，会产生以下问题：

1. **数据不一致**：数据库显示存在实际已删除的文件
2. **存储浪费**：无用的元数据占用数据库空间
3. **功能异常**：用户尝试访问不存在的文件会出错
4. **搜索污染**：搜索结果包含不存在的文件

### 🔍 产生原因
- 用户通过命令行删除文件：`rm file.txt`
- 系统管理员批量清理文件
- 其他程序删除文件
- 文件系统损坏或迁移
- 容器重启时临时文件丢失

## 解决方案设计

### 🎯 设计目标
1. **自动检测**：定期扫描发现孤儿元数据
2. **安全清理**：谨慎删除，避免误删
3. **性能优化**：高效扫描，不影响正常服务
4. **可配置性**：支持灵活的清理策略
5. **可监控性**：提供详细的清理日志和统计

### 🏗️ 架构设计

#### 1. 核心组件
```
MetadataCleanupManager
├── ConsistencyChecker    # 一致性检查器
├── OrphanCleaner        # 孤儿元数据清理器
├── CleanupScheduler     # 清理调度器
└── CleanupReporter      # 清理报告器
```

#### 2. 清理策略
- **即时检查**：在文件操作时触发
- **定期扫描**：按配置间隔执行全面扫描
- **手动触发**：提供管理员工具
- **启动检查**：服务启动时执行快速检查

#### 3. 安全机制
- **宽限期**：文件删除后等待一段时间再清理元数据
- **批量限制**：单次清理数量限制，避免过大影响
- **备份恢复**：清理前备份元数据，支持恢复
- **白名单**：特殊文件路径保护

## 实现方案

### 📊 数据库扩展
```sql
-- 清理日志表
CREATE TABLE cleanup_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cleanup_type TEXT NOT NULL,          -- 清理类型：scheduled/manual/startup
    files_checked INTEGER NOT NULL,      -- 检查文件数量
    orphans_found INTEGER NOT NULL,      -- 发现孤儿数量
    orphans_cleaned INTEGER NOT NULL,    -- 清理孤儿数量
    errors INTEGER NOT NULL DEFAULT 0,   -- 错误数量
    start_time TEXT NOT NULL,           -- 开始时间
    end_time TEXT NOT NULL,             -- 结束时间
    details TEXT                        -- 详细信息（JSON）
);

-- 清理配置表
CREATE TABLE cleanup_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TEXT NOT NULL
);
```

### ⚙️ 配置选项
```python
CLEANUP_CONFIG = {
    "enabled": True,                    # 是否启用自动清理
    "grace_period": 300,               # 宽限期（秒）
    "batch_size": 100,                 # 批量处理大小
    "scan_interval": 3600,             # 扫描间隔（秒）
    "max_orphans_per_run": 1000,      # 单次运行最大清理数量
    "backup_before_cleanup": True,      # 清理前是否备份
    "exclude_patterns": [".tmp", ".lock"] # 排除模式
}
```

### 🔄 清理流程
```
1. 触发清理 → 2. 加载配置 → 3. 扫描文件系统
         ↓
8. 生成报告 ← 7. 更新日志 ← 6. 清理元数据 ← 5. 验证孤儿 ← 4. 对比数据库
```

## 实现优先级

### Phase 1: 核心功能 🚀
- [x] 一致性检查器
- [x] 孤儿元数据清理器  
- [x] 基础配置系统

### Phase 2: 调度系统 ⏰
- [ ] 定期清理调度
- [ ] 启动时检查
- [ ] 手动触发工具

### Phase 3: 高级功能 🔧
- [ ] 性能优化
- [ ] 详细报告
- [ ] 监控集成

## 风险控制

### ⚠️ 风险识别
1. **误删风险**：错误识别活跃文件为孤儿
2. **性能影响**：大量文件扫描影响服务性能
3. **并发冲突**：清理过程中用户操作文件

### 🛡️ 缓解措施
1. **多重验证**：多次检查确认文件确实不存在
2. **渐进扫描**：分批处理，添加延迟
3. **锁机制**：清理时加锁，避免并发冲突
4. **监控告警**：异常情况及时通知

## 监控指标

- 📈 孤儿元数据数量趋势
- ⏱️ 清理执行时间统计
- 🎯 清理成功率
- ⚠️ 错误率统计
- 💾 数据库空间节省量