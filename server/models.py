from pydantic import BaseModel
from typing import Optional, Any, List, Dict

class FileResponse(BaseModel):
    """统一的文件操作响应模型"""
    success: bool
    message: Optional[str] = None
    data: Optional[Any] = None
    error: Optional[str] = None
    code: Optional[str] = None

# 编译服务相关模型
class CompileOptions(BaseModel):
    """编译选项配置"""
    target: str = "es2020"
    format: str = "esm"
    minify: bool = False
    sourceMap: bool = False
    jsx: str = "automatic"
    outputType: str = "js"  # "js" or "html"
    # 可读性配置
    keepNames: bool = True  # 保持函数和类名
    formatCode: bool = True  # 是否格式化代码
    preserveComments: bool = False  # 保留注释
    preserveWhitespace: bool = True  # 保留空白字符
    humanReadable: bool = True  # 人类可读模式
    htmlFormat: str = "esm"  # HTML格式: 只支持 "esm" (ESM模块)
    # 自动修复配置
    enableAutoFix: bool = True  # 启用AST自动修复
    enableImportFix: bool = False  # 启用导入修复
    autoFixAttempts: int = 2  # 自动修复尝试次数

class CompileRequest(BaseModel):
    """编译请求模型"""
    code: str
    libraries: List[str] = []
    options: Optional[CompileOptions] = None

class AutoFixInfo(BaseModel):
    """自动修复信息"""
    applied: bool
    fixesCount: Optional[int] = None
    fixes: Optional[List[Dict[str, Any]]] = None
    stages: Optional[List[Dict[str, Any]]] = None
    warnings: Optional[List[Dict[str, Any]]] = None

class CompiledData(BaseModel):
    """编译结果数据"""
    compiledCode: str
    sourceMap: Optional[str] = None
    dependencies: List[str] = []
    hash: str
    assets: List[str] = []
    attempt: Optional[int] = None
    outputType: str = "js"  # "js" or "html"
    htmlContent: Optional[str] = None  # HTML输出时的完整HTML内容
    fixedCode: Optional[str] = None  # 自动修复后的TSX代码
    autoFix: Optional[AutoFixInfo] = None  # 自动修复详细信息

class CompileResponse(BaseModel):
    """编译响应模型"""
    success: bool
    data: Optional[CompiledData] = None
    error: Optional[str] = None
    cached: bool = False
    compile_time: Optional[float] = None
    cache_key: Optional[str] = None