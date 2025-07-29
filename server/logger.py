"""
日志配置模块

为编译服务提供统一的日志配置和管理
"""

import logging
import logging.handlers
import os
import sys
import json
import time
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
import traceback

class CompileServiceFormatter(logging.Formatter):
    """自定义日志格式化器"""
    
    def __init__(self):
        super().__init__()
        self.start_time = time.time()
    
    def format(self, record):
        # 添加相对时间戳
        record.relative_time = time.time() - self.start_time
        
        # 添加编译相关的上下文信息
        if hasattr(record, 'compile_id'):
            compile_context = f" [compile:{record.compile_id}]"
        else:
            compile_context = ""
        
        # 添加性能信息
        if hasattr(record, 'duration'):
            performance_info = f" (took {record.duration:.3f}s)"
        else:
            performance_info = ""
        
        # 基本格式
        timestamp = datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S')
        
        # 根据日志级别设置颜色（用于控制台输出）
        if record.levelno >= logging.ERROR:
            level_color = "\033[91m"  # 红色
        elif record.levelno >= logging.WARNING:
            level_color = "\033[93m"  # 黄色
        elif record.levelno >= logging.INFO:
            level_color = "\033[92m"  # 绿色
        else:
            level_color = "\033[94m"  # 蓝色
        
        reset_color = "\033[0m"
        
        # 格式化消息
        formatted_message = (
            f"{timestamp} - "
            f"{level_color}{record.levelname:8}{reset_color} - "
            f"{record.name} - "
            f"{record.getMessage()}"
            f"{compile_context}"
            f"{performance_info}"
        )
        
        # 添加异常信息
        if record.exc_info:
            formatted_message += f"\n{self.formatException(record.exc_info)}"
        
        return formatted_message

class JSONFormatter(logging.Formatter):
    """JSON格式的日志格式化器"""
    
    def format(self, record):
        log_entry = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        
        # 添加编译相关信息
        if hasattr(record, 'compile_id'):
            log_entry["compile_id"] = record.compile_id
        
        if hasattr(record, 'duration'):
            log_entry["duration"] = record.duration
        
        if hasattr(record, 'cache_hit'):
            log_entry["cache_hit"] = record.cache_hit
        
        if hasattr(record, 'error_category'):
            log_entry["error_category"] = record.error_category
        
        # 添加异常信息
        if record.exc_info:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": traceback.format_exception(*record.exc_info)
            }
        
        return json.dumps(log_entry, ensure_ascii=False)

