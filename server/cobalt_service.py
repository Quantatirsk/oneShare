import aiohttp
import logging
import asyncio
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse
import re

logger = logging.getLogger(__name__)

class CobaltDownloader:
    """Cobalt API 媒体下载服务"""
    
    def __init__(self, cobalt_endpoint: str = "https://downloader.vect.one/"):
        self.cobalt_endpoint = cobalt_endpoint.rstrip('/')
        self.session = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """获取或创建 aiohttp 会话"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=60),
                headers={
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'FileServer/1.0 CobaltDownloader'
                }
            )
        return self.session
    
    async def close_session(self):
        """关闭会话"""
        if self.session and not self.session.closed:
            await self.session.close()
    
    def is_supported_url(self, url: str) -> bool:
        """检查 URL 是否被支持的平台"""
        supported_domains = [
            'youtube.com', 'youtu.be', 'tiktok.com', 'douyin.com',
            'instagram.com', 'twitter.com', 'x.com', 'facebook.com',
            'bilibili.com', 'xiaohongshu.com', 'xhslink.com',
            'vimeo.com', 'dailymotion.com', 'reddit.com'
        ]
        
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            # 移除 www. 前缀
            domain = re.sub(r'^www\.', '', domain)
            
            return any(supported in domain for supported in supported_domains)
        except Exception:
            return False
    
    async def download_media(
        self, 
        url: str, 
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        使用 Cobalt API 下载媒体
        
        Args:
            url: 媒体 URL
            options: 下载选项
            
        Returns:
            包含下载结果的字典
        """
        try:
            session = await self._get_session()
            
            # 构建请求数据
            request_data = {"url": url}
            if options:
                request_data.update(options)
            
            logger.info(f"Cobalt API 请求: {url} with options: {options}")
            
            # 发送请求到 Cobalt API
            async with session.post(
                f"{self.cobalt_endpoint}/",
                json=request_data
            ) as response:
                if response.status != 200:
                    logger.error(f"Cobalt API 响应错误: {response.status}")
                    return {
                        "success": False,
                        "error": f"HTTP {response.status}",
                        "message": "Cobalt API 请求失败"
                    }
                
                result = await response.json()
                logger.info(f"Cobalt API 响应: {result}")
                
                return await self._process_cobalt_response(result)
                
        except asyncio.TimeoutError:
            logger.error("Cobalt API 请求超时")
            return {
                "success": False,
                "error": "timeout",
                "message": "下载请求超时"
            }
        except Exception as e:
            logger.error(f"Cobalt API 请求失败: {e}")
            return {
                "success": False,
                "error": "request_failed",
                "message": f"请求失败: {str(e)}"
            }
    
    async def _process_cobalt_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """处理 Cobalt API 响应"""
        status = response.get("status")
        
        if status == "error":
            error_info = response.get("error", {})
            return {
                "success": False,
                "error": error_info.get("code", "unknown"),
                "message": error_info.get("text", "下载失败")
            }
        
        elif status in ["tunnel", "redirect"]:
            # 直接下载链接
            return {
                "success": True,
                "type": "single",
                "url": response.get("url"),
                "filename": response.get("filename"),
                "status": status
            }
        
        elif status == "picker":
            # 多个媒体选项
            picker_items = response.get("picker", [])
            return {
                "success": True,
                "type": "picker",
                "items": picker_items,
                "status": status
            }
        
        elif status == "stream":
            # 流媒体信息
            return {
                "success": True,
                "type": "stream",
                "stream_url": response.get("url"),
                "status": status
            }
        
        else:
            return {
                "success": False,
                "error": "unknown_status",
                "message": f"未知响应状态: {status}"
            }
    
    async def download_file_content(self, url: str, progress_callback=None) -> bytes:
        """下载文件内容，支持进度回调"""
        try:
            session = await self._get_session()
            async with session.get(url) as response:
                if response.status == 200:
                    total_size = int(response.headers.get('content-length', 0))
                    downloaded_size = 0
                    chunks = []
                    
                    logger.info(f"开始下载文件: url={url}, total_size={total_size}")
                    
                    async for chunk in response.content.iter_chunked(8192):
                        chunks.append(chunk)
                        downloaded_size += len(chunk)
                        
                        # 调用进度回调（即使没有total_size也调用）
                        if progress_callback:
                            if total_size > 0:
                                progress = (downloaded_size / total_size) * 100
                                await progress_callback(progress, downloaded_size, total_size)
                            else:
                                # 没有总大小时，每下载1MB发送一次进度
                                if downloaded_size % (1024 * 1024) < 8192:  # 大约每1MB
                                    await progress_callback(0, downloaded_size, 0)
                    
                    logger.info(f"文件下载完成: downloaded_size={downloaded_size}")
                    return b''.join(chunks)
                else:
                    raise Exception(f"下载失败: HTTP {response.status}")
        except Exception as e:
            logger.error(f"文件下载失败: {e}")
            raise
    
    def get_default_options(self, url: str) -> Dict[str, Any]:
        """根据 URL 获取默认下载选项"""
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        
        # YouTube 默认选项（最高规格）
        if 'youtube.com' in domain or 'youtu.be' in domain:
            return {
                "videoQuality": "max",
                "audioFormat": "best",
                "audioBitrate": "320",
                "youtubeVideoCodec": "h264",
                "youtubeBetterAudio": True
            }
        
        # TikTok默认选项
        elif 'tiktok.com' in domain:
            return {
                "allowH265": False,
                "tiktokFullAudio": True
            }
        
        # Instagram 默认选项（最高规格）
        elif 'instagram.com' in domain:
            return {
                "videoQuality": "max",
                "audioFormat": "best",
                "audioBitrate": "320"
            }
        
        # 通用默认选项（最高规格）
        return {
            "videoQuality": "max",
            "audioFormat": "best",
            "audioBitrate": "320"
        }

# 全局实例
cobalt_downloader = CobaltDownloader()

async def cleanup_cobalt_service():
    """清理服务"""
    await cobalt_downloader.close_session()