"""
编译错误处理模块

实现编译错误的捕获、分类和处理机制，提供用户友好的错误信息
"""

import json
import re
import traceback
import logging
from typing import Dict, Any, List, Optional, Tuple
from enum import Enum
from dataclasses import dataclass
import time

logger = logging.getLogger(__name__)

class ErrorCategory(Enum):
    """错误分类"""
    SYNTAX_ERROR = "syntax_error"           # 语法错误
    TYPE_ERROR = "type_error"               # 类型错误
    IMPORT_ERROR = "import_error"           # 导入错误
    DEPENDENCY_ERROR = "dependency_error"   # 依赖错误
    COMPILATION_ERROR = "compilation_error" # 编译错误
    RUNTIME_ERROR = "runtime_error"         # 运行时错误
    SYSTEM_ERROR = "system_error"           # 系统错误
    UNKNOWN_ERROR = "unknown_error"         # 未知错误

class ErrorSeverity(Enum):
    """错误严重程度"""
    LOW = "low"         # 警告级别
    MEDIUM = "medium"   # 错误级别
    HIGH = "high"       # 严重错误
    CRITICAL = "critical" # 致命错误

@dataclass
class ErrorInfo:
    """错误信息数据类"""
    category: ErrorCategory
    severity: ErrorSeverity
    message: str
    original_error: str
    suggestions: List[str]
    line: Optional[int] = None
    column: Optional[int] = None
    file: Optional[str] = None
    error_code: Optional[str] = None
    context: Optional[str] = None

