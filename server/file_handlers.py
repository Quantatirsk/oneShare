import os
import json
import hashlib
import urllib.parse
import re
from datetime import datetime
from typing import Optional, List
from fastapi import UploadFile
import aiofiles
import shutil
import aiohttp
import asyncio

from models import FileResponse
from config import (
    MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, UPLOAD_CHUNK_SIZE, 
    TEMP_UPLOAD_DIR, API_ENDPOINT, FILE_STORAGE_PATH
)
from utils import (
    is_safe_path, get_unified_storage_directory, get_mime_type, 
    should_display_inline, encode_filename
)
from metadata_config import get_metadata_manager
from sqlite_metadata_manager import FileMetadata

# 辅助函数
async def _calculate_file_hash(file_path: str) -> str:
    """计算文件MD5哈希值"""
    hash_md5 = hashlib.md5()
    async with aiofiles.open(file_path, "rb") as f:
        while chunk := await f.read(8192):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def _count_uploaded_chunks(temp_dir: str) -> int:
    """统计已上传的分片数量"""
    if not os.path.exists(temp_dir):
        return 0
    
    chunk_files = [f for f in os.listdir(temp_dir) if f.startswith("chunk_") and not f.endswith(".meta")]
    return len(chunk_files)


async def handle_chunk_upload(file: UploadFile, filename: str, chunk_index: int, user_dir: str, 
                             total_chunks: int = None, chunk_hash: str = None) -> FileResponse:
    """处理文件分片上传
    
    Args:
        file: 上传的文件分片
        filename: 目标文件名
        chunk_index: 分片索引（从0开始）
        user_dir: 用户目录
        total_chunks: 总分片数（可选，用于验证）
        chunk_hash: 分片哈希值（可选，用于验证分片完整性）
    """
    print(f"开始处理分片上传: filename={filename}, chunk_index={chunk_index}, total_chunks={total_chunks}")
    
    # 参数验证
    if not filename:
        print("错误: 缺少文件名")
        return FileResponse(
            success=False,
            error="缺少文件名",
            code="MISSING_FILENAME"
        )
    
    if not file:
        print("错误: 缺少文件数据")
        return FileResponse(
            success=False,
            error="缺少文件数据",
            code="MISSING_FILE_DATA"
        )
    
    if chunk_index < 0:
        print(f"错误: 无效的分片索引 {chunk_index}")
        return FileResponse(
            success=False,
            error="分片索引必须大于等于0",
            code="INVALID_CHUNK_INDEX"
        )
    
    if total_chunks is not None and (total_chunks <= 0 or chunk_index >= total_chunks):
        print(f"错误: 分片索引 {chunk_index} 超出范围 (总数: {total_chunks})")
        return FileResponse(
            success=False,
            error="分片索引超出范围",
            code="CHUNK_INDEX_OUT_OF_RANGE"
        )
    
    # 安全路径检查
    if not is_safe_path(filename):
        print(f"错误: 非法的文件路径 {filename}")
        return FileResponse(
            success=False,
            error="非法的文件路径",
            code="INVALID_PATH"
        )
    
    try:
        # 为文件创建唯一的临时目录
        file_id = hashlib.md5(filename.encode()).hexdigest()
        temp_dir = os.path.join(TEMP_UPLOAD_DIR, file_id)
        print(f"临时目录路径: {temp_dir}")
        os.makedirs(temp_dir, exist_ok=True)
        
        # 分片文件路径
        chunk_file = os.path.join(temp_dir, f"chunk_{chunk_index}")
        print(f"分片文件路径: {chunk_file}")
        
        # 检查分片是否已存在（避免重复上传）
        if os.path.exists(chunk_file):
            existing_size = os.path.getsize(chunk_file)
            print(f"分片 {chunk_index} 已存在，大小: {existing_size} 字节")
            
            # 如果提供了哈希值，验证现有分片
            if chunk_hash:
                existing_hash = await _calculate_file_hash(chunk_file)
                if existing_hash == chunk_hash:
                    print(f"分片 {chunk_index} 哈希验证通过，跳过上传")
                    return FileResponse(
                        success=True,
                        message=f"分片 {chunk_index} 已存在且完整",
                        data={
                            "filename": filename,
                            "chunk_index": chunk_index,
                            "chunk_size": existing_size,
                            "status": "already_exists"
                        }
                    )
                else:
                    print(f"分片 {chunk_index} 哈希验证失败，重新上传")
                    os.remove(chunk_file)
            else:
                # 没有哈希验证，直接返回已存在的分片
                return FileResponse(
                    success=True,
                    message=f"分片 {chunk_index} 已存在",
                    data={
                        "filename": filename,
                        "chunk_index": chunk_index,
                        "chunk_size": existing_size,
                        "status": "already_exists"
                    }
                )
        
        # 写入分片
        chunk_size = 0
        chunk_data = b""
        print(f"开始写入分片 {chunk_index}")
        
        async with aiofiles.open(chunk_file, "wb") as f:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                # 检查分片大小限制
                if chunk_size + len(chunk) > MAX_FILE_SIZE_BYTES:
                    print(f"错误: 分片 {chunk_index} 太大")
                    await f.close()
                    if os.path.exists(chunk_file):
                        os.remove(chunk_file)
                    return FileResponse(
                        success=False,
                        error=f"分片大小超过限制（最大 {MAX_FILE_SIZE_MB}MB）",
                        code="CHUNK_TOO_LARGE"
                    )
                
                await f.write(chunk)
                chunk_size += len(chunk)
                
                # 如果需要验证哈希，保存数据
                if chunk_hash:
                    chunk_data += chunk
        
        # 验证分片哈希（如果提供）
        if chunk_hash:
            calculated_hash = hashlib.md5(chunk_data).hexdigest()
            if calculated_hash != chunk_hash:
                print(f"错误: 分片 {chunk_index} 哈希验证失败")
                if os.path.exists(chunk_file):
                    os.remove(chunk_file)
                return FileResponse(
                    success=False,
                    error="分片数据完整性验证失败",
                    code="CHUNK_HASH_MISMATCH"
                )
            print(f"分片 {chunk_index} 哈希验证成功")
        
        # 保存分片元数据
        metadata_file = os.path.join(temp_dir, f"chunk_{chunk_index}.meta")
        chunk_metadata = {
            "chunk_index": chunk_index,
            "chunk_size": chunk_size,
            "upload_time": datetime.now().isoformat(),
            "filename": filename,
            "hash": chunk_hash
        }
        
        if total_chunks is not None:
            chunk_metadata["total_chunks"] = total_chunks
        
        async with aiofiles.open(metadata_file, "w") as f:
            await f.write(json.dumps(chunk_metadata))
        
        print(f"分片 {chunk_index} 上传成功, 大小: {chunk_size} 字节")
        
        # 检查是否所有分片都已上传（如果知道总数）
        uploaded_chunks = _count_uploaded_chunks(temp_dir)
        is_complete = total_chunks is not None and uploaded_chunks == total_chunks
        
        response_data = {
            "filename": filename,
            "chunk_index": chunk_index,
            "chunk_size": chunk_size,
            "uploaded_chunks": uploaded_chunks,
            "status": "uploaded"
        }
        
        if total_chunks is not None:
            response_data["total_chunks"] = total_chunks
            response_data["progress"] = (uploaded_chunks / total_chunks) * 100
            response_data["is_complete"] = is_complete
        
        if is_complete:
            response_data["message"] = "所有分片上传完成，可以开始合并"
        
        return FileResponse(
            success=True,
            message=f"分片 {chunk_index} 上传成功",
            data=response_data
        )
    
    except Exception as e:
        print(f"分片上传失败: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # 清理失败的分片文件
        if 'chunk_file' in locals() and os.path.exists(chunk_file):
            try:
                os.remove(chunk_file)
                print(f"已清理失败的分片文件: {chunk_file}")
            except:
                pass
        
        return FileResponse(
            success=False,
            error=f"分片上传失败: {str(e)}",
            code="CHUNK_UPLOAD_ERROR"
        )

async def handle_chunk_complete(filename: str, total_chunks: int, user_dir: str) -> FileResponse:
    """处理分片上传完成，合并文件"""
    print(f"开始处理分片合并: filename={filename}, total_chunks={total_chunks}")
    
    if not filename:
        print("错误: 缺少文件名")
        return FileResponse(
            success=False,
            error="缺少文件名",
            code="MISSING_FILENAME"
        )
    
    # 安全路径检查
    if not is_safe_path(filename):
        print(f"错误: 非法的文件路径 {filename}")
        return FileResponse(
            success=False,
            error="非法的文件路径",
            code="INVALID_PATH"
        )
    
    try:
        # 获取文件ID和临时目录
        file_id = hashlib.md5(filename.encode()).hexdigest()
        temp_dir = os.path.join(TEMP_UPLOAD_DIR, file_id)
        print(f"临时目录路径: {temp_dir}")
        
        if not os.path.exists(temp_dir):
            print(f"错误: 临时目录不存在: {temp_dir}")
            return FileResponse(
                success=False,
                error="没有找到上传的分片文件",
                code="NO_CHUNKS_FOUND"
            )
        
        # 检查临时目录中的文件
        temp_files = os.listdir(temp_dir)
        print(f"临时目录中的文件: {temp_files}")
        
        # 处理文件路径，确保目录存在
        file_path = os.path.join(user_dir, filename)
        print(f"目标文件路径: {file_path}")
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # 检查文件是否已存在
        if os.path.exists(file_path):
            print(f"错误: 文件已存在: {file_path}")
            return FileResponse(
                success=False,
                error="文件已存在",
                code="FILE_EXISTS"
            )
        
        # 合并分片
        file_size = 0
        print(f"开始合并 {total_chunks} 个分片...")
        async with aiofiles.open(file_path, "wb") as output_file:
            for i in range(total_chunks):
                chunk_file = os.path.join(temp_dir, f"chunk_{i}")
                if not os.path.exists(chunk_file):
                    print(f"错误: 缺少分片 {i}, 路径: {chunk_file}")
                    return FileResponse(
                        success=False,
                        error=f"缺少分片 {i}",
                        code="MISSING_CHUNK"
                    )
                
                print(f"正在处理分片 {i}: {chunk_file}")
                async with aiofiles.open(chunk_file, "rb") as input_file:
                    while chunk := await input_file.read(512 * 1024):  # 512KB chunks
                        await output_file.write(chunk)
                        file_size += len(chunk)
        
        print(f"所有分片合并完成, 总大小: {file_size} 字节")
        
        # 记录文件元数据
        await save_file_metadata(file_path, filename, file_size)
        
        # 清理临时文件
        print(f"清理临时目录: {temp_dir}")
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        print(f"文件上传完成: {filename}")
        return FileResponse(
            success=True,
            message="文件上传成功",
            data={
                "filename": filename,
                "size": file_size
            }
        )
    
    except Exception as e:
        print(f"合并文件失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return FileResponse(
            success=False,
            error=f"合并文件失败: {str(e)}",
            code="MERGE_ERROR"
        )







# 元数据辅助函数
async def save_file_metadata(file_path: str, filename: str, file_size: int):
    """保存文件元数据"""
    metadata = {
        "filename": filename,
        "size": file_size,
        "upload_time": datetime.now().isoformat(),
        "last_modified": datetime.now().isoformat()
    }
    
    metadata_path = file_path + ".meta"
    async with aiofiles.open(metadata_path, "w") as f:
        await f.write(json.dumps(metadata))

async def load_file_metadata(file_path: str) -> dict:
    """加载文件元数据"""
    metadata_path = file_path + ".meta"
    metadata = {}
    if os.path.exists(metadata_path):
        try:
            async with aiofiles.open(metadata_path, "r") as f:
                metadata = json.loads(await f.read())
        except:
            pass
    return metadata

async def update_file_metadata(file_path: str, filename: str, file_size: int):
    """更新文件元数据"""
    metadata_path = file_path + ".meta"
    metadata = {
        "filename": filename,
        "size": file_size,
        "last_modified": datetime.now().isoformat()
    }
    
    if os.path.exists(metadata_path):
        try:
            async with aiofiles.open(metadata_path, "r") as f:
                old_metadata = json.loads(await f.read())
            metadata["upload_time"] = old_metadata.get("upload_time", datetime.now().isoformat())
        except:
            metadata["upload_time"] = datetime.now().isoformat()
    else:
        metadata["upload_time"] = datetime.now().isoformat()
    
    async with aiofiles.open(metadata_path, "w") as f:
        await f.write(json.dumps(metadata))

async def handle_batch_delete(filenames: List[str], user_dir: str) -> FileResponse:
    """处理批量删除"""
    if not filenames:
        return FileResponse(
            success=False,
            error="文件列表为空",
            code="EMPTY_FILE_LIST"
        )
    
    try:
        deleted_files = []
        failed_files = []
        
        for filename in filenames:
            if not is_safe_path(filename):
                failed_files.append({
                    "filename": filename,
                    "error": "非法的文件路径"
                })
                continue
            
            file_path = os.path.join(user_dir, filename)
            
            if not os.path.exists(file_path):
                failed_files.append({
                    "filename": filename,
                    "error": "文件不存在"
                })
                continue
            
            try:
                if os.path.isfile(file_path):
                    # 删除文件
                    os.remove(file_path)
                    
                    # 删除元数据文件（如果存在）
                    metadata_path = file_path + ".meta"
                    if os.path.exists(metadata_path):
                        os.remove(metadata_path)
                elif os.path.isdir(file_path):
                    # 删除目录
                    shutil.rmtree(file_path)
                
                deleted_files.append(filename)
                
            except Exception as e:
                failed_files.append({
                    "filename": filename,
                    "error": str(e)
                })
        
        # 构建响应
        if deleted_files and not failed_files:
            return FileResponse(
                success=True,
                message=f"成功删除 {len(deleted_files)} 个文件/目录",
                data={
                    "deleted": deleted_files,
                    "total": len(filenames)
                }
            )
        elif deleted_files and failed_files:
            return FileResponse(
                success=True,
                message=f"成功删除 {len(deleted_files)} 个文件/目录，{len(failed_files)} 个失败",
                data={
                    "deleted": deleted_files,
                    "failed": failed_files,
                    "total": len(filenames)
                }
            )
        else:
            return FileResponse(
                success=False,
                error=f"所有文件删除失败",
                code="BATCH_DELETE_ALL_FAILED",
                data={
                    "failed": failed_files,
                    "total": len(filenames)
                }
            )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"批量删除失败: {str(e)}",
            code="BATCH_DELETE_ERROR"
        )

