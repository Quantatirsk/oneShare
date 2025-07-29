"""
TSX 编译服务核心模块

实现 CompileService 类，负责管理编译请求和缓存机制
"""

import asyncio
import hashlib
import json
import logging
import time
from typing import Optional, Dict, Any, List
from pathlib import Path

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from models import CompileRequest, CompileResponse, CompiledData, CompileOptions
from .cache_manager import CacheManager
from .error_handler import get_error_handler, ErrorCategory

logger = logging.getLogger(__name__)

class CompileService:
    """编译服务核心类"""
    
    def __init__(self, cache_manager: Optional[CacheManager] = None):
        """
        初始化编译服务
        
        Args:
            cache_manager: 缓存管理器实例，如果未提供则创建默认实例
        """
        self.cache_manager = cache_manager or CacheManager()
        self.error_handler = get_error_handler()
        self.node_compiler_path = Path(__file__).parent / "node_compiler"
        self.compile_script_path = self.node_compiler_path / "compile.js"
        
        # 编译统计信息
        self.stats = {
            "total_compiles": 0,
            "successful_compiles": 0,
            "failed_compiles": 0,
            "cache_hits": 0,
            "total_compile_time": 0.0,
            "error_categories": {}
        }
        
        # 确保 Node.js 编译器目录存在
        self.node_compiler_path.mkdir(exist_ok=True)
        
        logger.info(f"CompileService initialized with node_compiler_path: {self.node_compiler_path}")
    
    async def compile(self, request: CompileRequest) -> CompileResponse:
        """
        编译 TSX 代码
        
        Args:
            request: 编译请求
            
        Returns:
            CompileResponse: 编译结果
        """
        start_time = time.time()
        self.stats["total_compiles"] += 1
        
        try:
            # 生成缓存键
            cache_key = self._generate_cache_key(request)
            
            # 检查缓存
            cached_result = await self.cache_manager.get(cache_key)
            if cached_result:
                self.stats["cache_hits"] += 1
                logger.info(f"Cache hit for key: {cache_key}")
                
                return CompileResponse(
                    success=True,
                    data=CompiledData(**cached_result),
                    cached=True,
                    compile_time=time.time() - start_time,
                    cache_key=cache_key
                )
            
            # 执行编译
            result = await self._compile_with_node(request)
            
            # 如果需要HTML输出，生成HTML包装
            if result.success and result.data and request.options and request.options.outputType == "html":
                result = await self._wrap_as_html(result, request)
            
            # 缓存结果
            if result.success and result.data:
                await self.cache_manager.set(cache_key, result.data.model_dump())
                result.cache_key = cache_key
            
            # 更新统计信息
            compile_time = time.time() - start_time
            self.stats["total_compile_time"] += compile_time
            
            if result.success:
                self.stats["successful_compiles"] += 1
            else:
                self.stats["failed_compiles"] += 1
            
            result.compile_time = compile_time
            return result
            
        except Exception as e:
            self.stats["failed_compiles"] += 1
            compile_time = time.time() - start_time
            self.stats["total_compile_time"] += compile_time
            
            # 记录详细错误信息
            error_details = {
                "error_type": type(e).__name__,
                "error_message": str(e),
                "libraries": request.libraries,
                "options": request.options.model_dump() if request.options else None,
                "compile_time": compile_time
            }
            
            logger.error(f"Compilation failed: {error_details}")
            
            # 使用错误处理器分析错误
            try:
                error_response = self.error_handler.create_error_response(
                    error=e,
                    code=request.code,
                    error_context=error_details
                )
                
                # 更新错误统计
                error_category = error_response["error"]["category"]
                if error_category not in self.stats["error_categories"]:
                    self.stats["error_categories"][error_category] = 0
                self.stats["error_categories"][error_category] += 1
                
                error_message = error_response["error"]["message"]
            except Exception as handler_error:
                logger.error(f"Error handler failed: {str(handler_error)}")
                error_message = f"编译失败: {str(e)}"
            
            return CompileResponse(
                success=False,
                error=error_message,
                cached=False,
                compile_time=compile_time,
                data=None
            )
    
    async def _compile_with_node(self, request: CompileRequest) -> CompileResponse:
        """
        使用 Node.js 编译器执行编译
        
        Args:
            request: 编译请求
            
        Returns:
            CompileResponse: 编译结果
        """
        try:

            # 准备编译参数
            compile_input = {
                "code": request.code,
                "libraries": request.libraries,
                "options": request.options.model_dump() if request.options else CompileOptions().model_dump()
            }
            
            # 使用临时文件来避免缓冲区限制
            import tempfile
            import os
            
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as input_file:
                json.dump(compile_input, input_file)
                input_file_path = input_file.name
            
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as output_file:
                output_file_path = output_file.name
            
            try:
                # 执行 Node.js 编译脚本，使用文件重定向
                with open(input_file_path, 'r') as stdin_file, open(output_file_path, 'w') as stdout_file:
                    process = await asyncio.create_subprocess_exec(
                        "node",
                        str(self.compile_script_path),
                        stdin=stdin_file,
                        stdout=stdout_file,
                        stderr=asyncio.subprocess.PIPE,
                        cwd=str(self.node_compiler_path)
                    )
                    
                    # 等待进程完成
                    _, stderr = await process.communicate()
                
                # 读取输出文件
                with open(output_file_path, 'r') as f:
                    stdout = f.read()
                    
            finally:
                # 清理临时文件
                try:
                    os.unlink(input_file_path)
                    os.unlink(output_file_path)
                except:
                    pass
            
            # 检查进程返回码
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "未知编译错误"
                logger.error(f"Node.js compiler failed with return code {process.returncode}: {error_msg}")
                logger.error(f"Compiler stderr: {repr(stderr.decode() if stderr else 'No stderr')}")
                return CompileResponse(
                    success=False,
                    error=f"编译器错误: {error_msg}"
                )
            
            # 检查stderr即使返回码为0
            if stderr:
                logger.warning(f"Compiler stderr (return code 0): {repr(stderr.decode())}")
            
            # 解析编译结果
            try:
                # 添加调试信息
                logger.info(f"Compiler stdout length: {len(stdout)}")
                logger.info(f"Compiler stdout content (first 200 chars): {repr(stdout[:200])}")
                
                if not stdout.strip():
                    logger.error("Node.js compiler returned empty output")
                    return CompileResponse(
                        success=False,
                        error="编译器没有返回任何输出"
                    )
                
                result_data = json.loads(stdout)
                
                if result_data.get("success"):
                    # 生成内容哈希
                    content_hash = hashlib.sha256(result_data["compiledCode"].encode()).hexdigest()[:12]
                    
                    # 获取输出类型
                    output_type = request.options.outputType if request.options else "js"
                    
                    # 处理自动修复信息
                    auto_fix_info = None
                    if "autoFix" in result_data and result_data["autoFix"]:
                        from models import AutoFixInfo
                        auto_fix_data = result_data["autoFix"]
                        auto_fix_info = AutoFixInfo(
                            applied=auto_fix_data.get("applied", False),
                            fixesCount=auto_fix_data.get("fixesCount"),
                            fixes=auto_fix_data.get("fixes"),
                            stages=auto_fix_data.get("stages"),
                            warnings=auto_fix_data.get("warnings")
                        )
                    
                    compiled_data = CompiledData(
                        compiledCode=result_data["compiledCode"],
                        sourceMap=result_data.get("sourceMap"),
                        dependencies=result_data.get("dependencies", []),
                        hash=content_hash,
                        assets=result_data.get("assets", []),
                        outputType=output_type,
                        fixedCode=result_data.get("fixedCode"),
                        autoFix=auto_fix_info
                    )
                    
                    return CompileResponse(
                        success=True,
                        data=compiled_data
                    )
                else:
                    return CompileResponse(
                        success=False,
                        error=result_data.get("error", "编译失败")
                    )
                    
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse compiler output: {e}")
                return CompileResponse(
                    success=False,
                    error=f"编译器输出解析失败: {str(e)}"
                )
                
        except Exception as e:
            logger.error(f"Node.js compilation failed: {str(e)}")
            return CompileResponse(
                success=False,
                error=f"编译过程异常: {str(e)}"
            )
    
    def _generate_cache_key(self, request: CompileRequest) -> str:
        """
        生成缓存键
        
        Args:
            request: 编译请求
            
        Returns:
            str: 缓存键
        """
        # 创建包含所有相关信息的字典
        options = request.options or CompileOptions()
        cache_data = {
            "code": request.code,
            "libraries": sorted(request.libraries),
            "options": options.model_dump(),
        }
        
        
        # 生成哈希
        cache_str = json.dumps(cache_data, sort_keys=True)
        cache_hash = hashlib.sha256(cache_str.encode()).hexdigest()
        
        return f"compile:{cache_hash[:16]}"
    
    def get_stats(self) -> Dict[str, Any]:
        """
        获取编译统计信息
        
        Returns:
            Dict: 统计信息
        """
        avg_compile_time = (
            self.stats["total_compile_time"] / self.stats["total_compiles"]
            if self.stats["total_compiles"] > 0 else 0.0
        )
        
        cache_hit_rate = (
            self.stats["cache_hits"] / self.stats["total_compiles"]
            if self.stats["total_compiles"] > 0 else 0.0
        )
        
        # 获取错误处理器统计
        error_handler_stats = self.error_handler.get_stats()
        
        return {
            "total_compiles": self.stats["total_compiles"],
            "successful_compiles": self.stats["successful_compiles"],
            "failed_compiles": self.stats["failed_compiles"],
            "cache_hit_rate": round(cache_hit_rate, 3),
            "average_compile_time": round(avg_compile_time, 3),
            "cache_hits": self.stats["cache_hits"],
            "active_cache_entries": self.cache_manager.get_cache_size(),
            "error_categories": self.stats["error_categories"],
            "error_handler_stats": error_handler_stats
        }
    
    async def clear_cache(self) -> Dict[str, Any]:
        """
        清空编译缓存
        
        Returns:
            Dict: 清理结果
        """
        try:
            cleared_entries = await self.cache_manager.clear()
            logger.info(f"Cleared {cleared_entries} cache entries")
            
            return {
                "success": True,
                "message": f"已清理 {cleared_entries} 个缓存条目",
                "cleared_entries": cleared_entries
            }
        except Exception as e:
            logger.error(f"Failed to clear cache: {str(e)}")
            return {
                "success": False,
                "message": f"缓存清理失败: {str(e)}",
                "cleared_entries": 0
            }
    
    async def validate_code(self, code: str) -> Dict[str, Any]:
        """
        验证代码语法（基础版本）
        
        Args:
            code: 要验证的代码
            
        Returns:
            Dict: 验证结果
        """
        try:
            # 基础语法检查
            checks = {
                "has_jsx": "<" in code and ">" in code,
                "has_react_imports": "react" in code.lower(),
                "has_function_component": any(
                    pattern in code for pattern in [
                        "function ", "const ", "=> {", "=> ("
                    ]
                ),
                "estimated_complexity": "low" if len(code) < 1000 else "medium" if len(code) < 5000 else "high"
            }
            
            # 生成建议
            suggestions = []
            if not checks["has_react_imports"]:
                suggestions.append("建议添加 React 相关导入")
            if not checks["has_jsx"]:
                suggestions.append("未检测到 JSX 语法")
            if checks["estimated_complexity"] == "high":
                suggestions.append("代码复杂度较高，建议考虑拆分组件")
            
            return {
                "valid": True,
                "checks": checks,
                "suggestions": suggestions
            }
            
        except Exception as e:
            logger.error(f"Code validation failed: {str(e)}")
            return {
                "valid": False,
                "error": f"验证失败: {str(e)}"
            }
    
    async def _wrap_as_html(self, result: CompileResponse, request: CompileRequest) -> CompileResponse:
        """
        将JS编译结果包装为HTML
        
        Args:
            result: JS编译结果
            request: 原始编译请求
            
        Returns:
            CompileResponse: HTML包装结果
        """
        try:
            if not result.success or not result.data:
                return result
            
            # 自动检测组件名称
            component_name = self._detect_component_name(request.code)
            
            # 生成HTML内容
            html_content = await self._generate_html_template(
                compiled_js=result.data.compiledCode,
                component_name=component_name,
                libraries=request.libraries,
                dependencies=result.data.dependencies,
                request=request
            )
            
            # 更新结果数据
            result.data.outputType = "html"
            result.data.htmlContent = html_content
            
            return result
            
        except Exception as e:
            logger.error(f"HTML wrapping failed: {str(e)}")
            return CompileResponse(
                success=False,
                error=f"HTML包装失败: {str(e)}"
            )
    
    def _detect_component_name(self, code: str) -> str:
        """从代码中检测组件名称"""
        import re
        
        # 尝试匹配各种组件定义模式
        patterns = [
            r'export\s+default\s+function\s+([A-Z][a-zA-Z0-9]*)',
            r'export\s+default\s+([A-Z][a-zA-Z0-9]*)',
            r'const\s+([A-Z][a-zA-Z0-9]*)\s*[:=].*=>',
            r'function\s+([A-Z][a-zA-Z0-9]*)\s*\(',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, code)
            if match:
                return match.group(1)
        
        return "App"  # 默认组件名
    
    async def _generate_html_template(self, compiled_js: str, component_name: str, libraries: List[str], dependencies: List[str], request: CompileRequest) -> str:
        """生成HTML模板"""
        return await self._generate_esm_html(compiled_js, component_name, libraries, dependencies, request)
    
    async def _generate_esm_html(self, compiled_js: str, component_name: str, libraries: List[str], dependencies: List[str], request: CompileRequest) -> str:
        """生成ESM模块格式的HTML"""
        return await self._generate_cdn_esm_html(compiled_js, component_name, libraries, dependencies, request)
    
    async def _generate_cdn_esm_html(self, compiled_js: str, component_name: str, libraries: List[str], dependencies: List[str], request: CompileRequest) -> str:
        """生成使用CDN的ESM模块格式HTML"""
        # 使用CDN链接
        styles_content = '<script src="https://cdn.tailwindcss.com"></script>'
        react_import_code = '''
        // 动态导入 React DOM
        const { createRoot } = await import('https://esm.sh/react-dom@latest/client');
        const React = await import('https://esm.sh/react@latest');'''
        library_import_code = ''
    
        processed_js = compiled_js
        
        # 正确的代码转义顺序：先转义反斜杠，再转义反引号，最后转义模板字符串插值
        escaped_js = processed_js.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
        
        return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{component_name}</title>
    {styles_content}
    <style>
        body {{ margin: 0; font-family: system-ui, sans-serif; }}
        .loading {{ display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #f3f4f6, #e5e7eb); }}
        .error {{ display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fef2f2; }}
    </style>
</head>
<body>
    <div id="root">
        <div class="loading">
            <div class="text-center">
                <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                <p class="mt-4 text-gray-600 text-lg">页面加载中...</p>
            </div>
        </div>
    </div>

<script type="module">
    // 错误处理
    window.addEventListener('error', (e) => {{
        console.error('应用错误:', e.error);
        document.getElementById('root').innerHTML = `
        <div class="error">
            <div class="text-center p-8">
                <h1 class="text-2xl font-bold text-red-600 mb-4">🔥 加载失败</h1>
                <p class="text-gray-600 mb-4">${{e.error?.message || '未知错误'}}</p>
                <button onclick="location.reload()" class="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                    重新加载
                </button>
                <details class="mt-4 text-left">
                    <summary class="cursor-pointer text-gray-500">查看错误详情</summary>
                    <pre class="mt-2 p-4 bg-gray-100 rounded text-sm overflow-auto">${{e.error?.stack || '无详细信息'}}</pre>
                </details>
            </div>
        </div>`;
    }});

    // 加载并渲染组件
    async function loadApp() {{
        // 等待依赖加载
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 使用经过安全转义后的代码
        const moduleCode = `{escaped_js}`;

        // 创建模块 blob URL
        const blob = new Blob([moduleCode], {{ type: 'application/javascript' }});
        const moduleUrl = URL.createObjectURL(blob);

        // 动态导入模块
        const module = await import(moduleUrl);
        const Component = module.default;
        
        // 清理 blob URL
        URL.revokeObjectURL(moduleUrl);

        if (!Component) {{
            throw new Error('未找到默认导出的组件 (No default export found)');
        }}
        
        {react_import_code}
        {library_import_code}

        // 渲染组件
        const root = createRoot(document.getElementById('root'));
        root.render(React.createElement(Component));
    }}

    // 启动应用
    loadApp();
</script>

</body>
</html>'''
    
    

# 全局编译服务实例
_compile_service_instance: Optional[CompileService] = None

def get_compile_service() -> CompileService:
    """
    获取全局编译服务实例
    
    Returns:
        CompileService: 编译服务实例
    """
    global _compile_service_instance
    if _compile_service_instance is None:
        _compile_service_instance = CompileService()
    return _compile_service_instance