class CompileServiceLogger:
    """编译服务日志管理器"""
    
    def __init__(self, 
                 log_level: str = "INFO",
                 log_dir: str = "logs",
                 enable_file_logging: bool = True,
                 enable_json_logging: bool = False,
                 max_file_size: int = 10 * 1024 * 1024,  # 10MB
                 backup_count: int = 5):
        """
        初始化日志管理器
        
        Args:
            log_level: 日志级别
            log_dir: 日志目录
            enable_file_logging: 是否启用文件日志
            enable_json_logging: 是否启用JSON格式日志
            max_file_size: 单个日志文件最大大小
            backup_count: 保留的备份文件数量
        """
        self.log_level = getattr(logging, log_level.upper())
        self.log_dir = Path(log_dir)
        self.enable_file_logging = enable_file_logging
        self.enable_json_logging = enable_json_logging
        self.max_file_size = max_file_size
        self.backup_count = backup_count
        
        # 创建日志目录
        if self.enable_file_logging:
            self.log_dir.mkdir(exist_ok=True)
        
        # 配置根日志器
        self._setup_root_logger()
        
        # 配置各个模块的日志器
        self._setup_module_loggers()
        
        # 日志统计
        self.stats = {
            "debug_count": 0,
            "info_count": 0,
            "warning_count": 0,
            "error_count": 0,
            "critical_count": 0
        }
        
        # 添加统计处理器
        self._add_stats_handler()
        
        logger = logging.getLogger(__name__)
        logger.info(f"CompileServiceLogger initialized - level: {log_level}, file_logging: {enable_file_logging}")
    
    def _setup_root_logger(self):
        """配置根日志器"""
        root_logger = logging.getLogger()
        root_logger.setLevel(self.log_level)
        
        # 清除现有处理器
        for handler in root_logger.handlers[:]:
            root_logger.removeHandler(handler)
        
        # 控制台处理器
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(self.log_level)
        console_handler.setFormatter(CompileServiceFormatter())
        root_logger.addHandler(console_handler)
        
        # 文件处理器
        if self.enable_file_logging:
            # 主日志文件
            main_log_file = self.log_dir / "compile_service.log"
            file_handler = logging.handlers.RotatingFileHandler(
                main_log_file,
                maxBytes=self.max_file_size,
                backupCount=self.backup_count,
                encoding='utf-8'
            )
            file_handler.setLevel(self.log_level)
            file_handler.setFormatter(CompileServiceFormatter())
            root_logger.addHandler(file_handler)
            
            # 错误日志文件
            error_log_file = self.log_dir / "errors.log"
            error_handler = logging.handlers.RotatingFileHandler(
                error_log_file,
                maxBytes=self.max_file_size,
                backupCount=self.backup_count,
                encoding='utf-8'
            )
            error_handler.setLevel(logging.ERROR)
            error_handler.setFormatter(CompileServiceFormatter())
            root_logger.addHandler(error_handler)
            
            # JSON格式日志（如果启用）
            if self.enable_json_logging:
                json_log_file = self.log_dir / "compile_service.json"
                json_handler = logging.handlers.RotatingFileHandler(
                    json_log_file,
                    maxBytes=self.max_file_size,
                    backupCount=self.backup_count,
                    encoding='utf-8'
                )
                json_handler.setLevel(self.log_level)
                json_handler.setFormatter(JSONFormatter())
                root_logger.addHandler(json_handler)
    
    def _setup_module_loggers(self):
        """配置各个模块的日志器"""
        module_configs = {
            "tsx_compiler": logging.INFO,
            "cache_manager": logging.INFO,
            "redis_cache": logging.INFO,
            "error_handler": logging.INFO,
            "compile_routes": logging.INFO,
            "node_compiler": logging.DEBUG
        }
        
        for module_name, level in module_configs.items():
            logger = logging.getLogger(module_name)
            logger.setLevel(level)
    
    def _add_stats_handler(self):
        """添加统计处理器"""
        class StatsHandler(logging.Handler):
            def __init__(self, stats_dict):
                super().__init__()
                self.stats = stats_dict
            
            def emit(self, record):
                level_name = record.levelname.lower()
                if level_name in self.stats:
                    self.stats[f"{level_name}_count"] += 1
        
        stats_handler = StatsHandler(self.stats)
        root_logger = logging.getLogger()
        root_logger.addHandler(stats_handler)
    
    def get_logger(self, name: str) -> logging.Logger:
        """获取指定名称的日志器"""
        return logging.getLogger(name)
    
    def log_compile_start(self, compile_id: str, code_length: int, libraries: list):
        """记录编译开始"""
        logger = logging.getLogger("tsx_compiler")
        logger.info(
            f"编译开始 - 代码长度: {code_length}, 依赖: {libraries}",
            extra={"compile_id": compile_id}
        )
    
    def log_compile_success(self, compile_id: str, duration: float, cached: bool, output_size: int):
        """记录编译成功"""
        logger = logging.getLogger("tsx_compiler")
        cache_info = "缓存命中" if cached else "新编译"
        logger.info(
            f"编译成功 - {cache_info}, 输出大小: {output_size}字符",
            extra={"compile_id": compile_id, "duration": duration, "cache_hit": cached}
        )
    
    def log_compile_error(self, compile_id: str, duration: float, error: Exception, error_category: str = None):
        """记录编译错误"""
        logger = logging.getLogger("tsx_compiler")
        logger.error(
            f"编译失败 - {str(error)}",
            extra={
                "compile_id": compile_id, 
                "duration": duration,
                "error_category": error_category
            },
            exc_info=True
        )
    
    def log_cache_operation(self, operation: str, key: str, hit: bool = None, duration: float = None):
        """记录缓存操作"""
        logger = logging.getLogger("cache_manager")
        message = f"缓存{operation} - key: {key[:20]}..."
        
        extra = {}
        if hit is not None:
            extra["cache_hit"] = hit
            message += f", 命中: {hit}"
        if duration is not None:
            extra["duration"] = duration
            message += f", 耗时: {duration:.3f}s"
        
        logger.debug(message, extra=extra)
    
    def log_error_analysis(self, error_category: str, error_message: str, suggestions_count: int):
        """记录错误分析结果"""
        logger = logging.getLogger("error_handler")
        logger.info(
            f"错误分析 - 类别: {error_category}, 建议数: {suggestions_count}",
            extra={"error_category": error_category}
        )
    
    def log_system_event(self, event: str, details: Dict[str, Any] = None):
        """记录系统事件"""
        logger = logging.getLogger("system")
        message = f"系统事件: {event}"
        if details:
            message += f" - {details}"
        logger.info(message)
    
    def get_stats(self) -> Dict[str, Any]:
        """获取日志统计信息"""
        total_logs = sum(self.stats.values())
        
        return {
            "total_logs": total_logs,
            "debug_count": self.stats["debug_count"],
            "info_count": self.stats["info_count"],
            "warning_count": self.stats["warning_count"],
            "error_count": self.stats["error_count"],
            "critical_count": self.stats["critical_count"],
            "log_level": logging.getLevelName(self.log_level),
            "file_logging_enabled": self.enable_file_logging,
            "json_logging_enabled": self.enable_json_logging,
            "log_directory": str(self.log_dir) if self.enable_file_logging else None
        }
    
    def get_recent_errors(self, count: int = 10) -> List[Dict[str, Any]]:
        """获取最近的错误日志"""
        if not self.enable_file_logging:
            return []
        
        error_log_file = self.log_dir / "errors.log"
        if not error_log_file.exists():
            return []
        
        try:
            with open(error_log_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # 返回最后几行
            recent_lines = lines[-count:] if len(lines) > count else lines
            
            errors = []
            for line in recent_lines:
                if line.strip():
                    errors.append({
                        "timestamp": line.split(' - ')[0] if ' - ' in line else "unknown",
                        "content": line.strip()
                    })
            
            return errors
            
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to read error log: {str(e)}")
            return []
    
    def set_log_level(self, level: str):
        """动态设置日志级别"""
        new_level = getattr(logging, level.upper())
        
        # 更新根日志器
        root_logger = logging.getLogger()
        root_logger.setLevel(new_level)
        
        # 更新所有处理器
        for handler in root_logger.handlers:
            handler.setLevel(new_level)
        
        self.log_level = new_level
        
        logger = logging.getLogger(__name__)
        logger.info(f"Log level changed to: {level}")
    
    def cleanup_old_logs(self, days: int = 30):
        """清理旧日志文件"""
        if not self.enable_file_logging:
            return 0
        
        cutoff_time = time.time() - (days * 24 * 60 * 60)
        cleaned_count = 0
        
        try:
            for log_file in self.log_dir.glob("*.log*"):
                if log_file.stat().st_mtime < cutoff_time:
                    log_file.unlink()
                    cleaned_count += 1
            
            logger = logging.getLogger(__name__)
            logger.info(f"Cleaned up {cleaned_count} old log files")
            
            return cleaned_count
            
        except Exception as e:
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to cleanup old logs: {str(e)}")
            return 0

# 全局日志管理器实例
_logger_instance: Optional[CompileServiceLogger] = None

def get_logger_manager() -> CompileServiceLogger:
    """获取全局日志管理器实例"""
    global _logger_instance
    if _logger_instance is None:
        log_level = os.getenv('LOG_LEVEL', 'INFO')
        enable_file_logging = os.getenv('ENABLE_FILE_LOGGING', 'true').lower() == 'true'
        enable_json_logging = os.getenv('ENABLE_JSON_LOGGING', 'false').lower() == 'true'
        
        _logger_instance = CompileServiceLogger(
            log_level=log_level,
            enable_file_logging=enable_file_logging,
            enable_json_logging=enable_json_logging
        )
    
    return _logger_instance

def setup_logging():
    """设置全局日志配置"""
    get_logger_manager()

# 便利函数
def get_compile_logger(name: str = "tsx_compiler") -> logging.Logger:
    """获取编译相关的日志器"""
    return get_logger_manager().get_logger(name)