async def handle_unified_update(file_path: str, content: str, token: Optional[str] = None) -> FileResponse:
    """更新统一存储中的文件内容"""
    try:
        # URL解码
        file_path = urllib.parse.unquote(file_path)
        
        # 安全路径检查
        if not is_safe_path(file_path):
            return FileResponse(
                success=False,
                error="非法的文件路径",
                code="INVALID_PATH"
            )
        
        # 获取存储目录和文件路径
        storage_dir = get_unified_storage_directory()
        full_path = os.path.join(storage_dir, file_path)
        
        # 检查文件是否存在
        if not os.path.exists(full_path):
            return FileResponse(
                success=False,
                error="文件不存在",
                code="FILE_NOT_FOUND"
            )
        
        # 检查权限和锁定状态
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        file_metadata = await metadata_manager.load_metadata(file_path)
        
        if file_metadata and not file_metadata.is_public and not token:
            return FileResponse(
                success=False,
                error="需要认证才能编辑私有文件",
                code="AUTHENTICATION_REQUIRED"
            )
        
        # 检查文件是否被锁定
        if file_metadata and file_metadata.locked:
            return FileResponse(
                success=False,
                error="文件已被锁定，无法编辑",
                code="FILE_LOCKED"
            )
        
        # 备份原文件
        backup_path = full_path + ".backup"
        try:
            shutil.copy2(full_path, backup_path)
        except Exception as e:
            print(f"警告：无法创建备份文件: {str(e)}")
        
        # 写入新内容
        async with aiofiles.open(full_path, 'w', encoding='utf-8') as f:
            await f.write(content)
        
        # 更新元数据
        if file_metadata:
            file_metadata.last_modified = datetime.now().isoformat()
            file_metadata.size = len(content.encode('utf-8'))
            await metadata_manager.save_metadata(file_path, file_metadata)
        
        # 删除备份文件
        try:
            if os.path.exists(backup_path):
                os.remove(backup_path)
        except Exception as e:
            print(f"警告：无法删除备份文件: {str(e)}")
        
        return FileResponse(
            success=True,
            message="文件内容更新成功",
            data={
                "filename": file_path,
                "size": len(content.encode('utf-8')),
                "modified_time": datetime.now().isoformat()
            }
        )
    
    except Exception as e:
        # 如果出错，尝试恢复备份
        backup_path = os.path.join(get_unified_storage_directory(), file_path + ".backup")
        if os.path.exists(backup_path):
            try:
                shutil.copy2(backup_path, os.path.join(get_unified_storage_directory(), file_path))
                os.remove(backup_path)
                print(f"已恢复备份文件: {file_path}")
            except Exception as restore_e:
                print(f"恢复备份失败: {str(restore_e)}")
        
        return FileResponse(
            success=False,
            error=f"更新文件内容失败: {str(e)}",
            code="UPDATE_CONTENT_ERROR"
        )