class CompileErrorHandler:
    """编译错误处理器"""
    
    def __init__(self):
        """初始化错误处理器"""
        # 错误模式匹配规则
        self.error_patterns = self._init_error_patterns()
        
        # 统计信息
        self.stats = {
            "total_errors": 0,
            "categorized_errors": 0,
            "fixed_errors": 0,
            "error_categories": {category.value: 0 for category in ErrorCategory},
            "error_severities": {severity.value: 0 for severity in ErrorSeverity}
        }
        
        logger.info("CompileErrorHandler initialized")
    
    def _init_error_patterns(self) -> List[Dict[str, Any]]:
        """初始化错误模式匹配规则"""
        return [
            # TypeScript 语法错误
            {
                "pattern": r"Expected.*but found|Unexpected end of file|Unexpected token",
                "category": ErrorCategory.SYNTAX_ERROR,
                "severity": ErrorSeverity.HIGH,
                "suggestions": [
                    "检查语法是否正确",
                    "确认括号、引号是否匹配",
                    "查看TypeScript语法文档"
                ]
            },
            
            # 导入错误
            {
                "pattern": r"Cannot resolve module|Module.*has no exported member|Could not resolve",
                "category": ErrorCategory.IMPORT_ERROR,
                "severity": ErrorSeverity.MEDIUM,
                "suggestions": [
                    "检查模块名是否正确",
                    "确认依赖库是否已添加到libraries列表",
                    "检查模块是否存在"
                ]
            },
            
            # 类型错误
            {
                "pattern": r"Type.*is not assignable to type|Property.*does not exist on type",
                "category": ErrorCategory.TYPE_ERROR,
                "severity": ErrorSeverity.MEDIUM,
                "suggestions": [
                    "检查变量类型是否匹配",
                    "添加类型转换",
                    "更新类型定义"
                ]
            },
            
            # React 相关错误
            {
                "pattern": r"JSX element.*has no corresponding closing tag|React.*must be in scope",
                "category": ErrorCategory.SYNTAX_ERROR,
                "severity": ErrorSeverity.HIGH,
                "suggestions": [
                    "检查JSX标签是否正确闭合",
                    "确认自闭合标签使用了'/>'",
                    "添加 import React from 'react'"
                ]
            },
            
            # 依赖错误
            {
                "pattern": r"Could not resolve '[^']*'",
                "category": ErrorCategory.DEPENDENCY_ERROR,
                "severity": ErrorSeverity.MEDIUM,
                "suggestions": [
                    "检查依赖是否正确安装",
                    "确认依赖版本兼容性",
                    "检查网络连接"
                ]
            },
            
            # 编译错误
            {
                "pattern": r"Build failed with [0-9]+ errors?",
                "category": ErrorCategory.COMPILATION_ERROR,
                "severity": ErrorSeverity.HIGH,
                "suggestions": [
                    "修复上述编译错误",
                    "检查代码语法",
                    "查看详细错误信息"
                ]
            },
            
            # 系统错误
            {
                "pattern": r"ENOENT|EACCES|EPERM",
                "category": ErrorCategory.SYSTEM_ERROR,
                "severity": ErrorSeverity.CRITICAL,
                "suggestions": [
                    "检查文件权限",
                    "确认文件路径存在",
                    "联系系统管理员"
                ]
            },
            {
                "pattern": r"out of memory|memory allocation failed",
                "category": ErrorCategory.SYSTEM_ERROR,
                "severity": ErrorSeverity.CRITICAL,
                "suggestions": [
                    "减少代码复杂度",
                    "增加系统内存",
                    "优化编译配置"
                ]
            }
        ]
    
    def analyze_error(self, error_message: str, error_stack: Optional[str] = None) -> ErrorInfo:
        """
        分析错误并返回错误信息
        
        Args:
            error_message: 错误消息
            error_stack: 错误堆栈
            
        Returns:
            ErrorInfo: 错误信息对象
        """
        self.stats["total_errors"] += 1
        
        # 清理错误消息
        cleaned_message = self._clean_error_message(error_message)
        
        # 尝试匹配错误模式
        for pattern_info in self.error_patterns:
            if re.search(pattern_info["pattern"], cleaned_message, re.IGNORECASE):
                category = pattern_info["category"]
                severity = pattern_info["severity"]
                suggestions = pattern_info["suggestions"]
                
                # 更新统计信息
                self.stats["categorized_errors"] += 1
                self.stats["error_categories"][category.value] += 1
                self.stats["error_severities"][severity.value] += 1
                
                # 尝试提取位置信息
                line, column = self._extract_location(cleaned_message)
                
                logger.debug(f"Error categorized as {category.value}: {cleaned_message[:100]}")
                
                return ErrorInfo(
                    category=category,
                    severity=severity,
                    message=self._format_user_message(cleaned_message, category),
                    original_error=error_message,
                    suggestions=suggestions,
                    line=line,
                    column=column,
                    context=self._extract_context(error_stack) if error_stack else None
                )
        
        # 未匹配的错误
        self.stats["error_categories"][ErrorCategory.UNKNOWN_ERROR.value] += 1
        self.stats["error_severities"][ErrorSeverity.MEDIUM.value] += 1
        
        logger.warning(f"Unrecognized error pattern: {cleaned_message[:100]}")
        
        return ErrorInfo(
            category=ErrorCategory.UNKNOWN_ERROR,
            severity=ErrorSeverity.MEDIUM,
            message=self._format_user_message(cleaned_message, ErrorCategory.UNKNOWN_ERROR),
            original_error=error_message,
            suggestions=[
                "检查代码语法和结构",
                "查看完整错误信息",
                "参考相关文档",
                "联系技术支持"
            ]
        )
    
    def _clean_error_message(self, message: str) -> str:
        """清理错误消息"""
        # 移除文件路径
        cleaned = re.sub(r'/[^\s]*\.ts|/[^\s]*\.tsx|/[^\s]*\.js|/[^\s]*\.jsx', '<file>', message)
        
        # 移除行号信息中的具体数字
        cleaned = re.sub(r':\d+:\d+', ':<line>:<column>', cleaned)
        
        # 移除时间戳
        cleaned = re.sub(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}', '<timestamp>', cleaned)
        
        # 移除多余空白
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        return cleaned
    
    def _extract_location(self, message: str) -> Tuple[Optional[int], Optional[int]]:
        """从错误消息中提取位置信息"""
        # 匹配行号和列号
        location_match = re.search(r'(?:line|:)\s*(\d+)(?:,?\s*(?:column|:)\s*(\d+))?', message, re.IGNORECASE)
        if location_match:
            line = int(location_match.group(1))
            column = int(location_match.group(2)) if location_match.group(2) else None
            return line, column
        
        return None, None
    
    def _extract_context(self, stack: str) -> Optional[str]:
        """从错误堆栈中提取上下文信息"""
        if not stack:
            return None
        
        # 提取前几行堆栈信息
        lines = stack.split('\n')[:5]
        context_lines = []
        
        for line in lines:
            if line.strip() and not line.strip().startswith('at '):
                context_lines.append(line.strip())
        
        return '\n'.join(context_lines) if context_lines else None
    
    def _format_user_message(self, message: str, category: ErrorCategory) -> str:
        """格式化用户友好的错误消息"""
        category_prefixes = {
            ErrorCategory.SYNTAX_ERROR: "语法错误",
            ErrorCategory.TYPE_ERROR: "类型错误", 
            ErrorCategory.IMPORT_ERROR: "导入错误",
            ErrorCategory.DEPENDENCY_ERROR: "依赖错误",
            ErrorCategory.COMPILATION_ERROR: "编译错误",
            ErrorCategory.RUNTIME_ERROR: "运行时错误",
            ErrorCategory.SYSTEM_ERROR: "系统错误",
            ErrorCategory.UNKNOWN_ERROR: "未知错误"
        }
        
        prefix = category_prefixes.get(category, "错误")
        
        # 简化复杂的错误消息
        if len(message) > 200:
            message = message[:200] + "..."
        
        return f"{prefix}: {message}"
    
    def suggest_fixes(self, error_info: ErrorInfo, code: str) -> List[str]:
        """
        根据错误信息和代码内容建议修复方案
        
        Args:
            error_info: 错误信息
            code: 源代码
            
        Returns:
            List[str]: 修复建议列表
        """
        suggestions = error_info.suggestions.copy()
        
        # 基于代码内容的动态建议
        if error_info.category == ErrorCategory.IMPORT_ERROR:
            missing_imports = self._detect_missing_imports(code)
            if missing_imports:
                suggestions.extend([
                    f"尝试添加导入: {', '.join(missing_imports)}"
                ])
        
        elif error_info.category == ErrorCategory.SYNTAX_ERROR:
            syntax_issues = self._detect_syntax_issues(code)
            suggestions.extend(syntax_issues)
        
        elif error_info.category == ErrorCategory.TYPE_ERROR:
            if "useState" in code and "React.useState" not in code:
                suggestions.append("尝试添加: import { useState } from 'react'")
        
        return suggestions
    
    def _detect_missing_imports(self, code: str) -> List[str]:
        """检测可能缺失的导入"""
        missing_imports = []
        
        # 检查常见的React hooks
        if "useState" in code and "import" not in code and "useState" not in code[:100]:
            missing_imports.append("import { useState } from 'react'")
        
        if "useEffect" in code and "useEffect" not in code[:100]:
            missing_imports.append("import { useEffect } from 'react'")
        
        # 检查React本身
        if ("<" in code and ">" in code) and "import React" not in code:
            missing_imports.append("import React from 'react'")
        
        return missing_imports
    
    def _detect_syntax_issues(self, code: str) -> List[str]:
        """检测语法问题"""
        issues = []
        
        # 检查括号匹配
        if code.count('(') != code.count(')'):
            issues.append("检查圆括号是否匹配")
        
        if code.count('{') != code.count('}'):
            issues.append("检查花括号是否匹配")
        
        if code.count('[') != code.count(']'):
            issues.append("检查方括号是否匹配")
        
        # 检查JSX
        if "<" in code and ">" in code:
            # 简单的JSX标签检查
            if code.count('<') != code.count('>'):
                issues.append("检查JSX标签是否正确闭合")
        
        return issues
    
    def create_error_response(self, error: Exception, code: str = "", 
                            error_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        创建标准的错误响应
        
        Args:
            error: 异常对象
            code: 源代码
            error_context: 错误上下文信息
            
        Returns:
            Dict: 标准错误响应
        """
        error_message = str(error)
        error_stack = traceback.format_exc() if hasattr(error, '__traceback__') else None
        
        # 分析错误
        error_info = self.analyze_error(error_message, error_stack)
        
        # 生成修复建议
        suggestions = self.suggest_fixes(error_info, code)
        
        # 构建响应
        response = {
            "success": False,
            "error": {
                "message": error_info.message,
                "category": error_info.category.value,
                "severity": error_info.severity.value,
                "original_error": error_info.original_error,
                "suggestions": suggestions,
                "timestamp": time.time()
            },
            "compiledCode": None,
            "sourceMap": None,
            "dependencies": [],
            "assets": []
        }
        
        # 添加位置信息（如果有）
        if error_info.line is not None:
            response["error"]["location"] = {
                "line": error_info.line,
                "column": error_info.column,
                "file": error_info.file
            }
        
        # 添加上下文信息
        if error_info.context:
            response["error"]["context"] = error_info.context
        
        # 添加错误上下文
        if error_context:
            response["error"]["context_info"] = error_context
        
        logger.error(f"Created error response: {error_info.category.value} - {error_info.message}")
        
        return response
    
    def get_stats(self) -> Dict[str, Any]:
        """获取错误处理统计信息"""
        total_errors = self.stats["total_errors"]
        categorization_rate = (
            self.stats["categorized_errors"] / total_errors 
            if total_errors > 0 else 0.0
        )
        
        return {
            "total_errors": total_errors,
            "categorized_errors": self.stats["categorized_errors"],
            "categorization_rate": round(categorization_rate, 3),
            "fixed_errors": self.stats["fixed_errors"],
            "error_categories": self.stats["error_categories"],
            "error_severities": self.stats["error_severities"],
            "patterns_count": len(self.error_patterns)
        }
    
    def add_custom_pattern(self, pattern: str, category: ErrorCategory, 
                          severity: ErrorSeverity, suggestions: List[str]):
        """添加自定义错误模式"""
        self.error_patterns.append({
            "pattern": pattern,
            "category": category,
            "severity": severity,
            "suggestions": suggestions
        })
        
        logger.info(f"Added custom error pattern: {pattern}")

# 全局错误处理器实例
_error_handler_instance: Optional[CompileErrorHandler] = None

def get_error_handler() -> CompileErrorHandler:
    """获取全局错误处理器实例"""
    global _error_handler_instance
    if _error_handler_instance is None:
        _error_handler_instance = CompileErrorHandler()
    return _error_handler_instance