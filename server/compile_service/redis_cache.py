"""
Redis 缓存实现模块

为编译服务提供分布式缓存支持，实现高性能的共享缓存层
"""

import asyncio
import json
import logging
import time
from typing import Dict, Any, Optional, List, Union
import hashlib
import os

logger = logging.getLogger(__name__)

class RedisCache:
    """Redis 缓存实现类"""
    
    def __init__(self, 
                 redis_url: Optional[str] = None,
                 default_ttl: int = 3600,
                 key_prefix: str = "compile:",
                 max_retries: int = 3,
                 retry_delay: float = 1.0):
        """
        初始化 Redis 缓存
        
        Args:
            redis_url: Redis 连接URL
            default_ttl: 默认过期时间(秒)
            key_prefix: 键前缀
            max_retries: 最大重试次数
            retry_delay: 重试延迟时间
        """
        self.redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        self.default_ttl = default_ttl
        self.key_prefix = key_prefix
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        
        self.redis_client = None
        self._connection_pool = None
        self._is_connected = False
        
        # 统计信息
        self.stats = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "deletes": 0,
            "errors": 0,
            "connection_failures": 0
        }
        
        # 尝试初始化连接
        asyncio.create_task(self._initialize_connection())
    
    async def _initialize_connection(self):
        """初始化 Redis 连接"""
        try:
            # 尝试导入 redis
            try:
                import redis.asyncio as redis
            except ImportError:
                logger.warning("Redis 库未安装，Redis 缓存功能不可用。安装命令: pip install redis")
                return False
            
            # 创建连接池
            self._connection_pool = redis.ConnectionPool.from_url(
                self.redis_url,
                max_connections=10,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True
            )
            
            # 创建客户端
            self.redis_client = redis.Redis(connection_pool=self._connection_pool)
            
            # 测试连接
            await self.redis_client.ping()
            self._is_connected = True
            
            logger.info(f"Redis 缓存已连接: {self.redis_url}")
            return True
            
        except Exception as e:
            logger.error(f"Redis 连接失败: {str(e)}")
            self.stats["connection_failures"] += 1
            self._is_connected = False
            return False
    
    async def _ensure_connection(self) -> bool:
        """确保 Redis 连接可用"""
        if not self._is_connected or not self.redis_client:
            return await self._initialize_connection()
        
        try:
            # 测试连接
            await self.redis_client.ping()
            return True
        except Exception as e:
            logger.warning(f"Redis 连接测试失败，尝试重连: {str(e)}")
            return await self._initialize_connection()
    
    def _get_full_key(self, key: str) -> str:
        """获取完整的缓存键"""
        return f"{self.key_prefix}{key}"
    
    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        """
        从 Redis 获取缓存数据
        
        Args:
            key: 缓存键
            
        Returns:
            Optional[Dict]: 缓存数据，如果不存在则返回None
        """
        if not await self._ensure_connection():
            return None
        
        full_key = self._get_full_key(key)
        
        for attempt in range(self.max_retries):
            try:
                # 获取数据
                data = await self.redis_client.get(full_key)
                
                if data is None:
                    self.stats["misses"] += 1
                    return None
                
                # 解析 JSON 数据
                cached_data = json.loads(data)
                
                # 检查过期时间
                if "expires_at" in cached_data:
                    if time.time() > cached_data["expires_at"]:
                        # 数据已过期，删除并返回 None
                        await self.delete(key)
                        self.stats["misses"] += 1
                        return None
                
                self.stats["hits"] += 1
                logger.debug(f"Redis 缓存命中: {key}")
                
                return cached_data.get("value")
                
            except json.JSONDecodeError as e:
                logger.error(f"Redis 数据解析失败: {str(e)}")
                await self.delete(key)  # 删除损坏的数据
                self.stats["errors"] += 1
                return None
                
            except Exception as e:
                logger.error(f"Redis 获取数据失败 (尝试 {attempt + 1}): {str(e)}")
                self.stats["errors"] += 1
                
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                    # 重新连接
                    await self._initialize_connection()
                else:
                    return None
        
        return None
    
    async def set(self, key: str, value: Dict[str, Any], ttl: Optional[int] = None) -> bool:
        """
        设置 Redis 缓存数据
        
        Args:
            key: 缓存键
            value: 缓存值
            ttl: 过期时间(秒)
            
        Returns:
            bool: 是否设置成功
        """
        if not await self._ensure_connection():
            return False
        
        full_key = self._get_full_key(key)
        ttl = ttl or self.default_ttl
        
        # 准备缓存数据
        cached_data = {
            "value": value,
            "timestamp": time.time(),
            "ttl": ttl,
            "expires_at": time.time() + ttl
        }
        
        for attempt in range(self.max_retries):
            try:
                # 序列化数据
                serialized_data = json.dumps(cached_data, default=str)
                
                # 设置到 Redis
                success = await self.redis_client.setex(
                    full_key, 
                    ttl, 
                    serialized_data
                )
                
                if success:
                    self.stats["sets"] += 1
                    logger.debug(f"Redis 缓存设置成功: {key}")
                    return True
                else:
                    logger.warning(f"Redis 设置返回 False: {key}")
                    return False
                    
            except Exception as e:
                logger.error(f"Redis 设置数据失败 (尝试 {attempt + 1}): {str(e)}")
                self.stats["errors"] += 1
                
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                    await self._initialize_connection()
                else:
                    return False
        
        return False
    
    async def delete(self, key: str) -> bool:
        """
        删除 Redis 缓存项
        
        Args:
            key: 缓存键
            
        Returns:
            bool: 是否删除成功
        """
        if not await self._ensure_connection():
            return False
        
        full_key = self._get_full_key(key)
        
        try:
            result = await self.redis_client.delete(full_key)
            if result > 0:
                self.stats["deletes"] += 1
                logger.debug(f"Redis 缓存删除成功: {key}")
                return True
            else:
                return False
                
        except Exception as e:
            logger.error(f"Redis 删除数据失败: {str(e)}")
            self.stats["errors"] += 1
            return False
    
    async def clear_pattern(self, pattern: str = "*") -> int:
        """
        清空匹配模式的缓存项
        
        Args:
            pattern: 匹配模式
            
        Returns:
            int: 清理的条目数
        """
        if not await self._ensure_connection():
            return 0
        
        full_pattern = self._get_full_key(pattern)
        cleared_count = 0
        
        try:
            # 获取匹配的键
            keys = []
            async for key in self.redis_client.scan_iter(match=full_pattern):
                keys.append(key)
            
            # 批量删除
            if keys:
                deleted_count = await self.redis_client.delete(*keys)
                cleared_count = deleted_count
                self.stats["deletes"] += deleted_count
                
            logger.info(f"Redis 清理了 {cleared_count} 个缓存条目")
            return cleared_count
            
        except Exception as e:
            logger.error(f"Redis 清理缓存失败: {str(e)}")
            self.stats["errors"] += 1
            return 0
    
    async def get_size(self) -> int:
        """获取当前前缀下的缓存条目数"""
        if not await self._ensure_connection():
            return 0
        
        try:
            count = 0
            full_pattern = self._get_full_key("*")
            async for _ in self.redis_client.scan_iter(match=full_pattern):
                count += 1
            return count
            
        except Exception as e:
            logger.error(f"Redis 获取大小失败: {str(e)}")
            return 0
    
    async def get_memory_usage(self) -> Dict[str, Any]:
        """获取 Redis 内存使用情况"""
        if not await self._ensure_connection():
            return {"error": "连接失败"}
        
        try:
            info = await self.redis_client.info("memory")
            return {
                "used_memory": info.get("used_memory", 0),
                "used_memory_human": info.get("used_memory_human", "0B"),
                "used_memory_peak": info.get("used_memory_peak", 0),
                "used_memory_peak_human": info.get("used_memory_peak_human", "0B"),
                "total_system_memory": info.get("total_system_memory", 0),
                "total_system_memory_human": info.get("total_system_memory_human", "0B")
            }
            
        except Exception as e:
            logger.error(f"Redis 获取内存信息失败: {str(e)}")
            return {"error": str(e)}
    
    async def health_check(self) -> Dict[str, Any]:
        """Redis 健康检查"""
        try:
            if not await self._ensure_connection():
                return {
                    "status": "unhealthy",
                    "connected": False,
                    "error": "连接失败"
                }
            
            # 执行 ping 测试
            start_time = time.time()
            await self.redis_client.ping()
            ping_time = (time.time() - start_time) * 1000  # 毫秒
            
            # 获取服务器信息
            info = await self.redis_client.info("server")
            
            return {
                "status": "healthy",
                "connected": True,
                "ping_time_ms": round(ping_time, 2),
                "redis_version": info.get("redis_version", "unknown"),
                "uptime_seconds": info.get("uptime_in_seconds", 0),
                "stats": self.stats.copy()
            }
            
        except Exception as e:
            return {
                "status": "unhealthy",
                "connected": False,
                "error": str(e),
                "stats": self.stats.copy()
            }
    
    async def bulk_get(self, keys: List[str]) -> Dict[str, Any]:
        """批量获取缓存数据"""
        if not await self._ensure_connection():
            return {}
        
        if not keys:
            return {}
        
        try:
            full_keys = [self._get_full_key(key) for key in keys]
            
            # 批量获取
            values = await self.redis_client.mget(full_keys)
            
            result = {}
            for i, (key, value) in enumerate(zip(keys, values)):
                if value is not None:
                    try:
                        cached_data = json.loads(value)
                        if "expires_at" in cached_data:
                            if time.time() <= cached_data["expires_at"]:
                                result[key] = cached_data.get("value")
                                self.stats["hits"] += 1
                            else:
                                # 过期数据，异步删除
                                asyncio.create_task(self.delete(key))
                                self.stats["misses"] += 1
                        else:
                            result[key] = cached_data.get("value")
                            self.stats["hits"] += 1
                    except json.JSONDecodeError:
                        # 损坏的数据，异步删除
                        asyncio.create_task(self.delete(key))
                        self.stats["errors"] += 1
                else:
                    self.stats["misses"] += 1
            
            return result
            
        except Exception as e:
            logger.error(f"Redis 批量获取失败: {str(e)}")
            self.stats["errors"] += 1
            return {}
    
    async def bulk_set(self, items: Dict[str, Dict[str, Any]], ttl: Optional[int] = None) -> int:
        """批量设置缓存数据"""
        if not await self._ensure_connection():
            return 0
        
        if not items:
            return 0
        
        ttl = ttl or self.default_ttl
        success_count = 0
        
        try:
            # 准备批量数据
            pipe = self.redis_client.pipeline()
            
            for key, value in items.items():
                full_key = self._get_full_key(key)
                cached_data = {
                    "value": value,
                    "timestamp": time.time(),
                    "ttl": ttl,
                    "expires_at": time.time() + ttl
                }
                serialized_data = json.dumps(cached_data, default=str)
                pipe.setex(full_key, ttl, serialized_data)
            
            # 执行批量操作
            results = await pipe.execute()
            
            # 统计成功数量
            success_count = sum(1 for result in results if result)
            self.stats["sets"] += success_count
            
            logger.debug(f"Redis 批量设置: {success_count}/{len(items)} 成功")
            return success_count
            
        except Exception as e:
            logger.error(f"Redis 批量设置失败: {str(e)}")
            self.stats["errors"] += 1
            return 0
    
    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        total_requests = self.stats["hits"] + self.stats["misses"]
        hit_rate = self.stats["hits"] / total_requests if total_requests > 0 else 0.0
        
        return {
            "connected": self._is_connected,
            "redis_url": self.redis_url,
            "key_prefix": self.key_prefix,
            "default_ttl": self.default_ttl,
            "hits": self.stats["hits"],
            "misses": self.stats["misses"],
            "sets": self.stats["sets"],
            "deletes": self.stats["deletes"],
            "errors": self.stats["errors"],
            "connection_failures": self.stats["connection_failures"],
            "hit_rate": round(hit_rate, 3),
            "total_requests": total_requests
        }
    
    async def close(self):
        """关闭 Redis 连接"""
        if self.redis_client:
            try:
                await self.redis_client.close()
                logger.info("Redis 连接已关闭")
            except Exception as e:
                logger.error(f"关闭 Redis 连接失败: {str(e)}")
        
        if self._connection_pool:
            try:
                await self._connection_pool.disconnect()
            except Exception as e:
                logger.error(f"关闭 Redis 连接池失败: {str(e)}")
        
        self._is_connected = False

# 全局 Redis 缓存实例
_redis_cache_instance: Optional[RedisCache] = None

def get_redis_cache(redis_url: Optional[str] = None) -> RedisCache:
    """
    获取全局 Redis 缓存实例
    
    Args:
        redis_url: Redis 连接URL
        
    Returns:
        RedisCache: Redis 缓存实例
    """
    global _redis_cache_instance
    if _redis_cache_instance is None:
        _redis_cache_instance = RedisCache(redis_url=redis_url)
    return _redis_cache_instance