async def handle_batch_download(filenames: List[str], user_dir: str):
    """处理批量下载 - 创建ZIP文件"""
    if not filenames:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "文件列表为空",
                "code": "EMPTY_FILE_LIST"
            }
        )
    
    try:
        import zipfile
        import tempfile
        import os
        from fastapi.responses import StreamingResponse

        # 创建临时ZIP文件
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        temp_zip.close()

        print(f"Creating ZIP file: {temp_zip.name}")

        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for filename in filenames:
                if not is_safe_path(filename):
                    print(f"Skipping unsafe path: {filename}")
                    continue

                file_path = os.path.join(user_dir, filename)
                print(f"Processing file: {filename} -> {file_path}")

                if os.path.exists(file_path):
                    if os.path.isfile(file_path):
                        if file_path.endswith(".meta"):
                            print(f"Skipping .meta file: {file_path}")
                            continue
                        print(f"Adding file to ZIP: {filename}")
                        zipf.write(file_path, filename)
                    elif os.path.isdir(file_path):
                        print(f"Adding directory to ZIP: {filename}")
                        for root, dirs, files in os.walk(file_path):
                            for file in files:
                                if file.endswith(".meta"):
                                    print(f"Skipping .meta file: {file}")
                                    continue
                                full_path = os.path.join(root, file)
                                relative_path = os.path.relpath(full_path, user_dir)
                                print(f"Adding file from directory: {relative_path}")
                                zipf.write(full_path, relative_path)
                else:
                    print(f"File not found: {file_path}")

        zip_size = os.path.getsize(temp_zip.name)
        print(f"ZIP file created: {temp_zip.name}, size: {zip_size} bytes")

        def iter_file():
            try:
                with open(temp_zip.name, 'rb') as file_like:
                    while chunk := file_like.read(8192):
                        yield chunk
            finally:
                try:
                    os.unlink(temp_zip.name)
                except:
                    pass

        headers = {
            'Content-Disposition': 'attachment; filename="batch_download.zip"',
            'Content-Type': 'application/zip'
        }

        return StreamingResponse(
            iter_file(),
            media_type='application/zip',
            headers=headers
        )

    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": f"批量下载失败: {str(e)}",
                "code": "BATCH_DOWNLOAD_ERROR"
            }
        )

async def handle_url_download(url: str, filename: str, storage_dir: str, progress_callback=None):
    """
    从URL下载文件到服务器
    """
    try:
        # 验证URL
        if not url.startswith(('http://', 'https://')):
            return FileResponse(
                success=False,
                error="无效的URL格式",
                code="INVALID_URL"
            )
        
        # 如果没有提供文件名，从URL推断
        if not filename:
            try:
                parsed_url = urllib.parse.urlparse(url)
                filename = os.path.basename(parsed_url.path) or f"download_{int(datetime.now().timestamp())}"
            except:
                filename = f"download_{int(datetime.now().timestamp())}"
        
        # 安全检查文件名
        if not is_safe_path(filename):
            return FileResponse(
                success=False,
                error="不安全的文件名",
                code="UNSAFE_FILENAME"
            )
        
        # 构建完整文件路径
        file_path = os.path.join(storage_dir, filename)
        
        # 确保目录存在
        os.makedirs(os.path.dirname(file_path) if os.path.dirname(file_path) else storage_dir, exist_ok=True)
        
        # 使用aiohttp下载文件
        timeout = aiohttp.ClientTimeout(total=300)  # 5分钟超时
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    return FileResponse(
                        success=False,
                        error=f"下载失败: HTTP {response.status}",
                        code="DOWNLOAD_ERROR"
                    )
                
                # 获取文件大小
                content_length = response.headers.get('content-length')
                total_size = int(content_length) if content_length else 0
                
                # 检查文件大小限制
                if total_size > MAX_FILE_SIZE_BYTES:
                    return FileResponse(
                        success=False,
                        error=f"文件太大: {total_size} bytes (最大 {MAX_FILE_SIZE_MB}MB)",
                        code="FILE_TOO_LARGE"
                    )
                
                downloaded_size = 0
                last_progress_report = 0
                
                async with aiofiles.open(file_path, 'wb') as f:
                    async for chunk in response.content.iter_chunked(UPLOAD_CHUNK_SIZE):
                        await f.write(chunk)
                        downloaded_size += len(chunk)
                        
                        # 进度节流：只有进度增加超过1%或者间隔足够大时才报告
                        if progress_callback and total_size > 0:
                            current_progress = (downloaded_size / total_size) * 100
                            progress_diff = current_progress - last_progress_report
                            
                            # 报告条件：进度增加超过1%，或者是最后一个chunk，或者文件小于10MB时增加超过5%
                            should_report = (
                                progress_diff >= 1.0 or  # 进度增加超过1%
                                downloaded_size == total_size or  # 下载完成
                                (total_size < 10 * 1024 * 1024 and progress_diff >= 5.0)  # 小文件5%间隔
                            )
                            
                            if should_report:
                                await progress_callback(current_progress, downloaded_size, total_size)
                                last_progress_report = current_progress
        
        # 使用MetadataManager保存包含original_url的完整元数据
        # metadata_manager已在文件顶部从metadata_config导入
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        
        # 创建包含URL信息的元数据对象
        metadata = FileMetadata(
            filename=filename,
            size=downloaded_size,
            upload_time=datetime.now().isoformat(),
            last_modified=datetime.now().isoformat(),
            is_public=True,  # 默认公开，API端点会处理权限
            content_type=response.headers.get('content-type', 'application/octet-stream'),
            created_by=None,
            tags=[],
            description="",
            notes="",
            original_url=url
        )
        
        # 保存元数据
        await metadata_manager.save_metadata(filename, metadata)
        
        return FileResponse(
            success=True,
            message=f"文件 {filename} 下载成功",
            data={
                "filename": filename,
                "size": downloaded_size,
                "url": url,
                "path": filename
            }
        )
        
    except aiohttp.ClientError as e:
        return FileResponse(
            success=False,
            error=f"网络错误: {str(e)}",
            code="NETWORK_ERROR"
        )
    except asyncio.TimeoutError:
        return FileResponse(
            success=False,
            error="下载超时",
            code="DOWNLOAD_TIMEOUT"
        )
    except Exception as e:
        # 清理可能创建的文件
        try:
            if 'file_path' in locals() and os.path.exists(file_path):
                os.remove(file_path)
            if 'meta_path' in locals() and os.path.exists(meta_path):
                os.remove(meta_path)
        except:
            pass
            
        return FileResponse(
            success=False,
            error=f"下载失败: {str(e)}",
            code="DOWNLOAD_ERROR"
        )

