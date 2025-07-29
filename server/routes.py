import os
import json
import urllib.parse
import uuid
from typing import List, Optional
from fastapi import (
    FastAPI,
    Body,
    Depends,
    Header,
    File,
    UploadFile,
    Form,
    Path,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    Query,
)
from fastapi.responses import StreamingResponse, HTMLResponse
import logging
import sys

from config import API_ENDPOINT, INDEX_HTML_PATH
from models import FileResponse
from auth import verify_token_required, verify_token_optional
from utils import (
    is_safe_path,
    get_mime_type,
    should_display_inline,
    aiofile_chunks,
    generate_file_etag,
    encode_filename,
    get_unified_storage_directory,
)
from file_handlers import (
    # 统一处理函数
    handle_unified_upload,
    handle_unified_list,
    handle_unified_delete,
    handle_change_file_permission,
    handle_batch_change_permission,
    handle_batch_download,
    # 目录和文件操作函数
    handle_unified_rename,
    handle_unified_mkdir,
    handle_unified_move,
    handle_unified_batch_delete,
    handle_unified_update,
    # 分片上传函数
    handle_chunk_upload,
    handle_chunk_complete,
    # URL下载函数
    handle_url_download,
    handle_url_content_processing,
    # 目录权限管理函数
    handle_change_directory_permission,
    handle_get_directory_permission,
    # 锁定管理函数
    handle_set_file_lock,
    handle_set_directory_lock,
    handle_batch_set_lock,
)
from websocket import websocket_manager
from share_manager import share_manager
from cobalt_service import cobalt_downloader
import asyncio
import uuid


# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,  # Python 3.8+ 支持，强制重新配置
)

logger = logging.getLogger(__name__)

# 存储正在进行的下载任务
active_cobalt_downloads = {}

async def perform_cobalt_download(
    task_id: str,
    url: str,
    download_url: str,
    filename: str,
    storage_dir: str,
    is_public: bool,
    token: str = None
):
    """执行 Cobalt 下载的异步任务"""
    try:
        # 通知开始下载
        await websocket_manager.notify_url_processing_progress(
            url, f"开始下载: {filename}"
        )
        
        # 创建进度回调
        async def progress_callback(progress, downloaded_size, total_size):
            if total_size > 0:
                mb_downloaded = downloaded_size / (1024 * 1024)
                mb_total = total_size / (1024 * 1024)
                message = f"下载中: {progress:.1f}% ({mb_downloaded:.1f}MB / {mb_total:.1f}MB)"
            else:
                mb_downloaded = downloaded_size / (1024 * 1024)
                message = f"下载中: {mb_downloaded:.1f}MB"
            
            # 发送任务进度通知到所有客户端
            notification = {
                "type": "cobalt_download_progress",
                "task_id": task_id,
                "url": url,
                "message": message,
                "progress": progress,
                "downloaded_size": downloaded_size,
                "total_size": total_size
            }
            
            # 向所有活跃连接发送通知
            for client_id in list(websocket_manager.active_connections.keys()):
                await websocket_manager.send_message(client_id, notification)
        
        # 下载文件内容
        file_content = await cobalt_downloader.download_file_content(
            download_url, progress_callback
        )
        
        # 确保文件名唯一
        file_path = os.path.join(storage_dir, filename)
        counter = 1
        base_name, ext = os.path.splitext(filename)
        while os.path.exists(file_path):
            filename = f"{base_name}_{counter}{ext}"
            file_path = os.path.join(storage_dir, filename)
            counter += 1
        
        # 写入文件
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        # 创建元数据
        from metadata_config import get_metadata_manager
        from sqlite_metadata_manager import FileMetadata
        from utils import get_mime_type
        import datetime
        from config import FILE_STORAGE_PATH
        
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        current_time = datetime.datetime.now().isoformat()
        content_type = get_mime_type(filename)
        
        metadata = FileMetadata(
            filename=filename,
            size=len(file_content),
            upload_time=current_time,
            last_modified=current_time,
            is_public=is_public,
            content_type=content_type,
            tags=["cobalt_download"],
            description=f"通过Cobalt下载自: {url}",
            created_by=token or "anonymous",
            original_url=url
        )
        await metadata_manager.save_metadata(filename, metadata)
        
        # 发送完成通知
        await websocket_manager.notify_file_created(
            filename,
            {
                "action": "cobalt_download",
                "size": len(file_content),
                "is_public": is_public,
                "url": url,
                "task_id": task_id
            }
        )
        
        # 通知下载完成
        await websocket_manager.notify_url_processing_progress(
            url, f"下载完成: {filename}"
        )
        
        # 从活动任务中移除
        if task_id in active_cobalt_downloads:
            del active_cobalt_downloads[task_id]
            
    except Exception as e:
        logger.error(f"Cobalt下载任务失败: {e}")
        await websocket_manager.notify_url_processing_progress(
            url, f"下载失败: {str(e)}"
        )
        
        # 从活动任务中移除
        if task_id in active_cobalt_downloads:
            del active_cobalt_downloads[task_id]


