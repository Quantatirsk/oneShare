"""
编译服务 FastAPI 路由
实现 TSX 编译相关的 REST API 端点
"""

from fastapi import APIRouter, HTTPException, status, Form, File, UploadFile
from fastapi.responses import JSONResponse
from typing import Dict, Any, List, Optional
import logging
import asyncio
import json

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from models import CompileRequest, CompileResponse, CompileOptions
from .tsx_compiler import get_compile_service
from .error_handler import get_error_handler

# 创建路由器
router = APIRouter(prefix="/api/compile", tags=["compile"])

# 日志配置
logger = logging.getLogger(__name__)

# 获取编译服务实例
compile_service = get_compile_service()

@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """编译服务健康检查"""
    try:
        return {
            "status": "ok",
            "service": "tsx-compile",
            "version": "1.0.0",
            "features": [
                "tsx_compilation",
                "library_resolution", 
                "ast_auto_fix",
                "import_auto_fix",
                "lucide_icon_fallback",
                "intelligent_caching",
                "performance_monitoring",
                "js_output",
                "html_output"
            ],
            "supported_output_types": ["js", "html"]
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"服务健康检查失败: {str(e)}"
        )

@router.post("/")
async def compile_tsx(
    code: str = Form(..., description="TSX代码内容"),
    libraries: str = Form(default="[]", description="依赖库列表 (JSON数组格式)"),
    options: str = Form(default="{}", description="编译选项 (JSON对象格式)")
) -> CompileResponse:
    """编译 TSX 代码 - 使用 Form 数据避免长字符串问题"""
    try:
        # 验证输入
        if not code or not code.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="代码内容不能为空"
            )
        
        # 解析 libraries 和 options
        try:
            libraries_list = json.loads(libraries) if libraries != "[]" else []
            options_dict = json.loads(options) if options != "{}" else {}
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"JSON格式错误: {str(e)}"
            )
        
        # 创建编译选项对象
        compile_options = CompileOptions(**options_dict) if options_dict else None
        
        # 创建编译请求
        request = CompileRequest(
            code=code,
            libraries=libraries_list,
            options=compile_options
        )
        
        logger.info(f"收到编译请求: {len(request.code)} 字符, 库: {request.libraries}")
        
        # 执行编译
        result = await compile_service.compile(request)
        
        if result.success:
            logger.info(f"编译成功: 时间 {result.compile_time:.3f}s, 缓存 {result.cached}")
        else:
            logger.error(f"编译失败: {result.error}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"编译请求处理失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"编译服务内部错误: {str(e)}"
        )

@router.get("/stats")
async def get_compile_stats() -> Dict[str, Any]:
    """获取编译统计信息"""
    try:
        stats = compile_service.get_stats()
        
        # 扩展统计信息
        extended_stats = {
            **stats,
            "supported_targets": ["es2020", "es2021", "es2022", "esnext"],
            "supported_formats": ["esm", "cjs", "iife"],
            "supported_output_types": ["js", "html"]
        }
        
        return extended_stats
        
    except Exception as e:
        logger.error(f"获取统计信息失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取统计信息失败: {str(e)}"
        )

@router.get("/cache/stats")
async def get_cache_stats() -> Dict[str, Any]:
    """获取缓存统计信息"""
    try:
        cache_manager = compile_service.cache_manager
        
        # 计算缓存统计
        total_entries = cache_manager.get_cache_size()
        memory_entries = len(getattr(cache_manager, '_memory_cache', {}))
        file_entries = total_entries - memory_entries
        redis_entries = 0  # 如果使用Redis，这里需要实际计算
        
        # 计算命中率
        total_compiles = compile_service.stats.get("total_compiles", 0)
        cache_hits = compile_service.stats.get("cache_hits", 0)
        hit_rate = cache_hits / total_compiles if total_compiles > 0 else 0.0
        miss_rate = 1.0 - hit_rate
        
        return {
            "total_entries": total_entries,
            "memory_cache_entries": memory_entries,
            "file_cache_entries": file_entries,
            "redis_cache_entries": redis_entries,
            "cache_size_mb": total_entries * 0.001,  # 估算
            "hit_rate": round(hit_rate, 3),
            "miss_rate": round(miss_rate, 3)
        }
        
    except Exception as e:
        logger.error(f"获取缓存统计失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取缓存统计失败: {str(e)}"
        )

@router.post("/validate")
async def validate_code(request: Dict[str, str]) -> Dict[str, Any]:
    """验证代码语法"""
    try:
        code = request.get("code", "").strip()
        
        if not code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="代码内容不能为空"
            )
        
        # 使用编译服务的验证功能
        result = await compile_service.validate_code(code)
        
        logger.info(f"代码验证完成: 有效={result.get('valid', False)}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"代码验证失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"代码验证失败: {str(e)}"
        )

@router.delete("/cache")
async def clear_cache() -> Dict[str, Any]:
    """清空编译缓存"""
    try:
        result = await compile_service.clear_cache()
        
        logger.info(f"缓存清理完成: {result}")
        
        return result
        
    except Exception as e:
        logger.error(f"清理缓存失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"清理缓存失败: {str(e)}"
        )

@router.get("/cache/health")
async def cache_health() -> Dict[str, Any]:
    """检查缓存健康状态"""
    try:
        cache_manager = compile_service.cache_manager
        
        # 基础健康检查
        health_info = {
            "status": "healthy",
            "cache_entries": cache_manager.get_cache_size(),
            "memory_cache_available": hasattr(cache_manager, '_memory_cache'),
            "file_cache_available": hasattr(cache_manager, '_cache_dir'),
            "redis_cache_available": False,  # 需要实际检查Redis连接
            "last_check": "2025-07-05T09:38:00Z"
        }
        
        return health_info
        
    except Exception as e:
        logger.error(f"缓存健康检查失败: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "last_check": "2025-07-05T09:38:00Z"
        }


@router.get("/options")
async def get_compile_options() -> Dict[str, Any]:
    """获取编译选项说明"""
    try:
        return {
            "targets": ["es2020", "es2021", "es2022", "esnext"],
            "formats": ["esm", "cjs", "iife"],
            "jsx_modes": ["automatic", "react", "react-jsx"],
            "output_types": [
                {
                    "type": "js",
                    "description": "纯JavaScript模块输出",
                    "use_case": "适合集成到现有项目"
                },
                {
                    "type": "html",
                    "description": "完整HTML页面输出",
                    "use_case": "适合独立部署和分享"
                }
            ],
            "default_options": {
                "target": "es2020",
                "format": "esm",
                "minify": False,
                "sourceMap": False,
                "jsx": "automatic",
                "outputType": "js",
                "enableAutoFix": True,
                "enableImportFix": False,
                "autoFixAttempts": 2
            }
        }
        
    except Exception as e:
        logger.error(f"获取编译选项失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取编译选项失败: {str(e)}"
        )