async def handle_url_content_processing(url: str, storage_dir: str, progress_callback=None):
    """
    处理URL内容（智能内容处理）
    - 检测内容类型
    - 处理文本/HTML内容
    - 转换HTML为Markdown
    - 保存处理后的内容
    """
    try:
        # 验证URL
        if not url.startswith(('http://', 'https://')):
            return FileResponse(
                success=False,
                error="无效的URL格式",
                code="INVALID_URL"
            )
        
        if progress_callback:
            await progress_callback("正在分析URL...")
            
        timeout = aiohttp.ClientTimeout(total=30)  # 30秒超时
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            # 1. 获取HEAD信息来检测内容类型
            if progress_callback:
                await progress_callback("正在检测内容类型...")
                
            try:
                async with session.head(url) as response:
                    content_type = response.headers.get('content-type', '').lower()
                    content_length = response.headers.get('content-length')
                    content_disposition = response.headers.get('content-disposition', '')
                    
                    # 从Content-Disposition获取文件名
                    filename = None
                    if content_disposition:
                        match = re.search(r'filename[^;=\n]*=(([\'"]).*?\2|[^;\n]*)', content_disposition)
                        if match and match.group(1):
                            filename = match.group(1).strip('\'"')
                            try:
                                filename = urllib.parse.unquote(filename)
                            except:
                                pass
                    
                    # 如果没有从headers获取到文件名，从URL获取
                    if not filename:
                        parsed_url = urllib.parse.urlparse(url)
                        if parsed_url.path:
                            filename = os.path.basename(parsed_url.path)
                            try:
                                filename = urllib.parse.unquote(filename)
                            except:
                                pass
                            
            except Exception as e:
                # HEAD请求失败，尝试直接GET
                if progress_callback:
                    await progress_callback("HEAD请求失败，尝试直接获取内容...")
                content_type = ''
                content_length = None
                filename = None
            
            # 2. 根据内容类型和文件扩展名决定处理方式
            if progress_callback:
                await progress_callback("正在获取内容...")
            
            # 首先根据URL扩展名进行智能判断
            parsed_url = urllib.parse.urlparse(url)
            url_path = parsed_url.path.lower()
            
            # 定义明确的二进制文件扩展名
            binary_extensions = {
                '.dmg', '.exe', '.msi', '.deb', '.rpm', '.pkg',
                '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
                '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
                '.mp3', '.mp4', '.avi', '.mkv', '.wav', '.flac',
                '.iso', '.img', '.bin', '.app', '.apk',
                '.whl', '.jar', '.war', '.ear'
            }
            
            # 检查是否为明确的二进制文件
            is_binary_by_extension = any(url_path.endswith(ext) for ext in binary_extensions)
            
            if is_binary_by_extension:
                # 明确的二进制文件，直接下载，不需要GET请求检查内容
                if progress_callback:
                    await progress_callback("检测到二进制文件，准备下载...")
                
                if not filename:
                    filename = os.path.basename(parsed_url.path) if parsed_url.path else f"download_{int(datetime.now().timestamp())}"
                    if filename:
                        try:
                            filename = urllib.parse.unquote(filename)
                        except:
                            pass
                    if not filename or '.' not in filename:
                        filename = f"download_{int(datetime.now().timestamp())}"
                
                # 创建适配的进度回调函数
                async def download_progress_callback(progress, downloaded_size, total_size):
                    if progress_callback:
                        if total_size > 0:
                            mb_downloaded = downloaded_size / (1024 * 1024)
                            mb_total = total_size / (1024 * 1024)
                            await progress_callback(f"下载中: {progress:.1f}% ({mb_downloaded:.1f}MB / {mb_total:.1f}MB)")
                        else:
                            mb_downloaded = downloaded_size / (1024 * 1024)
                            await progress_callback(f"下载中: {mb_downloaded:.1f}MB")
                
                # 直接使用下载逻辑
                return await handle_url_download(url, filename, storage_dir, download_progress_callback)
                
            async with session.get(url) as response:
                if response.status != 200:
                    return FileResponse(
                        success=False,
                        error=f"获取内容失败: HTTP {response.status}",
                        code="FETCH_ERROR"
                    )
                
                # 更新内容类型（如果HEAD请求没有获取到）
                if not content_type:
                    content_type = response.headers.get('content-type', '').lower()
                
                # 检查内容大小
                if not content_length:
                    content_length = response.headers.get('content-length')
                
                if content_length and int(content_length) > MAX_FILE_SIZE_BYTES:
                    return FileResponse(
                        success=False,
                        error=f"内容太大: {content_length} bytes (最大 {MAX_FILE_SIZE_MB}MB)",
                        code="CONTENT_TOO_LARGE"
                    )
                
                # 3. 处理不同类型的内容
                if 'text/html' in content_type or 'application/xhtml' in content_type:
                    # HTML内容 - 转换为Markdown
                    if progress_callback:
                        await progress_callback("正在转换HTML为Markdown...")
                    
                    # 使用Jina AI转换
                    jina_url = f"https://r.jina.ai/{url}"
                    
                    try:
                        async with session.get(jina_url) as jina_response:
                            if jina_response.status == 200:
                                markdown_content = await jina_response.text()
                                
                                # 从Markdown内容提取标题作为文件名
                                title = extract_title_from_markdown(markdown_content)
                                if title:
                                    # 清理标题作为文件名
                                    safe_title = sanitize_filename(title)
                                    filename = f"{safe_title}.md"
                                else:
                                    # 使用域名作为文件名
                                    parsed_url = urllib.parse.urlparse(url)
                                    domain = parsed_url.hostname.replace('www.', '') if parsed_url.hostname else 'webpage'
                                    filename = f"{domain}.md"
                                
                                return await save_text_content(filename, markdown_content, storage_dir, url)
                            else:
                                # Jina AI失败，保存原始HTML
                                html_content = await response.text()
                                if not filename:
                                    parsed_url = urllib.parse.urlparse(url)
                                    domain = parsed_url.hostname.replace('www.', '') if parsed_url.hostname else 'webpage'
                                    filename = f"{domain}.html"
                                
                                return await save_text_content(filename, html_content, storage_dir, url)
                    except Exception as e:
                        # Jina AI请求失败，保存原始HTML
                        html_content = await response.text()
                        if not filename:
                            parsed_url = urllib.parse.urlparse(url)
                            domain = parsed_url.hostname.replace('www.', '') if parsed_url.hostname else 'webpage'
                            filename = f"{domain}.html"
                        
                        return await save_text_content(filename, html_content, storage_dir, url)
                
                elif content_type.startswith('text/') or 'json' in content_type or 'javascript' in content_type or 'xml' in content_type:
                    # 文本内容 - 直接保存
                    if progress_callback:
                        await progress_callback("正在保存文本内容...")
                    
                    text_content = await response.text()
                    
                    # 确定文件扩展名
                    if not filename or '.' not in filename:
                        ext = get_extension_from_content_type(content_type)
                        if filename:
                            filename = f"{filename}.{ext}"
                        else:
                            parsed_url = urllib.parse.urlparse(url)
                            domain = parsed_url.hostname.replace('www.', '') if parsed_url.hostname else 'text'
                            timestamp = int(datetime.now().timestamp())
                            filename = f"{domain}-{timestamp}.{ext}"
                    
                    return await save_text_content(filename, text_content, storage_dir, url)
                
                else:
                    # 内容类型未知，根据扩展名判断
                    text_extensions = {
                        '.txt', '.md', '.markdown', '.rst', '.log',
                        '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
                        '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java',
                        '.c', '.cpp', '.h', '.hpp', '.css', '.scss', '.sass', '.less',
                        '.html', '.htm', '.php', '.sql', '.sh', '.bash', '.bat', '.ps1'
                    }
                    
                    is_text_by_extension = any(url_path.endswith(ext) for ext in text_extensions)
                    
                    if is_text_by_extension:
                        # 明确的文本文件，按文本处理
                        if progress_callback:
                            await progress_callback("检测到文本文件，正在保存...")
                        
                        text_content = await response.text()
                        
                        if not filename:
                            filename = os.path.basename(parsed_url.path) if parsed_url.path else f"text_{int(datetime.now().timestamp())}.txt"
                            if filename:
                                try:
                                    filename = urllib.parse.unquote(filename)
                                except:
                                    pass
                        
                        return await save_text_content(filename, text_content, storage_dir, url)
                    else:
                        # 既不是明确的文本也不是明确的二进制，根据内容大小判断
                        # 小文件尝试作为文本，大文件作为二进制
                        content_size = int(content_length) if content_length else 0
                        
                        if content_size > 0 and content_size < 1024 * 1024:  # 小于1MB，尝试文本
                            try:
                                if progress_callback:
                                    await progress_callback("尝试作为文本文件处理...")
                                
                                text_content = await response.text()
                                
                                if not filename:
                                    parsed_url = urllib.parse.urlparse(url)
                                    domain = parsed_url.hostname.replace('www.', '') if parsed_url.hostname else 'content'
                                    timestamp = int(datetime.now().timestamp())
                                    filename = f"{domain}-{timestamp}.txt"
                                
                                return await save_text_content(filename, text_content, storage_dir, url)
                            except Exception:
                                # 文本解析失败，作为二进制处理
                                if progress_callback:
                                    await progress_callback("文本处理失败，改为二进制下载...")
                        
                        # 二进制内容 - 直接下载
                        if progress_callback:
                            await progress_callback("正在下载二进制文件...")
                        
                        if not filename:
                            filename = os.path.basename(parsed_url.path) if parsed_url.path else f"download_{int(datetime.now().timestamp())}"
                            if filename:
                                try:
                                    filename = urllib.parse.unquote(filename)
                                except:
                                    pass
                            if not filename or '.' not in filename:
                                filename = f"download_{int(datetime.now().timestamp())}"
                        
                        # 创建适配的进度回调函数
                        async def download_progress_callback(progress, downloaded_size, total_size):
                            if progress_callback:
                                if total_size > 0:
                                    mb_downloaded = downloaded_size / (1024 * 1024)
                                    mb_total = total_size / (1024 * 1024)
                                    await progress_callback(f"下载中: {progress:.1f}% ({mb_downloaded:.1f}MB / {mb_total:.1f}MB)")
                                else:
                                    mb_downloaded = downloaded_size / (1024 * 1024)
                                    await progress_callback(f"下载中: {mb_downloaded:.1f}MB")
                        
                        # 使用现有的下载逻辑
                        return await handle_url_download(url, filename, storage_dir, download_progress_callback)
    
    except aiohttp.ClientError as e:
        return FileResponse(
            success=False,
            error=f"网络错误: {str(e)}",
            code="NETWORK_ERROR"
        )
    except asyncio.TimeoutError:
        return FileResponse(
            success=False,
            error="处理超时",
            code="PROCESSING_TIMEOUT"
        )
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"处理失败: {str(e)}",
            code="PROCESSING_ERROR"
        )