def register_routes(app: FastAPI):
    """注册所有路由"""

    # 标准化端点路径
    endpoint = API_ENDPOINT.rstrip("/") if API_ENDPOINT != "/" else ""

    # 主页路由
    @app.get(endpoint if endpoint else "/")
    async def root():
        """返回主页"""
        try:
            if os.path.exists(INDEX_HTML_PATH):
                with open(INDEX_HTML_PATH, "r", encoding="utf-8") as f:
                    content = f.read()
                return HTMLResponse(content=content)
            else:
                return HTMLResponse(
                    content="""
                <html>
                    <head><title>文件服务器</title></head>
                    <body>
                        <h1>文件服务器</h1>
                        <p>服务器运行正常</p>
                        <p>使用管理工具上传和管理文件</p>
                    </body>
                </html>
                """
                )
        except Exception as e:
            return HTMLResponse(
                content=f"<html><body><h1>错误</h1><p>{str(e)}</p></body></html>"
            )

    # 分享相关路由（无需认证，全局路径）- 必须在通配符路由之前注册
    @app.get("/api/s/{share_id}")
    async def get_shared_file(share_id: str):
        """通过分享链接获取文件内容（无需认证）"""
        try:
            share_info = share_manager.get_share_info(share_id)
            if not share_info:
                raise HTTPException(status_code=404, detail="分享链接不存在或已过期")

            # 根据文件类型选择存储目录

            storage_dir = get_unified_storage_directory()

            file_path = os.path.join(storage_dir, share_info.filename)

            # 检查文件是否存在
            if not os.path.exists(file_path) or not os.path.isfile(file_path):
                raise HTTPException(status_code=404, detail="分享的文件不存在")

            # 读取文件内容
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            return {
                "success": True,
                "filename": share_info.filename,
                "content": content,
                "is_public": share_info.is_public,
                "created_at": share_info.created_at,
            }
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"获取分享文件失败: {str(e)}")

    @app.get("/api/share/info/{share_id}")
    async def get_share_info_endpoint(share_id: str):
        """获取分享信息（无需认证）"""
        try:
            share_info = share_manager.get_share_info(share_id)
            if not share_info:
                raise HTTPException(status_code=404, detail="分享链接不存在或已过期")

            return {
                "success": True,
                "share_id": share_info.share_id,
                "filename": share_info.filename,
                "is_public": share_info.is_public,
                "created_at": share_info.created_at,
            }
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"获取分享信息失败: {str(e)}")

    @app.get("/api/s/{share_id}/file")
    async def get_shared_file_direct(
        share_id: str,
        range_header: Optional[str] = Header(None, alias="Range"),
        download: Optional[str] = Query(None, description="强制下载参数")
    ):
        """通过分享链接直接获取文件（无需认证，支持流式传输）"""
        try:
            share_info = share_manager.get_share_info(share_id)
            if not share_info:
                raise HTTPException(status_code=404, detail="分享链接不存在或已过期")

            # 获取统一存储目录
            storage_dir = get_unified_storage_directory()
            file_path = os.path.join(storage_dir, share_info.filename)

            # 检查文件是否存在
            if not os.path.exists(file_path) or not os.path.isfile(file_path):
                raise HTTPException(status_code=404, detail="分享的文件不存在")

            # 获取文件信息
            file_size = os.path.getsize(file_path)
            mime_type = get_mime_type(os.path.basename(share_info.filename))

            # 对文件名进行编码
            filename = os.path.basename(share_info.filename)
            encoded_filename = encode_filename(filename)

            # 根据文件类型决定是否内联显示，如果有download参数则强制下载
            if download == "1":
                disposition = "attachment"
            else:
                disposition = "inline" if should_display_inline(filename, mime_type) else "attachment"

            # 设置响应头
            headers = {
                "Accept-Ranges": "bytes",
                "Content-Type": mime_type,
                "Content-Disposition": f'{disposition}; filename="{encoded_filename}"',
                "Cache-Control": "no-cache, must-revalidate",
                "Connection": "keep-alive"
            }

            # 处理Range请求（断点续传）
            if range_header:
                try:
                    # 解析Range头 "bytes=start-end"
                    range_value = range_header.replace("bytes=", "")
                    
                    # 处理多个范围的情况，只取第一个
                    if "," in range_value:
                        range_value = range_value.split(",")[0].strip()
                    
                    range_parts = range_value.split("-")
                    start = int(range_parts[0]) if range_parts[0] else 0
                    end = int(range_parts[1]) if len(range_parts) > 1 and range_parts[1] else file_size - 1
                    
                    # 确保范围有效
                    start = max(0, min(start, file_size - 1))
                    end = max(start, min(end, file_size - 1))
                    content_length = end - start + 1
                    
                    # 验证范围是否有效
                    if start >= file_size or end >= file_size or start > end:
                        # 范围无效，返回416
                        error_headers = {
                            "Content-Range": f"bytes */{file_size}",
                            "Content-Type": mime_type
                        }
                        raise HTTPException(
                            status_code=416, 
                            detail="Requested Range Not Satisfiable",
                            headers=error_headers
                        )
                    
                    # 更新响应头
                    range_headers = headers.copy()
                    range_headers.update({
                        "Content-Range": f"bytes {start}-{end}/{file_size}",
                        "Content-Length": str(content_length),
                        "Accept-Ranges": "bytes"
                    })
                    
                    # 返回部分内容
                    return StreamingResponse(
                        aiofile_chunks(file_path, start, end + 1),  # +1 because end is inclusive
                        status_code=206,
                        headers=range_headers,
                        media_type=mime_type
                    )
                except (ValueError, IndexError, TypeError) as e:
                    # Range头格式错误，记录日志并返回完整文件
                    logging.warning(f"Invalid Range header: {range_header}, error: {e}")
                    pass

            # 返回完整文件
            headers["Content-Length"] = str(file_size)
            return StreamingResponse(
                aiofile_chunks(file_path),
                headers=headers,
                media_type=mime_type
            )

        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"获取分享文件直链失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"获取分享文件失败: {str(e)}")

    # WebSocket路由
    @app.websocket("/api/ws/{client_id}")
    async def websocket_endpoint(
        websocket: WebSocket, client_id: str, token: Optional[str] = None
    ):
        """WebSocket连接端点"""
        try:
            # 简单的token验证（可以改进）
            user_id = f"user_{client_id}"  # 简化版本，实际应该从token解析用户ID

            await websocket_manager.connect(websocket, client_id, user_id)

            while True:
                try:
                    # 接收客户端消息
                    data = await websocket.receive_text()
                    message = json.loads(data)

                    # 处理不同类型的消息
                    await handle_websocket_message(client_id, message)

                except WebSocketDisconnect:
                    break
                except json.JSONDecodeError:
                    await websocket_manager.send_message(
                        client_id, {"type": "error", "message": "Invalid JSON format"}
                    )
                except Exception as e:
                    await websocket_manager.send_message(
                        client_id, {"type": "error", "message": str(e)}
                    )

        except Exception as e:
            print(f"WebSocket connection error: {e}")
        finally:
            websocket_manager.disconnect(client_id)

    # Y.js WebSocket路由 - 协作编辑
    @app.websocket("/api/yjs/{room_name}")
    async def yjs_websocket_endpoint(
        websocket: WebSocket, 
        room_name: str,
        auth: Optional[str] = Query(None, description="Authentication token")
    ):
        """Y.js WebSocket端点用于协作编辑"""
        logger.info(f"Y.js WebSocket route called: room_name={room_name}, auth={auth}")
        try:
            from yjs_websocket import handle_yjs_websocket
            await handle_yjs_websocket(websocket, room_name, auth)
        except Exception as e:
            logger.error(f"Y.js WebSocket error: {e}")
            import traceback
            traceback.print_exc()

    # WebSocket状态查询路由
    @app.get("/api/ws/stats")
    async def websocket_stats(token: str = Depends(verify_token_required)):
        """获取WebSocket连接统计"""
        return websocket_manager.get_connection_stats()
    
    # Y.js WebSocket状态查询路由
    @app.get("/api/yjs/stats")
    async def yjs_websocket_stats(token: str = Depends(verify_token_required)):
        """获取Y.js WebSocket连接统计"""
        try:
            from yjs_websocket import yjs_websocket_manager
            return yjs_websocket_manager.get_room_stats()
        except Exception as e:
            logger.error(f"Y.js WebSocket stats error: {e}")
            raise HTTPException(status_code=500, detail="无法获取Y.js WebSocket统计信息")

    # 分享链接相关路由
    share_path = (
        (endpoint.rstrip("/") + "/api/share")
        if endpoint and endpoint != "/"
        else "/api/share"
    )

    @app.post(share_path)
    async def create_share(
        filename: str = Form(..., description="文件名"),
        is_public: bool = Form(False, description="是否为公共文件"),
        token: str = Depends(verify_token_optional),
    ):
        """创建或获取分享链接"""
        try:
            # 私有文件需要认证，公共文件不需要
            if not is_public and not token:
                raise HTTPException(status_code=401, detail="私有文件分享需要认证")

            share_info = share_manager.get_or_create_share(filename, is_public)
            return {
                "success": True,
                "share_id": share_info.share_id,
                "share_url": f"/s/{share_info.share_id}",
                "filename": share_info.filename,
                "is_public": share_info.is_public,
                "created_at": share_info.created_at,
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"创建分享链接失败: {str(e)}")

    # ============= 统一文件管理API =============

    # 统一文件列表API
    @app.get(endpoint + "/api/files" if endpoint else "/api/files")
    async def list_unified_files(
        current_path: Optional[str] = Query("", description="当前路径"),
        filter_mode: str = Query("all", description="过滤模式: all, public, private"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """获取统一管理的文件列表"""
        return await handle_unified_list(current_path, filter_mode, token)

    # 统一文件上传API
    @app.post(endpoint + "/api/files" if endpoint else "/api/files")
    async def upload_unified_file(
        file: UploadFile = File(..., description="上传的文件"),
        filename: str = Form(..., description="文件名"),
        is_public: bool = Form(True, description="是否公开"),
        tags: Optional[str] = Form(None, description="标签（JSON数组）"),
        description: str = Form("", description="描述"),
        notes: str = Form("", description="笔记"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """上传文件到统一存储"""
        # 解析标签
        parsed_tags = []
        if tags:
            try:
                import json

                parsed_tags = json.loads(tags)
            except:
                parsed_tags = []

        # 私有文件需要认证
        if not is_public and not token:
            raise HTTPException(status_code=401, detail="私有文件需要认证")

        result = await handle_unified_upload(
            file, filename, is_public, token, parsed_tags, description, notes
        )

        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_file_created(
                filename,
                {
                    "action": "upload",
                    "size": result.data.get("size", 0) if result.data else 0,
                    "is_public": is_public,
                },
            )

        return result

    # 分片上传API
    @app.post(endpoint + "/api/files/chunk/upload" if endpoint else "/api/files/chunk/upload")
    async def upload_file_chunk(
        file: UploadFile = File(..., description="上传的文件分片"),
        filename: str = Form(..., description="目标文件名"),
        chunk_index: int = Form(..., description="分片索引（从0开始）"),
        total_chunks: Optional[int] = Form(None, description="总分片数"),
        chunk_hash: Optional[str] = Form(None, description="分片MD5哈希值"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """上传文件分片"""
        # 获取用户目录
        user_dir = get_unified_storage_directory()
        
        result = await handle_chunk_upload(
            file, filename, chunk_index, user_dir, total_chunks, chunk_hash
        )
        
        return result

    # 分片合并API
    @app.post(endpoint + "/api/files/chunk/complete" if endpoint else "/api/files/chunk/complete")
    async def complete_file_chunks(
        filename: str = Form(..., description="目标文件名"),
        total_chunks: int = Form(..., description="总分片数"),
        is_public: bool = Form(True, description="是否公开"),
        tags: Optional[str] = Form(None, description="标签（JSON数组）"),
        description: str = Form("", description="描述"),
        notes: str = Form("", description="笔记"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """合并文件分片并完成上传"""
        # 私有文件需要认证
        if not is_public and not token:
            raise HTTPException(status_code=401, detail="私有文件需要认证")
            
        # 解析标签
        parsed_tags = []
        if tags:
            try:
                import json
                parsed_tags = json.loads(tags)
            except:
                parsed_tags = []
        
        # 获取用户目录
        user_dir = get_unified_storage_directory()
        
        result = await handle_chunk_complete(filename, total_chunks, user_dir)
        
        if result.success:
            # 合并完成后，更新文件元数据
            from metadata_config import get_metadata_manager
            from sqlite_metadata_manager import FileMetadata
            from utils import get_mime_type
            import datetime
            from config import FILE_STORAGE_PATH
            
            metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
            
            file_path = os.path.join(user_dir, filename)
            if os.path.exists(file_path):
                file_size = os.path.getsize(file_path)
                current_time = datetime.datetime.now().isoformat()
                content_type = get_mime_type(filename)
                
                metadata = FileMetadata(
                    filename=filename,
                    size=file_size,
                    upload_time=current_time,
                    last_modified=current_time,
                    is_public=is_public,
                    content_type=content_type,
                    tags=parsed_tags,
                    description=description,
                    notes=notes,
                    created_by=token or "anonymous"
                )
                await metadata_manager.save_metadata(filename, metadata)
            
            # 发送WebSocket通知
            await websocket_manager.notify_file_created(
                filename,
                {
                    "action": "chunk_upload_complete",
                    "size": result.data.get("size", 0) if result.data else 0,
                    "is_public": is_public,
                },
            )
        
        return result

    # 分片状态查询API
    @app.get(endpoint + "/api/files/chunk/status/{filename}" if endpoint else "/api/files/chunk/status/{filename}")
    async def get_chunk_status(
        filename: str = Path(..., description="文件名"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """查询分片上传状态"""
        try:
            from file_handlers import get_uploaded_chunk_count
            user_dir = get_unified_storage_directory()
            
            uploaded_chunks = get_uploaded_chunk_count(filename, user_dir)
            
            return FileResponse(
                success=True,
                data={
                    "filename": filename,
                    "uploaded_chunks": uploaded_chunks,
                    "status": "in_progress" if uploaded_chunks > 0 else "not_started"
                }
            )
        except Exception as e:
            return FileResponse(
                success=False,
                error=f"查询失败: {str(e)}"
            )

    # 统一批量删除API - 必须在单个文件删除API之前注册
    @app.delete(
        endpoint + "/api/files/batch/delete" if endpoint else "/api/files/batch/delete"
    )
    async def batch_delete_unified_files(
        filenames: str = Form(..., description="文件名列表（JSON格式）"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """批量删除统一存储中的文件"""
        try:
            import json

            filenames_list = json.loads(filenames)
        except:
            raise HTTPException(status_code=400, detail="无效的文件名列表格式")

        result = await handle_unified_batch_delete(filenames_list, token)

        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_batch_operation(
                "delete", filenames_list, result.data or {}
            )

        return result

    # 统一文件删除API
    @app.delete(
        endpoint + "/api/files/{file_path:path}"
        if endpoint
        else "/api/files/{file_path:path}"
    )
    async def delete_unified_file(
        file_path: str = Path(..., description="文件路径"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """删除统一存储中的文件"""
        result = await handle_unified_delete(file_path, token)

        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_file_deleted(file_path)

        return result

    # 批量权限管理API - 必须在单个文件权限API之前注册
    @app.put(
        endpoint + "/api/files/batch/permission"
        if endpoint
        else "/api/files/batch/permission"
    )
    async def batch_change_permission(
        filenames: str = Form(..., description="文件名列表（JSON格式）"),
        is_public: bool = Form(..., description="是否公开"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """批量修改文件权限"""
        try:
            import json
            import urllib.parse
            import logging

            logger = logging.getLogger(__name__)
            
            
            filenames_list = json.loads(filenames)
            logger.info(f"原始文件名列表: {filenames_list}")
            
            # URL解码文件名
            filenames_list = [urllib.parse.unquote(filename) for filename in filenames_list]
            logger.info(f"URL解码后文件名列表: {filenames_list}")
            
        except Exception as e:
            logger.error(f"解析文件名列表失败: {e}")
            raise HTTPException(status_code=400, detail="无效的文件名列表格式")

        # 如果要设置为私有，需要认证
        if not is_public and not token:
            raise HTTPException(status_code=401, detail="设置私有文件需要认证")

        result = await handle_batch_change_permission(filenames_list, is_public, token)

        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_batch_operation(
                "permission_change",
                filenames_list,
                {"is_public": is_public, "result": result.data or {}},
            )

        return result

    # 文件权限管理API - 单个文件权限
    @app.put(
        endpoint + "/api/files/{file_path:path}/permission"
        if endpoint
        else "/api/files/{file_path:path}/permission"
    )
    async def change_file_permission(
        file_path: str = Path(..., description="文件路径"),
        is_public: bool = Form(..., description="是否公开"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """修改文件权限"""
        # 如果要设置为私有，需要认证
        if not is_public and not token:
            raise HTTPException(status_code=401, detail="设置私有文件需要认证")

        result = await handle_change_file_permission(file_path, is_public, token)

        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_file_updated(
                file_path, {"action": "permission_change", "is_public": is_public}
            )

        return result

    # 统一文件内容更新API
    @app.put(
        endpoint + "/api/files/{file_path:path}/content"
        if endpoint
        else "/api/files/{file_path:path}/content"
    )
    async def update_file_content(
        file_path: str = Path(..., description="文件路径"),
        content: str = Form(..., description="新的文件内容"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """更新统一存储中的文件内容"""
        result = await handle_unified_update(file_path, content, token)

        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_file_updated(
                file_path,
                {
                    "action": "content_update",
                    "size": result.data.get("size") if result.data else 0,
                },
            )

        return result

    # 统一文件重命名API
    @app.put(endpoint + "/api/files/rename" if endpoint else "/api/files/rename")
    async def rename_unified_file(
        old_path: str = Form(..., description="原文件路径"),
        new_path: str = Form(..., description="新文件路径"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """重命名统一存储中的文件"""
        result = await handle_unified_rename(old_path, new_path, token)

        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_file_renamed(
                old_path, new_path, {"action": "rename"}
            )

        return result

    # 统一目录创建API
    @app.post(endpoint + "/api/directories" if endpoint else "/api/directories")
    async def create_unified_directory(
        dir_path: str = Form(..., description="目录路径"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """创建统一存储中的目录"""
        result = await handle_unified_mkdir(dir_path, token)

        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_file_created(
                dir_path, {"action": "mkdir", "type": "directory"}
            )

        return result

    # 统一文件移动API
    @app.put(endpoint + "/api/files/move" if endpoint else "/api/files/move")
    async def move_unified_files(
        source_files: str = Form(..., description="源文件列表（JSON格式）"),
        target_dir: str = Form(..., description="目标目录"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """移动统一存储中的文件"""
        try:
            import json

            source_files_list = json.loads(source_files)
        except:
            raise HTTPException(status_code=400, detail="无效的源文件列表格式")

        result = await handle_unified_move(source_files_list, target_dir, token)

        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_batch_operation(
                "move",
                source_files_list,
                {"target_dir": target_dir, "result": result.data or {}},
            )

        return result

    # 批量下载API
    @app.post(
        endpoint + "/api/files/batch/download"
        if endpoint
        else "/api/files/batch/download"
    )
    async def batch_download_unified_files(
        filenames: str = Form(..., description="文件名列表（JSON字符串）"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """批量下载统一存储中的文件"""
        try:
            # 把 JSON 字符串转换成 Python 列表
            parsed_filenames: List[str] = json.loads(filenames)
            assert isinstance(parsed_filenames, list)
        except Exception as e:
            logging.error(f"文件名解析失败: {e}")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "文件名参数格式错误，应为 JSON 字符串数组",
                    "code": "INVALID_FILENAMES"
                }
            )

        user_dir = get_unified_storage_directory()
        logging.info("文件存储位置: " + user_dir)
        return await handle_batch_download(parsed_filenames, user_dir)

    # ============= URL下载API =============
    
    # URL文件下载API
    @app.post(endpoint + "/api/url/download" if endpoint else "/api/url/download")
    async def download_from_url(
        url: str = Form(..., description="要下载的URL"),
        filename: Optional[str] = Form(None, description="自定义文件名（可选）"),
        is_public: bool = Form(True, description="是否公开"),
        tags: Optional[str] = Form(None, description="标签（JSON数组）"),
        description: str = Form("", description="描述"),
        notes: str = Form("", description="笔记"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """从URL下载文件到服务器"""
        # 私有文件需要认证
        if not is_public and not token:
            raise HTTPException(status_code=401, detail="私有文件需要认证")
        
        # 解析标签
        parsed_tags = []
        if tags:
            try:
                parsed_tags = json.loads(tags)
            except:
                parsed_tags = []
        
        # 获取存储目录
        storage_dir = get_unified_storage_directory()
        
        # 创建进度回调函数
        async def progress_callback(progress, downloaded_size, total_size):
            if total_size > 0:
                mb_downloaded = downloaded_size / (1024 * 1024)
                mb_total = total_size / (1024 * 1024)
                message = f"下载中: {progress:.1f}% ({mb_downloaded:.1f}MB / {mb_total:.1f}MB)"
            else:
                mb_downloaded = downloaded_size / (1024 * 1024)
                message = f"下载中: {mb_downloaded:.1f}MB"
            
            # 发送WebSocket进度通知
            await websocket_manager.notify_url_processing_progress(url, message)
        
        try:
            # 执行下载
            result = await handle_url_download(url, filename, storage_dir, progress_callback)
            
            if result.success and result.data:
                final_filename = result.data.get("filename")
                file_size = result.data.get("size", 0)
                
                # 更新元数据以包含用户指定的参数
                if final_filename:
                    from metadata_config import get_metadata_manager
                    from config import FILE_STORAGE_PATH
                    metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
                    
                    # 加载现有元数据
                    existing_metadata = await metadata_manager.load_metadata(final_filename)
                    if existing_metadata:
                        # 更新用户指定的字段
                        existing_metadata.is_public = is_public
                        existing_metadata.tags = parsed_tags
                        existing_metadata.description = description
                        existing_metadata.notes = notes
                        if token:
                            existing_metadata.created_by = token
                        
                        # 保存更新后的元数据
                        await metadata_manager.save_metadata(final_filename, existing_metadata)
                
                # 发送完成通知
                await websocket_manager.notify_file_created(
                    final_filename,
                    {
                        "action": "url_download",
                        "size": file_size,
                        "is_public": is_public,
                        "url": url,
                    },
                )
            
            return result
            
        except Exception as e:
            await websocket_manager.notify_url_processing_progress(url, f"下载失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")
    
    # ============= Cobalt 媒体下载API =============
    
    @app.post(endpoint + "/api/cobalt/check" if endpoint else "/api/cobalt/check")
    async def check_cobalt_support(
        url: str = Body(..., embed=True),
        token: Optional[str] = Depends(verify_token_optional)
    ):
        """检查URL是否支持Cobalt下载"""
        try:
            is_supported = cobalt_downloader.is_supported_url(url)
            default_options = cobalt_downloader.get_default_options(url) if is_supported else {}
            
            return {
                "success": True,
                "supported": is_supported,
                "url": url,
                "default_options": default_options
            }
        except Exception as e:
            logger.error(f"检查Cobalt支持失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    @app.post(endpoint + "/api/cobalt/download" if endpoint else "/api/cobalt/download")
    async def download_with_cobalt(
        url: str = Body(...),
        options: Optional[dict] = Body(default={}),
        save_to_server: bool = Body(default=True),
        filename: Optional[str] = Body(default=None),
        is_public: bool = Body(default=True),
        token: Optional[str] = Depends(verify_token_optional)
    ):
        """使用Cobalt API下载媒体"""
        
        # 私有文件需要认证
        if not is_public and not token:
            raise HTTPException(status_code=401, detail="私有文件需要认证")
        
        try:
            # 检查URL是否支持
            if not cobalt_downloader.is_supported_url(url):
                return {
                    "success": False,
                    "error": "unsupported_url",
                    "message": "不支持的媒体平台"
                }
            
            # 使用Cobalt API下载
            result = await cobalt_downloader.download_media(url, options)
            
            if not result.get("success"):
                return result
            
            # 如果不需要保存到服务器，直接返回下载链接
            if not save_to_server:
                return result
            
            # 保存到服务器
            if result.get("type") == "single":
                download_url = result.get("url")
                suggested_filename = result.get("filename", "downloaded_media")
                
                # 使用用户指定的文件名或默认文件名
                final_filename = filename or suggested_filename
                
                # 生成任务ID
                task_id = str(uuid.uuid4())
                
                # 获取存储目录
                storage_dir = get_unified_storage_directory()
                
                # 将任务信息存储
                active_cobalt_downloads[task_id] = {
                    "url": url,
                    "filename": final_filename,
                    "status": "downloading"
                }
                
                # 启动异步下载任务
                asyncio.create_task(perform_cobalt_download(
                    task_id=task_id,
                    url=url,
                    download_url=download_url,
                    filename=final_filename,
                    storage_dir=storage_dir,
                    is_public=is_public,
                    token=token
                ))
                
                return {
                    "success": True,
                    "type": "downloading",
                    "task_id": task_id,
                    "filename": final_filename,
                    "url": url,
                    "message": "下载任务已开始，请查看底部进度条"
                }
            
            elif result.get("type") == "picker":
                # 多个选项，返回给用户选择
                return result
            
            else:
                return result
                
        except Exception as e:
            logger.error(f"Cobalt下载失败: {e}")
            return {
                "success": False,
                "error": "download_failed",
                "message": f"下载失败: {str(e)}"
            }
    
    @app.post(endpoint + "/api/cobalt/download-picker" if endpoint else "/api/cobalt/download-picker")
    async def download_picker_item(
        url: str = Body(...),
        picker_index: int = Body(...),
        save_to_server: bool = Body(default=True),
        filename: Optional[str] = Body(default=None),
        is_public: bool = Body(default=True),
        token: Optional[str] = Depends(verify_token_optional)
    ):
        """下载picker中的特定项目"""
        # 私有文件需要认证
        if not is_public and not token:
            raise HTTPException(status_code=401, detail="私有文件需要认证")
        
        try:
            # 首先获取picker响应
            result = await cobalt_downloader.download_media(url)
            
            if not result.get("success") or result.get("type") != "picker":
                return {
                    "success": False,
                    "error": "invalid_picker",
                    "message": "无效的picker响应"
                }
            
            picker_items = result.get("items", [])
            if picker_index >= len(picker_items):
                return {
                    "success": False,
                    "error": "invalid_index",
                    "message": "无效的picker索引"
                }
            
            selected_item = picker_items[picker_index]
            download_url = selected_item.get("url")
            
            if not save_to_server:
                return {
                    "success": True,
                    "type": "direct",
                    "url": download_url,
                    "item": selected_item
                }
            
            # 生成文件名
            item_type = selected_item.get("type", "media")
            suggested_filename = filename or f"cobalt_{item_type}_{picker_index}"
            
            # 下载文件内容
            file_content = await cobalt_downloader.download_file_content(download_url)
            
            # 保存到存储目录
            storage_dir = get_unified_storage_directory()
            file_path = os.path.join(storage_dir, suggested_filename)
            
            # 确保文件名唯一
            counter = 1
            base_name, ext = os.path.splitext(suggested_filename)
            while os.path.exists(file_path):
                final_filename = f"{base_name}_{counter}{ext}"
                file_path = os.path.join(storage_dir, final_filename)
                counter += 1
            else:
                final_filename = suggested_filename
            
            # 写入文件
            with open(file_path, 'wb') as f:
                f.write(file_content)
            
            return {
                "success": True,
                "type": "saved",
                "filename": final_filename,
                "size": len(file_content),
                "saved_to_server": True,
                "picker_index": picker_index
            }
            
        except Exception as e:
            logger.error(f"Picker项目下载失败: {e}")
            return {
                "success": False,
                "error": "download_failed",
                "message": f"下载失败: {str(e)}"
            }
    
    # URL内容处理API
    @app.post(endpoint + "/api/url/process" if endpoint else "/api/url/process")
    async def process_url_content(
        url: str = Form(..., description="要处理的URL"),
        is_public: bool = Form(True, description="是否公开"),
        tags: Optional[str] = Form(None, description="标签（JSON数组）"),
        description: str = Form("", description="描述"),
        notes: str = Form("", description="笔记"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """智能处理URL内容（转换HTML为Markdown等）"""
        # 私有文件需要认证
        if not is_public and not token:
            raise HTTPException(status_code=401, detail="私有文件需要认证")
        
        # 解析标签
        parsed_tags = []
        if tags:
            try:
                parsed_tags = json.loads(tags)
            except:
                parsed_tags = []
        
        # 获取存储目录
        storage_dir = get_unified_storage_directory()
        
        # 创建进度回调函数
        async def progress_callback(message):
            # 发送WebSocket进度通知
            await websocket_manager.notify_url_processing_progress(url, message)
        
        try:
            # 执行内容处理
            result = await handle_url_content_processing(url, storage_dir, progress_callback)
            
            if result.success and result.data:
                final_filename = result.data.get("filename")
                file_size = result.data.get("size", 0)
                
                # 更新元数据以包含用户指定的参数
                if final_filename:
                    from metadata_config import get_metadata_manager
                    from config import FILE_STORAGE_PATH
                    metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
                    
                    # 加载现有元数据
                    existing_metadata = await metadata_manager.load_metadata(final_filename)
                    if existing_metadata:
                        # 更新用户指定的字段
                        existing_metadata.is_public = is_public
                        existing_metadata.tags = parsed_tags
                        existing_metadata.description = description
                        existing_metadata.notes = notes
                        if token:
                            existing_metadata.created_by = token
                        
                        # 保存更新后的元数据
                        await metadata_manager.save_metadata(final_filename, existing_metadata)
                
                # 发送完成通知
                await websocket_manager.notify_file_created(
                    final_filename,
                    {
                        "action": "url_process",
                        "size": file_size,
                        "is_public": is_public,
                        "url": url,
                    },
                )
            
            return result
            
        except Exception as e:
            await websocket_manager.notify_url_processing_progress(url, f"处理失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")

    # ============= 目录权限管理API =============

    # 获取目录权限信息
    @app.get(
        endpoint + "/api/directories/{dir_path:path}/permission"
        if endpoint
        else "/api/directories/{dir_path:path}/permission"
    )
    async def get_directory_permission_endpoint(
        dir_path: str = Path(..., description="目录路径"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """获取目录权限信息"""
        import urllib.parse

        # URL解码
        dir_path = urllib.parse.unquote(dir_path)
        
        # 使用处理函数
        result = await handle_get_directory_permission(dir_path, token)
        
        if result.success:
            return {"success": True, "data": result.data}
        else:
            raise HTTPException(status_code=400, detail=result.error)

    # 设置目录权限
    @app.put(
        endpoint + "/api/directories/{dir_path:path}/permission"
        if endpoint
        else "/api/directories/{dir_path:path}/permission"
    )
    async def set_directory_permission_endpoint(
        dir_path: str = Path(..., description="目录路径"),
        is_public: bool = Form(..., description="是否公开"),
        apply_to_children: bool = Form(False, description="是否应用到子文件和子目录"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """设置目录权限"""
        import urllib.parse

        # URL解码
        dir_path = urllib.parse.unquote(dir_path)
        
        # 使用处理函数
        result = await handle_change_directory_permission(
            dir_path, is_public, apply_to_children, token
        )
        
        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_directory_permission_changed(
                dir_path,
                {"is_public": is_public, "apply_to_children": apply_to_children},
            )
            
            return {
                "success": True,
                "message": result.message,
                "data": result.data
            }
        else:
            if result.code == "PERMISSION_DENIED":
                raise HTTPException(status_code=401, detail=result.error)
            else:
                raise HTTPException(status_code=400, detail=result.error)

    # ============= 文件和目录锁定管理API =============

    # 批量设置锁定状态 - 必须在单个文件锁定之前
    @app.put(
        endpoint + "/api/files/batch/lock" if endpoint else "/api/files/batch/lock"
    )
    async def batch_set_lock_endpoint(
        file_paths: str = Form(..., description="文件路径列表（JSON格式）"),
        locked: bool = Form(..., description="是否锁定"),
        token: str = Depends(verify_token_required),
    ):
        """批量设置文件锁定状态（需要认证）"""
        try:
            import json
            import urllib.parse
            import logging

            logger = logging.getLogger(__name__)
            
            file_paths_list = json.loads(file_paths)
            logger.info(f"原始文件路径列表: {file_paths_list}")
            
            # URL解码文件路径
            file_paths_list = [urllib.parse.unquote(file_path) for file_path in file_paths_list]
            logger.info(f"URL解码后文件路径列表: {file_paths_list}")
            
        except Exception as e:
            logger.error(f"解析文件路径列表失败: {e}")
            raise HTTPException(status_code=400, detail="无效的文件路径列表格式")

        result = await handle_batch_set_lock(file_paths_list, locked, token)

        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_batch_operation(
                "lock_change",
                file_paths_list,
                {"locked": locked, "result": result.data or {}},
            )

            return {
                "success": True,
                "message": result.message,
                "data": result.data
            }
        else:
            if result.code == "PERMISSION_DENIED":
                raise HTTPException(status_code=401, detail=result.error)
            elif result.code in ["FILE_LOCKED", "DIRECTORY_LOCKED"]:
                raise HTTPException(status_code=423, detail=result.error)
            else:
                raise HTTPException(status_code=400, detail=result.error)

    # 设置文件锁定状态
    @app.put(
        endpoint + "/api/files/{file_path:path}/lock"
        if endpoint
        else "/api/files/{file_path:path}/lock"
    )
    async def set_file_lock_endpoint(
        file_path: str = Path(..., description="文件路径"),
        locked: bool = Form(..., description="是否锁定"),
        token: str = Depends(verify_token_required),
    ):
        """设置文件锁定状态（需要认证）"""
        import urllib.parse

        # URL解码
        file_path = urllib.parse.unquote(file_path)
        
        result = await handle_set_file_lock(file_path, locked, token)
        
        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_file_updated(
                file_path, {"action": "lock_change", "locked": locked}
            )
            
            return {
                "success": True,
                "message": result.message,
                "data": result.data
            }
        else:
            if result.code == "PERMISSION_DENIED":
                raise HTTPException(status_code=401, detail=result.error)
            elif result.code == "FILE_LOCKED":
                raise HTTPException(status_code=423, detail=result.error)
            else:
                raise HTTPException(status_code=400, detail=result.error)

    # 设置目录锁定状态
    @app.put(
        endpoint + "/api/directories/{dir_path:path}/lock"
        if endpoint
        else "/api/directories/{dir_path:path}/lock"
    )
    async def set_directory_lock_endpoint(
        dir_path: str = Path(..., description="目录路径"),
        locked: bool = Form(..., description="是否锁定"),
        apply_to_children: bool = Form(False, description="是否应用到子文件和子目录"),
        token: str = Depends(verify_token_required),
    ):
        """设置目录锁定状态（需要认证）"""
        import urllib.parse

        # URL解码
        dir_path = urllib.parse.unquote(dir_path)
        
        result = await handle_set_directory_lock(dir_path, locked, apply_to_children, token)
        
        if result.success:
            # 发送WebSocket通知
            await websocket_manager.notify_directory_lock_changed(
                dir_path,
                {"locked": locked, "apply_to_children": apply_to_children},
            )
            
            return {
                "success": True,
                "message": result.message,
                "data": result.data
            }
        else:
            if result.code == "PERMISSION_DENIED":
                raise HTTPException(status_code=401, detail=result.error)
            elif result.code == "DIRECTORY_LOCKED":
                raise HTTPException(status_code=423, detail=result.error)
            else:
                raise HTTPException(status_code=400, detail=result.error)

    # 统一文件下载路由
    @app.get(
        endpoint + "/api/files/{file_path:path}"
        if endpoint
        else "/api/files/{file_path:path}"
    )
    async def download_unified_file(
        file_path: str = Path(..., description="文件路径"),
        range_header: Optional[str] = Header(None, alias="Range"),
        download: Optional[str] = Query(None, description="强制下载参数"),
        token: Optional[str] = Depends(verify_token_optional),
    ):
        """
        统一文件下载（支持权限验证）
        支持断点续传和流式下载
        """
        from metadata_config import get_metadata_manager
        from config import FILE_STORAGE_PATH
        from utils import get_unified_storage_directory
        import urllib.parse

        # 安全路径检查
        if not is_safe_path(file_path):
            raise HTTPException(status_code=400, detail="非法的文件路径")

        # URL解码
        file_path = urllib.parse.unquote(file_path)

        # 使用统一存储目录
        storage_dir = get_unified_storage_directory()
        full_file_path = os.path.join(storage_dir, file_path)

        # 检查文件是否存在
        if not os.path.exists(full_file_path) or not os.path.isfile(full_file_path):
            raise HTTPException(status_code=404, detail="文件不存在")

        # 获取元数据（仅用于文件信息，不做权限检查）
        metadata_manager = get_metadata_manager(FILE_STORAGE_PATH)
        metadata = await metadata_manager.load_metadata(file_path)

        # 注释掉权限检查：让所有文件都可以通过直链访问
        # if metadata and not metadata.is_public and not token:
        #     raise HTTPException(status_code=401, detail="访问私有文件需要认证")

        try:
            # 获取文件信息
            file_size = os.path.getsize(full_file_path)
            
            # 优先使用元数据中的 content_type，如果没有则从文件扩展名推断
            if metadata and metadata.content_type and metadata.content_type != "application/octet-stream":
                mime_type = metadata.content_type
            else:
                mime_type = get_mime_type(os.path.basename(file_path))

            # 对文件名进行编码
            filename = os.path.basename(file_path)
            encoded_filename = encode_filename(filename)

            # 根据文件类型决定是否内联显示，如果有download参数则强制下载
            if download == "1":
                disposition = "attachment"
                # 强制下载时使用通用二进制类型，避免浏览器尝试显示内容
                content_type = "application/octet-stream"
            else:
                disposition = (
                    "inline"
                    if should_display_inline(filename, mime_type)
                    else "attachment"
                )
                # 只对文本类型添加 charset，视频/音频/图片等二进制文件不需要
                if mime_type.startswith(('text/', 'application/json', 'application/xml')):
                    content_type = mime_type + "; charset=utf-8"
                else:
                    content_type = mime_type

            # 设置基本响应头
            headers = {
                "Content-Disposition": f"{disposition}; filename*=UTF-8''{encoded_filename}",
                "Content-Type": content_type,
                "Access-Control-Expose-Headers": "Content-Disposition, Content-Range, Accept-Ranges, Content-Length",
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Cache-Control": "public, max-age=300",
                "ETag": generate_file_etag(
                    file_path, file_size, os.path.getmtime(full_file_path)
                ),
            }

            # 处理断点续传请求
            if range_header:
                try:
                    # 解析Range头
                    range_str = range_header.replace("bytes=", "").split("-")
                    range_start = int(range_str[0]) if range_str[0] else 0
                    range_end = (
                        int(range_str[1])
                        if range_str[1] and range_str[1].strip()
                        else file_size - 1
                    )

                    # 确保范围有效
                    if range_start < 0 or range_start >= file_size:
                        range_start = 0
                        range_end = file_size - 1

                    if range_end >= file_size:
                        range_end = file_size - 1

                    # 计算内容长度
                    content_length = range_end - range_start + 1

                    # 更新响应头
                    headers["Content-Range"] = (
                        f"bytes {range_start}-{range_end}/{file_size}"
                    )
                    headers["Content-Length"] = str(content_length)

                    # 返回部分内容
                    return StreamingResponse(
                        aiofile_chunks(full_file_path, range_start, range_end + 1),
                        status_code=206,
                        media_type=content_type.split(";")[
                            0
                        ],  # 只取MIME类型，不包含charset
                        headers=headers,
                    )
                except Exception as e:
                    # 如果解析Range头失败，返回整个文件
                    print(f"解析Range头失败: {str(e)}")

            # 返回完整文件
            return StreamingResponse(
                aiofile_chunks(full_file_path),
                media_type=content_type.split(";")[0],  # 只取MIME类型，不包含charset
                headers=headers,
            )

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"下载文件失败: {str(e)}")


async def handle_websocket_message(client_id: str, message: dict):
    """处理WebSocket消息"""
    message_type = message.get("type")

    if message_type == "subscribe_directory":
        directory = message.get("directory", "")
        await websocket_manager.subscribe_to_directory(client_id, directory)

    elif message_type == "subscribe_file":
        file_path = message.get("file_path")
        if file_path:
            await websocket_manager.subscribe_to_file(client_id, file_path)

    elif message_type == "unsubscribe_file":
        file_path = message.get("file_path")
        if file_path:
            await websocket_manager.unsubscribe_from_file(client_id, file_path)

    elif message_type == "ping":
        await websocket_manager.send_message(
            client_id,
            {"type": "pong", "timestamp": json.dumps(message.get("timestamp"))},
        )

    else:
        await websocket_manager.send_message(
            client_id,
            {"type": "error", "message": f"Unknown message type: {message_type}"},
        )