async def save_text_content(filename: str, content: str, storage_dir: str, original_url: str = None) -> FileResponse:
    """保存文本内容到文件"""
    try:
        # 安全检查文件名
        if not is_safe_path(filename):
            return FileResponse(
                success=False,
                error="不安全的文件名",
                code="UNSAFE_FILENAME"
            )
        
        # 构建完整文件路径
        file_path = os.path.join(storage_dir, filename)
        
        # 确保目录存在
        os.makedirs(os.path.dirname(file_path) if os.path.dirname(file_path) else storage_dir, exist_ok=True)
        
        # 保存文件
        async with aiofiles.open(file_path, 'w', encoding='utf-8') as f:
            await f.write(content)
        
        # 获取文件大小
        file_size = len(content.encode('utf-8'))
        
        # 使用MetadataManager保存包含original_url的完整元数据
        # metadata_manager已在文件顶部从metadata_config导入
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        
        # 创建包含URL信息的元数据对象
        metadata = FileMetadata(
            filename=filename,
            size=file_size,
            upload_time=datetime.now().isoformat(),
            last_modified=datetime.now().isoformat(),
            is_public=True,
            content_type="text/plain",
            created_by=None,
            tags=[],
            description="",
            notes="",
            original_url=original_url
        )
        
        # 保存元数据
        await metadata_manager.save_metadata(filename, metadata)
        
        return FileResponse(
            success=True,
            message=f"内容已保存为 {filename}",
            data={
                "filename": filename,
                "size": file_size,
                "type": "content",
                "path": filename
            }
        )
        
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"保存失败: {str(e)}",
            code="SAVE_ERROR"
        )

def extract_title_from_markdown(content: str) -> str:
    """从Markdown内容中提取标题"""
    lines = content.split('\n')
    
    # 首先查找第一行的 "Title: xxx" 格式
    if lines and lines[0].strip().startswith('Title: '):
        return lines[0].strip()[7:].strip()
    
    # 查找第一个 # 标题
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('# '):
            return stripped[2:].strip()
    
    return ''

def sanitize_filename(filename: str) -> str:
    """清理文件名，移除非法字符"""
    # 移除或替换非法字符
    # 保留中文、英文、数字、下划线、连字符、空格
    cleaned = re.sub(r'[^\w\u4e00-\u9fff\s\-]', '', filename)
    # 替换多个空格为单个空格
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    # 限制长度
    if len(cleaned) > 100:
        cleaned = cleaned[:100]
    
    return cleaned or 'untitled'

def get_extension_from_content_type(content_type: str) -> str:
    """根据Content-Type获取文件扩展名"""
    type_map = {
        'application/json': 'json',
        'text/html': 'html',
        'text/css': 'css',
        'application/javascript': 'js',
        'text/javascript': 'js',
        'text/csv': 'csv',
        'application/xml': 'xml',
        'text/xml': 'xml',
        'text/markdown': 'md',
        'text/plain': 'txt'
    }
    
    for mime_type, ext in type_map.items():
        if mime_type in content_type:
            return ext
    
    return 'txt'

# ============= 统一文件管理函数 =============

async def handle_unified_upload(file: UploadFile, filename: str, is_public: bool = True, 
                               user_token: str = None, tags: List[str] = None, 
                               description: str = "", notes: str = "") -> FileResponse:
    """统一的文件上传处理"""
    if not filename:
        return FileResponse(
            success=False,
            error="缺少文件名",
            code="MISSING_FILENAME"
        )
    
    if not file:
        return FileResponse(
            success=False,
            error="缺少文件数据",
            code="MISSING_FILE_DATA"
        )
    
    # 安全路径检查
    if not is_safe_path(filename):
        return FileResponse(
            success=False,
            error="非法的文件路径",
            code="INVALID_PATH"
        )
    
    try:
        # 使用统一存储目录
        storage_dir = get_unified_storage_directory()
        file_path = os.path.join(storage_dir, filename)
        
        # 处理文件路径，确保目录存在
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # 检查文件是否已存在
        if os.path.exists(file_path):
            return FileResponse(
                success=False,
                error="文件已存在",
                code="FILE_EXISTS"
            )
        
        # 使用流式写入，避免将大文件加载到内存
        file_size = 0
        async with aiofiles.open(file_path, "wb") as f:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                if file_size + len(chunk) > MAX_FILE_SIZE_BYTES:
                    await f.close()
                    os.remove(file_path)
                    return FileResponse(
                        success=False,
                        error=f"文件大小超过限制（最大 {MAX_FILE_SIZE_MB}MB）",
                        code="FILE_TOO_LARGE"
                    )
                await f.write(chunk)
                file_size += len(chunk)
        
        # 创建统一元数据
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        content_type = get_mime_type(filename)
        
        await metadata_manager.create_metadata(
            filename, file_size, is_public=is_public, 
            content_type=content_type, created_by=user_token,
            tags=tags or [], description=description, notes=notes
        )
        
        return FileResponse(
            success=True,
            message="文件上传成功",
            data={
                "filename": filename,
                "size": file_size,
                "is_public": is_public
            }
        )
    
    except Exception as e:
        # 如果文件已经创建，删除它
        if 'file_path' in locals() and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass
        return FileResponse(
            success=False,
            error=f"上传失败: {str(e)}",
            code="UPLOAD_ERROR"
        )

async def handle_unified_list(current_path: str = "", 
                            filter_mode: str = "all",  # "all", "public", "private"
                            user_token: str = None) -> FileResponse:
    """统一的文件列表处理"""
    try:
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        
        # 确定用户是否可以访问私有文件
        user_can_access_private = bool(user_token)
        
        # 确定过滤模式
        filter_public = None
        if filter_mode == "public":
            filter_public = True
        elif filter_mode == "private":
            filter_public = False
        
        # 获取文件列表
        files = await metadata_manager.list_files_with_metadata(
            directory=current_path,
            filter_public=filter_public,
            user_can_access_private=user_can_access_private
        )
        
        # 添加父目录项（如果不是根目录）
        if current_path:
            parent_path = os.path.dirname(current_path)
            files.insert(0, {
                "filename": parent_path,
                "display_name": "..",
                "type": "parent_dir",
                "size": 0,
                "modified_time": "",
                "upload_time": "",
                "is_public": True,
                "content_type": "directory",
                "tags": [],
                "description": "",
                "notes": "",
                "created_by": None
            })
        
        return FileResponse(
            success=True,
            message=f"共找到 {len(files)} 个项目",
            data={
                "files": files,
                "total": len(files),
                "current_path": current_path,
                "filter_mode": filter_mode
            }
        )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"获取文件列表失败: {str(e)}",
            code="LIST_ERROR"
        )

async def handle_unified_delete(filename: str, user_token: str = None) -> FileResponse:
    """统一的文件删除处理"""
    if not filename:
        return FileResponse(
            success=False,
            error="缺少文件名或目录名",
            code="MISSING_FILENAME"
        )
    
    if not is_safe_path(filename):
        return FileResponse(
            success=False,
            error="非法的文件路径",
            code="INVALID_PATH"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        path = os.path.join(storage_dir, filename)
        
        if not os.path.exists(path):
            return FileResponse(
                success=False,
                error="文件或目录不存在",
                code="PATH_NOT_FOUND"
            )
        
        # 检查权限和锁定状态
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        if os.path.isfile(path):
            metadata = await metadata_manager.load_metadata(filename)
            if metadata and not metadata.is_public and not user_token:
                return FileResponse(
                    success=False,
                    error="没有权限删除此文件",
                    code="PERMISSION_DENIED"
                )
            # 检查文件是否被锁定
            if metadata and metadata.locked:
                return FileResponse(
                    success=False,
                    error="文件已被锁定，无法删除",
                    code="FILE_LOCKED"
                )
        elif os.path.isdir(path):
            # 检查目录是否被锁定
            is_locked = await metadata_manager.is_directory_locked(filename)
            if is_locked:
                return FileResponse(
                    success=False,
                    error="目录已被锁定，无法删除",
                    code="DIRECTORY_LOCKED"
                )
        
        if os.path.isfile(path):
            # 删除文件
            os.remove(path)
            # 删除元数据
            await metadata_manager.delete_metadata(filename)
            
            return FileResponse(
                success=True,
                message="文件删除成功",
                data={"filename": filename}
            )
        elif os.path.isdir(path):
            # 递归删除目录及其内容
            import shutil
            shutil.rmtree(path)
            
            return FileResponse(
                success=True,
                message="目录删除成功",
                data={"dirname": filename}
            )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"删除失败: {str(e)}",
            code="DELETE_ERROR"
        )

async def handle_change_file_permission(filename: str, is_public: bool, 
                                      user_token: str = None) -> FileResponse:
    """修改文件权限"""
    if not filename:
        return FileResponse(
            success=False,
            error="缺少文件名",
            code="MISSING_FILENAME"
        )
    
    if not is_safe_path(filename):
        return FileResponse(
            success=False,
            error="非法的文件路径",
            code="INVALID_PATH"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        file_path = os.path.join(storage_dir, filename)
        
        if not os.path.exists(file_path):
            return FileResponse(
                success=False,
                error="文件不存在",
                code="FILE_NOT_FOUND"
            )
        
        # 检查当前权限（只有有权限的用户才能修改权限）
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        metadata = await metadata_manager.load_metadata(filename)
        
        if metadata and not metadata.is_public and not user_token:
            return FileResponse(
                success=False,
                error="没有权限修改此文件",
                code="PERMISSION_DENIED"
            )
        
        # 更新权限
        success = await metadata_manager.set_file_permission(filename, is_public)
        
        if success:
            return FileResponse(
                success=True,
                message=f"文件权限已{'公开' if is_public else '私有'}",
                data={
                    "filename": filename,
                    "is_public": is_public
                }
            )
        else:
            return FileResponse(
                success=False,
                error="权限修改失败",
                code="PERMISSION_UPDATE_FAILED"
            )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"权限修改失败: {str(e)}",
            code="PERMISSION_ERROR"
        )

async def handle_batch_change_permission(filenames: List[str], is_public: bool, 
                                       user_token: str = None) -> FileResponse:
    """批量修改文件权限"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"开始批量权限修改: filenames={filenames}, is_public={is_public}, user_token={'***' if user_token else None}")
    
    
    if not filenames:
        return FileResponse(
            success=False,
            error="文件列表为空",
            code="EMPTY_FILE_LIST"
        )
    
    try:
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        success_files = []
        failed_files = []
        
        for filename in filenames:
            if not is_safe_path(filename):
                failed_files.append({
                    "filename": filename,
                    "error": "非法的文件路径"
                })
                continue
            
            try:
                storage_dir = get_unified_storage_directory()
                file_path = os.path.join(storage_dir, filename)
                
                
                if not os.path.exists(file_path):
                    failed_files.append({
                        "filename": filename,
                        "error": "文件不存在"
                    })
                    continue
                
                # 检查权限
                metadata = await metadata_manager.load_metadata(filename)
                if metadata and not metadata.is_public and not user_token:
                    failed_files.append({
                        "filename": filename,
                        "error": "没有权限修改此文件"
                    })
                    continue
                
                # 修改权限
                success = await metadata_manager.set_file_permission(filename, is_public)
                if success:
                    success_files.append(filename)
                else:
                    failed_files.append({
                        "filename": filename,
                        "error": "权限修改失败"
                    })
            
            except Exception as e:
                failed_files.append({
                    "filename": filename,
                    "error": str(e)
                })
        
        if success_files and not failed_files:
            return FileResponse(
                success=True,
                message=f"成功修改 {len(success_files)} 个文件权限",
                data={
                    "updated": success_files,
                    "is_public": is_public,
                    "total": len(filenames)
                }
            )
        elif success_files and failed_files:
            # 部分成功的情况应该返回失败，并在错误信息中说明详情
            failed_details = ", ".join([f"{item['filename']}: {item['error']}" for item in failed_files])
            return FileResponse(
                success=False,
                message=f"权限修改失败",
                error=f"部分文件权限修改失败：成功 {len(success_files)} 个，失败 {len(failed_files)} 个。失败详情：{failed_details}",
                data={
                    "updated": success_files,
                    "failed": failed_files,
                    "is_public": is_public,
                    "total": len(filenames)
                }
            )
        else:
            return FileResponse(
                success=False,
                error="所有文件权限修改失败",
                code="BATCH_PERMISSION_ALL_FAILED",
                data={
                    "failed": failed_files,
                    "total": len(filenames)
                }
            )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"批量权限修改失败: {str(e)}",
            code="BATCH_PERMISSION_ERROR"
        )

# ============= 新增的统一API处理函数 =============

async def handle_unified_rename(old_path: str, new_path: str, user_token: str = None) -> FileResponse:
    """统一的文件重命名处理"""
    if not old_path or not new_path:
        return FileResponse(
            success=False,
            error="缺少原文件路径或新文件路径",
            code="MISSING_PATHS"
        )
    
    if not is_safe_path(old_path) or not is_safe_path(new_path):
        return FileResponse(
            success=False,
            error="非法的文件路径",
            code="INVALID_PATH"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        old_full_path = os.path.join(storage_dir, old_path)
        new_full_path = os.path.join(storage_dir, new_path)
        
        if not os.path.exists(old_full_path):
            return FileResponse(
                success=False,
                error="原文件不存在",
                code="FILE_NOT_FOUND"
            )
        
        if os.path.exists(new_full_path):
            return FileResponse(
                success=False,
                error="目标文件已存在",
                code="FILE_EXISTS"
            )
        
        # 检查权限和锁定状态
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        
        if os.path.isfile(old_full_path):
            metadata = await metadata_manager.load_metadata(old_path)
            if metadata and not metadata.is_public and not user_token:
                return FileResponse(
                    success=False,
                    error="没有权限重命名此文件",
                    code="PERMISSION_DENIED"
                )
            # 检查文件是否被锁定
            if metadata and metadata.locked:
                return FileResponse(
                    success=False,
                    error="文件已被锁定，无法重命名",
                    code="FILE_LOCKED"
                )
        elif os.path.isdir(old_full_path):
            # 检查目录是否被锁定
            is_locked = await metadata_manager.is_directory_locked(old_path)
            if is_locked:
                return FileResponse(
                    success=False,
                    error="目录已被锁定，无法重命名",
                    code="DIRECTORY_LOCKED"
                )
        
        # 确保目标目录存在
        new_dir = os.path.dirname(new_full_path)
        if new_dir:
            os.makedirs(new_dir, exist_ok=True)
        
        # 重命名文件
        os.rename(old_full_path, new_full_path)
        
        # 移动元数据
        await metadata_manager.move_metadata(old_path, new_path)
        
        return FileResponse(
            success=True,
            message="文件重命名成功",
            data={
                "old_path": old_path,
                "new_path": new_path
            }
        )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"文件重命名失败: {str(e)}",
            code="RENAME_ERROR"
        )

async def handle_unified_mkdir(dir_path: str, user_token: str = None) -> FileResponse:
    """统一的目录创建处理"""
    if not dir_path:
        return FileResponse(
            success=False,
            error="缺少目录路径",
            code="MISSING_DIR_PATH"
        )
    
    if not is_safe_path(dir_path):
        return FileResponse(
            success=False,
            error="非法的目录路径",
            code="INVALID_PATH"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        full_path = os.path.join(storage_dir, dir_path)
        
        if os.path.exists(full_path):
            return FileResponse(
                success=False,
                error="目录已存在",
                code="DIR_EXISTS"
            )
        
        # 创建目录
        os.makedirs(full_path, exist_ok=True)
        
        return FileResponse(
            success=True,
            message="目录创建成功",
            data={
                "dir_path": dir_path
            }
        )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"目录创建失败: {str(e)}",
            code="MKDIR_ERROR"
        )

async def handle_unified_move(source_files: list, target_dir: str, user_token: str = None) -> FileResponse:
    """统一的文件移动处理"""
    if not source_files:
        return FileResponse(
            success=False,
            error="缺少源文件列表",
            code="MISSING_SOURCE_FILES"
        )
    
    if not is_safe_path(target_dir):
        return FileResponse(
            success=False,
            error="非法的目标目录路径",
            code="INVALID_TARGET_PATH"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        target_full_path = os.path.join(storage_dir, target_dir) if target_dir else storage_dir
        
        # 确保目标目录存在
        os.makedirs(target_full_path, exist_ok=True)
        
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        success_files = []
        failed_files = []
        
        for source_file in source_files:
            try:
                if not is_safe_path(source_file):
                    failed_files.append({
                        "filename": source_file,
                        "error": "非法的文件路径"
                    })
                    continue
                
                source_full_path = os.path.join(storage_dir, source_file)
                
                if not os.path.exists(source_full_path):
                    failed_files.append({
                        "filename": source_file,
                        "error": "源文件不存在"
                    })
                    continue
                
                # 检查权限和锁定状态
                if os.path.isfile(source_full_path):
                    metadata = await metadata_manager.load_metadata(source_file)
                    if metadata and not metadata.is_public and not user_token:
                        failed_files.append({
                            "filename": source_file,
                            "error": "没有权限移动此文件"
                        })
                        continue
                    # 检查文件是否被锁定
                    if metadata and metadata.locked:
                        failed_files.append({
                            "filename": source_file,
                            "error": "文件已被锁定，无法移动"
                        })
                        continue
                elif os.path.isdir(source_full_path):
                    # 检查目录是否被锁定
                    is_locked = await metadata_manager.is_directory_locked(source_file)
                    if is_locked:
                        failed_files.append({
                            "filename": source_file,
                            "error": "目录已被锁定，无法移动"
                        })
                        continue
                
                # 构建目标路径
                filename = os.path.basename(source_file)
                target_file_path = os.path.join(target_dir, filename) if target_dir else filename
                target_file_full_path = os.path.join(target_full_path, filename)
                
                if os.path.exists(target_file_full_path):
                    failed_files.append({
                        "filename": source_file,
                        "error": "目标位置已存在同名文件"
                    })
                    continue
                
                # 移动文件
                shutil.move(source_full_path, target_file_full_path)
                
                # 移动元数据
                await metadata_manager.move_metadata(source_file, target_file_path)
                
                success_files.append({
                    "source": source_file,
                    "target": target_file_path
                })
            
            except Exception as e:
                failed_files.append({
                    "filename": source_file,
                    "error": str(e)
                })
        
        if success_files and not failed_files:
            return FileResponse(
                success=True,
                message=f"成功移动 {len(success_files)} 个文件",
                data={
                    "moved": success_files,
                    "target_dir": target_dir,
                    "total": len(source_files)
                }
            )
        elif success_files and failed_files:
            # 部分成功的情况应该返回失败，并在错误信息中说明详情
            failed_details = ", ".join([f"{item['filename']}: {item['error']}" for item in failed_files])
            return FileResponse(
                success=False,
                message=f"移动失败",
                error=f"部分文件移动失败：成功 {len(success_files)} 个，失败 {len(failed_files)} 个。失败详情：{failed_details}",
                data={
                    "moved": success_files,
                    "failed": failed_files,
                    "target_dir": target_dir,
                    "total": len(source_files)
                }
            )
        else:
            return FileResponse(
                success=False,
                error="所有文件移动失败",
                data={
                    "failed": failed_files,
                    "target_dir": target_dir,
                    "total": len(source_files)
                },
                code="MOVE_ALL_FAILED"
            )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"文件移动失败: {str(e)}",
            code="MOVE_ERROR"
        )

async def handle_unified_batch_delete(filenames: list, user_token: str = None) -> FileResponse:
    """统一的批量删除处理"""
    if not filenames:
        return FileResponse(
            success=False,
            error="缺少文件名列表",
            code="MISSING_FILENAMES"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        success_files = []
        failed_files = []
        
        for filename in filenames:
            try:
                if not is_safe_path(filename):
                    failed_files.append({
                        "filename": filename,
                        "error": "非法的文件路径"
                    })
                    continue
                
                file_path = os.path.join(storage_dir, filename)
                
                if not os.path.exists(file_path):
                    failed_files.append({
                        "filename": filename,
                        "error": "文件不存在"
                    })
                    continue
                
                # 检查权限
                metadata = await metadata_manager.load_metadata(filename)
                if metadata and not metadata.is_public and not user_token:
                    failed_files.append({
                        "filename": filename,
                        "error": "没有权限删除此文件"
                    })
                    continue
                
                # 删除文件或目录
                if os.path.isdir(file_path):
                    shutil.rmtree(file_path)
                else:
                    os.remove(file_path)
                
                # 删除元数据
                await metadata_manager.delete_metadata(filename)
                
                success_files.append(filename)
            
            except Exception as e:
                failed_files.append({
                    "filename": filename,
                    "error": str(e)
                })
        
        if success_files and not failed_files:
            return FileResponse(
                success=True,
                message=f"成功删除 {len(success_files)} 个文件",
                data={
                    "deleted": success_files,
                    "total": len(filenames)
                }
            )
        elif success_files and failed_files:
            # 部分成功的情况应该返回失败，并在错误信息中说明详情
            failed_details = ", ".join([f"{item['filename']}: {item['error']}" for item in failed_files])
            return FileResponse(
                success=False,
                message=f"删除失败",
                error=f"部分文件删除失败：成功 {len(success_files)} 个，失败 {len(failed_files)} 个。失败详情：{failed_details}",
                data={
                    "deleted": success_files,
                    "failed": failed_files,
                    "total": len(filenames)
                }
            )
        else:
            return FileResponse(
                success=False,
                error="所有文件删除失败",
                data={
                    "failed": failed_files,
                    "total": len(filenames)
                },
                code="DELETE_ALL_FAILED"
            )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"批量删除失败: {str(e)}",
            code="BATCH_DELETE_ERROR"
        )

# ============= 目录权限管理函数 =============

async def handle_change_directory_permission(dir_path: str, is_public: bool, 
                                           apply_to_children: bool = False,
                                           user_token: str = None) -> FileResponse:
    """修改目录权限"""
    if not dir_path:
        return FileResponse(
            success=False,
            error="缺少目录路径",
            code="MISSING_DIR_PATH"
        )
    
    if not is_safe_path(dir_path):
        return FileResponse(
            success=False,
            error="非法的目录路径",
            code="INVALID_PATH"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        full_path = os.path.join(storage_dir, dir_path)
        
        if not os.path.exists(full_path) or not os.path.isdir(full_path):
            return FileResponse(
                success=False,
                error="目录不存在",
                code="DIR_NOT_FOUND"
            )
        
        # 权限检查：如果要设置为私有，需要认证
        if not is_public and not user_token:
            return FileResponse(
                success=False,
                error="设置私有目录需要认证",
                code="PERMISSION_DENIED"
            )
        
        # 使用元数据管理器设置目录权限
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        
        # 获取当前目录权限
        current_permission = await metadata_manager.get_directory_permission(dir_path)
        is_changing_permission = current_permission != is_public
        
        if is_changing_permission:
            # 修改目录本身的权限
            success = await metadata_manager.set_directory_permission(
                dir_path, is_public, apply_to_children
            )
            
            if success:
                message = f"目录权限已设置为{'公开' if is_public else '私有'}"
                if apply_to_children:
                    message += "，并已应用到所有子项目"
            else:
                return FileResponse(
                    success=False,
                    error="设置目录权限失败",
                    code="DIR_PERMISSION_SET_FAILED"
                )
        elif apply_to_children:
            # 只递归应用到子项目，不修改目录本身
            await metadata_manager._apply_permission_to_children(dir_path, is_public)
            message = f"已将{'公开' if is_public else '私有'}权限应用到所有子项目"
            success = True
        else:
            # 没有任何变化
            message = "目录权限无变化"
            success = True
        
        if success:
            return FileResponse(
                success=True,
                message=message,
                data={
                    "dir_path": dir_path,
                    "is_public": is_public,
                    "apply_to_children": apply_to_children,
                    "permission_changed": is_changing_permission
                }
            )
        else:
            return FileResponse(
                success=False,
                error="设置目录权限失败",
                code="DIR_PERMISSION_SET_FAILED"
            )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"目录权限修改失败: {str(e)}",
            code="DIR_PERMISSION_ERROR"
        )

async def handle_get_directory_permission(dir_path: str, user_token: str = None) -> FileResponse:
    """获取目录权限信息"""
    if not dir_path:
        return FileResponse(
            success=False,
            error="缺少目录路径",
            code="MISSING_DIR_PATH"
        )
    
    if not is_safe_path(dir_path):
        return FileResponse(
            success=False,
            error="非法的目录路径",
            code="INVALID_PATH"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        full_path = os.path.join(storage_dir, dir_path)
        
        if not os.path.exists(full_path) or not os.path.isdir(full_path):
            return FileResponse(
                success=False,
                error="目录不存在",
                code="DIR_NOT_FOUND"
            )
        
        # 使用元数据管理器获取目录信息
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        dir_info = await metadata_manager.get_directory_info(dir_path)
        
        return FileResponse(
            success=True,
            message="获取目录权限信息成功",
            data=dir_info
        )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"获取目录权限失败: {str(e)}",
            code="DIR_PERMISSION_GET_ERROR"
        )


# ============= 文件和目录锁定管理处理函数 =============

async def handle_set_file_lock(file_path: str, locked: bool, user_token: str) -> FileResponse:
    """设置文件锁定状态"""
    if not file_path:
        return FileResponse(
            success=False,
            error="缺少文件路径",
            code="MISSING_FILE_PATH"
        )
    
    if not is_safe_path(file_path):
        return FileResponse(
            success=False,
            error="非法的文件路径",
            code="INVALID_PATH"
        )
    
    if not user_token:
        return FileResponse(
            success=False,
            error="需要认证才能修改锁定状态",
            code="PERMISSION_DENIED"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        full_path = os.path.join(storage_dir, file_path)
        
        if not os.path.exists(full_path) or not os.path.isfile(full_path):
            return FileResponse(
                success=False,
                error="文件不存在",
                code="FILE_NOT_FOUND"
            )
        
        # 使用元数据管理器设置锁定状态
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        
        # 检查是否已经被锁定（如果要进行其他操作的话）
        if not locked:  # 解锁操作，需要检查当前是否锁定
            current_metadata = await metadata_manager.load_metadata(file_path)
            if current_metadata and current_metadata.locked:
                # 可以解锁
                pass
        
        # 设置锁定状态
        success = await metadata_manager.set_file_lock(file_path, locked)
        
        if not success:
            return FileResponse(
                success=False,
                error="设置文件锁定状态失败",
                code="LOCK_SET_ERROR"
            )
        
        return FileResponse(
            success=True,
            message=f"文件{'锁定' if locked else '解锁'}成功",
            data={"file_path": file_path, "locked": locked}
        )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"设置文件锁定状态失败: {str(e)}",
            code="LOCK_SET_ERROR"
        )


async def handle_set_directory_lock(dir_path: str, locked: bool, apply_to_children: bool, user_token: str) -> FileResponse:
    """设置目录锁定状态"""
    if not dir_path:
        return FileResponse(
            success=False,
            error="缺少目录路径",
            code="MISSING_DIR_PATH"
        )
    
    if not is_safe_path(dir_path):
        return FileResponse(
            success=False,
            error="非法的目录路径",
            code="INVALID_PATH"
        )
    
    if not user_token:
        return FileResponse(
            success=False,
            error="需要认证才能修改目录锁定状态",
            code="PERMISSION_DENIED"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        full_path = os.path.join(storage_dir, dir_path)
        
        # 使用元数据管理器设置目录锁定状态
        metadata_manager = get_metadata_manager(storage_dir)
        
        success = await metadata_manager.set_directory_lock(dir_path, locked, apply_to_children)
        
        if not success:
            # Check if directory doesn't exist
            if not os.path.exists(full_path) or not os.path.isdir(full_path):
                return FileResponse(
                    success=False,
                    error="目录不存在或不是有效目录",
                    code="DIR_NOT_FOUND"
                )
            else:
                return FileResponse(
                    success=False,
                    error="设置目录锁定状态失败",
                    code="DIR_LOCK_SET_ERROR"
                )
        
        message = f"目录{'锁定' if locked else '解锁'}成功"
        if apply_to_children:
            message += "（包括所有子文件和子目录）"
        
        return FileResponse(
            success=True,
            message=message,
            data={
                "dir_path": dir_path, 
                "locked": locked, 
                "apply_to_children": apply_to_children
            }
        )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"设置目录锁定状态失败: {str(e)}",
            code="DIR_LOCK_SET_ERROR"
        )


async def handle_batch_set_lock(file_paths: List[str], locked: bool, user_token: str) -> FileResponse:
    """批量设置文件/目录锁定状态"""
    if not file_paths:
        return FileResponse(
            success=False,
            error="缺少文件路径列表",
            code="MISSING_FILE_PATHS"
        )
    
    if not user_token:
        return FileResponse(
            success=False,
            error="需要认证才能修改锁定状态",
            code="PERMISSION_DENIED"
        )
    
    try:
        storage_dir = get_unified_storage_directory()
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        
        success_count = 0
        failed_items = []
        
        for file_path in file_paths:
            if not is_safe_path(file_path):
                failed_items.append({"path": file_path, "error": "非法路径"})
                continue
            
            full_path = os.path.join(storage_dir, file_path)
            
            if not os.path.exists(full_path):
                failed_items.append({"path": file_path, "error": "文件/目录不存在"})
                continue
            
            try:
                if os.path.isfile(full_path):
                    # 文件锁定
                    success = await metadata_manager.set_file_lock(file_path, locked)
                elif os.path.isdir(full_path):
                    # 目录锁定（不递归应用到子项目）
                    success = await metadata_manager.set_directory_lock(file_path, locked, apply_to_children=False)
                else:
                    failed_items.append({"path": file_path, "error": "既不是文件也不是目录"})
                    continue
                
                if success:
                    success_count += 1
                else:
                    failed_items.append({"path": file_path, "error": "设置锁定状态失败"})
            
            except Exception as e:
                failed_items.append({"path": file_path, "error": str(e)})
        
        total_count = len(file_paths)
        
        if success_count == 0:
            return FileResponse(
                success=False,
                error="所有项目都设置失败",
                code="BATCH_LOCK_ALL_FAILED",
                data={"failed_items": failed_items}
            )
        elif success_count < total_count:
            # 部分成功的情况应该返回失败，并在错误信息中说明详情
            failed_details = ", ".join([f"{item['path']}: {item['error']}" for item in failed_items])
            return FileResponse(
                success=False,
                message=f"{'锁定' if locked else '解锁'}失败",
                error=f"部分项目{'锁定' if locked else '解锁'}失败：成功 {success_count} 个，失败 {total_count - success_count} 个。失败详情：{failed_details}",
                data={
                    "success_count": success_count,
                    "total_count": total_count,
                    "failed_items": failed_items,
                    "locked": locked
                }
            )
        else:
            return FileResponse(
                success=True,
                message=f"所有 {success_count} 项目都{'锁定' if locked else '解锁'}成功",
                data={
                    "success_count": success_count,
                    "total_count": total_count,
                    "locked": locked
                }
            )
    
    except Exception as e:
        return FileResponse(
            success=False,
            error=f"批量设置锁定状态失败: {str(e)}",
            code="BATCH_LOCK_ERROR"
        )