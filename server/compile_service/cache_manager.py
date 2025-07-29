"""
缓存管理器模块

实现三级缓存架构：内存缓存、文件缓存、Redis缓存
"""

import asyncio
import json
import logging
import os
import pickle
import time
from pathlib import Path
from typing import Dict, Any, Optional, Union
import hashlib

logger = logging.getLogger(__name__)

class CacheManager:
    """三级缓存管理器"""
    
    def __init__(self, 
                 memory_cache_size: int = 1000,
                 file_cache_dir: str = "cache",
                 redis_url: Optional[str] = None,
                 default_ttl: int = 3600):
        """
        初始化缓存管理器
        
        Args:
            memory_cache_size: 内存缓存最大条目数
            file_cache_dir: 文件缓存目录
            redis_url: Redis连接URL，如果为None则不启用Redis缓存
            default_ttl: 默认过期时间(秒)
        """
        self.memory_cache_size = memory_cache_size
        self.default_ttl = default_ttl
        
        # 内存缓存 - LRU实现
        self.memory_cache: Dict[str, Dict[str, Any]] = {}
        self.memory_access_order: Dict[str, float] = {}
        
        # 文件缓存
        self.file_cache_dir = Path(file_cache_dir)
        self.file_cache_dir.mkdir(exist_ok=True)
        
        # Redis缓存 (可选)
        self.redis_cache = None
        if redis_url:
            try:
                from .redis_cache import RedisCache
                self.redis_cache = RedisCache(redis_url=redis_url, default_ttl=default_ttl)
                logger.info(f"Redis cache enabled with URL: {redis_url}")
            except ImportError:
                logger.warning("Redis not available, install with: pip install redis")
            except Exception as e:
                logger.error(f"Failed to initialize Redis cache: {str(e)}")
        
        # 缓存统计
        self.stats = {
            "memory_hits": 0,
            "file_hits": 0,
            "redis_hits": 0,
            "misses": 0,
            "total_requests": 0,
            "evictions": 0
        }
        
        logger.info(f"CacheManager initialized - memory_size: {memory_cache_size}, file_dir: {file_cache_dir}")
    
    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        """
        从缓存获取数据
        
        Args:
            key: 缓存键
            
        Returns:
            Optional[Dict]: 缓存数据，如果不存在则返回None
        """
        self.stats["total_requests"] += 1
        
        # 1. 检查内存缓存
        memory_data = self._get_from_memory(key)
        if memory_data:
            self.stats["memory_hits"] += 1
            logger.debug(f"Memory cache hit for key: {key}")
            return memory_data
        
        # 2. 检查文件缓存
        file_data = await self._get_from_file(key)
        if file_data:
            self.stats["file_hits"] += 1
            logger.debug(f"File cache hit for key: {key}")
            # 提升到内存缓存
            self._set_to_memory(key, file_data)
            return file_data
        
        # 3. 检查Redis缓存
        if self.redis_cache:
            redis_data = await self._get_from_redis(key)
            if redis_data:
                self.stats["redis_hits"] += 1
                logger.debug(f"Redis cache hit for key: {key}")
                # 提升到内存和文件缓存
                self._set_to_memory(key, redis_data)
                await self._set_to_file(key, redis_data)
                return redis_data
        
        # 缓存未命中
        self.stats["misses"] += 1
        logger.debug(f"Cache miss for key: {key}")
        return None
    
    async def set(self, key: str, value: Dict[str, Any], ttl: Optional[int] = None) -> bool:
        """
        设置缓存数据
        
        Args:
            key: 缓存键
            value: 缓存值
            ttl: 过期时间(秒)，如果为None则使用默认TTL
            
        Returns:
            bool: 是否设置成功
        """
        try:
            ttl = ttl or self.default_ttl
            
            # 添加元数据
            cached_data = {
                "value": value,
                "timestamp": time.time(),
                "ttl": ttl,
                "expires_at": time.time() + ttl
            }
            
            # 设置到所有缓存层
            success = True
            
            # 内存缓存
            self._set_to_memory(key, cached_data)
            
            # 文件缓存
            file_success = await self._set_to_file(key, cached_data)
            if not file_success:
                success = False
            
            # Redis缓存
            if self.redis_cache:
                redis_success = await self._set_to_redis(key, cached_data, ttl)
                if not redis_success:
                    success = False
            
            logger.debug(f"Cache set for key: {key}, success: {success}")
            return success
            
        except Exception as e:
            logger.error(f"Failed to set cache for key {key}: {str(e)}")
            return False
    
    async def delete(self, key: str) -> bool:
        """
        删除缓存项
        
        Args:
            key: 缓存键
            
        Returns:
            bool: 是否删除成功
        """
        try:
            # 从内存缓存删除
            self.memory_cache.pop(key, None)
            self.memory_access_order.pop(key, None)
            
            # 从文件缓存删除
            file_path = self._get_file_path(key)
            if file_path.exists():
                file_path.unlink()
            
            # 从Redis缓存删除
            if self.redis_cache:
                await self.redis_cache.delete(key)
            
            logger.debug(f"Cache deleted for key: {key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete cache for key {key}: {str(e)}")
            return False
    
    async def clear(self) -> int:
        """
        清空所有缓存
        
        Returns:
            int: 清理的条目数
        """
        try:
            cleared_count = 0
            
            # 清空内存缓存
            memory_count = len(self.memory_cache)
            self.memory_cache.clear()
            self.memory_access_order.clear()
            cleared_count += memory_count
            
            # 清空文件缓存
            file_count = 0
            for file_path in self.file_cache_dir.glob("*.cache"):
                file_path.unlink()
                file_count += 1
            cleared_count += file_count
            
            # 清空Redis缓存 (只清空我们的键)
            if self.redis_cache:
                redis_count = await self.redis_cache.clear_pattern("*")
                cleared_count += redis_count
            
            logger.info(f"Cleared {cleared_count} cache entries")
            return cleared_count
            
        except Exception as e:
            logger.error(f"Failed to clear cache: {str(e)}")
            return 0
    
    def _get_from_memory(self, key: str) -> Optional[Dict[str, Any]]:
        """从内存缓存获取数据"""
        if key in self.memory_cache:
            cached_data = self.memory_cache[key]
            
            # 检查数据格式
            if not isinstance(cached_data, dict):
                # 数据格式不正确，清理缓存
                self.memory_cache.pop(key, None)
                self.memory_access_order.pop(key, None)
                return None
            
            # 检查过期时间
            expires_at = cached_data.get("expires_at")
            if expires_at and time.time() > expires_at:
                self.memory_cache.pop(key, None)
                self.memory_access_order.pop(key, None)
                return None
            
            # 更新访问时间
            self.memory_access_order[key] = time.time()
            return cached_data.get("value")
        
        return None
    
    def _set_to_memory(self, key: str, data: Dict[str, Any]):
        """设置到内存缓存"""
        # 检查缓存大小，如果超过限制则清理最久未使用的
        if len(self.memory_cache) >= self.memory_cache_size:
            self._evict_memory_cache()
        
        self.memory_cache[key] = data
        self.memory_access_order[key] = time.time()
    
    def _evict_memory_cache(self):
        """清理内存缓存中最久未使用的项"""
        if not self.memory_access_order:
            return
        
        # 找到最久未使用的键
        oldest_key = min(self.memory_access_order.keys(), 
                        key=lambda k: self.memory_access_order[k])
        
        # 删除最久未使用的项
        self.memory_cache.pop(oldest_key, None)
        self.memory_access_order.pop(oldest_key, None)
        self.stats["evictions"] += 1
        
        logger.debug(f"Evicted memory cache entry: {oldest_key}")
    
    async def _get_from_file(self, key: str) -> Optional[Dict[str, Any]]:
        """从文件缓存获取数据"""
        try:
            file_path = self._get_file_path(key)
            if not file_path.exists():
                return None
            
            with open(file_path, 'rb') as f:
                cached_data = pickle.load(f)
            
            # 检查数据格式
            if not isinstance(cached_data, dict):
                # 数据格式不正确，删除文件
                file_path.unlink()
                return None
            
            # 检查过期时间
            expires_at = cached_data.get("expires_at")
            if expires_at and time.time() > expires_at:
                file_path.unlink()
                return None
            
            return cached_data.get("value")
            
        except Exception as e:
            logger.error(f"Failed to get from file cache: {str(e)}")
            # 如果文件损坏，尝试删除
            try:
                file_path = self._get_file_path(key)
                if file_path.exists():
                    file_path.unlink()
            except:
                pass
            return None
    
    async def _set_to_file(self, key: str, data: Dict[str, Any]) -> bool:
        """设置到文件缓存"""
        try:
            file_path = self._get_file_path(key)
            
            with open(file_path, 'wb') as f:
                pickle.dump(data, f)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to set to file cache: {str(e)}")
            return False
    
    def _get_file_path(self, key: str) -> Path:
        """获取文件缓存路径"""
        # 使用哈希作为文件名，避免特殊字符问题
        key_hash = hashlib.md5(key.encode()).hexdigest()
        return self.file_cache_dir / f"{key_hash}.cache"
    
    async def _get_from_redis(self, key: str) -> Optional[Dict[str, Any]]:
        """从Redis缓存获取数据"""
        try:
            if not self.redis_cache:
                return None
            
            # 使用RedisCache获取数据，它已经处理了过期检查
            return await self.redis_cache.get(key)
            
        except Exception as e:
            logger.error(f"Failed to get from Redis cache: {str(e)}")
            return None
    
    async def _set_to_redis(self, key: str, data: Dict[str, Any], ttl: int) -> bool:
        """设置到Redis缓存"""
        try:
            if not self.redis_cache:
                return False
            
            # 使用RedisCache设置数据，传入原始value而不是包装后的data
            value = data.get("value", data)
            return await self.redis_cache.set(key, value, ttl)
            
        except Exception as e:
            logger.error(f"Failed to set to Redis cache: {str(e)}")
            return False
    
    def get_cache_size(self) -> int:
        """获取缓存条目总数"""
        memory_size = len(self.memory_cache)
        file_size = len(list(self.file_cache_dir.glob("*.cache")))
        return memory_size + file_size
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        total_hits = self.stats["memory_hits"] + self.stats["file_hits"] + self.stats["redis_hits"]
        total_requests = self.stats["total_requests"]
        
        hit_rate = total_hits / total_requests if total_requests > 0 else 0.0
        miss_rate = self.stats["misses"] / total_requests if total_requests > 0 else 0.0
        
        # 获取Redis统计信息
        redis_cache_entries = 0
        redis_stats = {}
        if self.redis_cache:
            try:
                redis_cache_entries = await self.redis_cache.get_size()
                redis_stats = self.redis_cache.get_stats()
            except Exception as e:
                logger.error(f"Failed to get Redis stats: {str(e)}")
        
        return {
            "total_entries": self.get_cache_size() + redis_cache_entries,
            "memory_cache_entries": len(self.memory_cache),
            "file_cache_entries": len(list(self.file_cache_dir.glob("*.cache"))),
            "redis_cache_entries": redis_cache_entries,
            "cache_size_mb": self._calculate_cache_size_mb(),
            "hit_rate": round(hit_rate, 3),
            "miss_rate": round(miss_rate, 3),
            "memory_hits": self.stats["memory_hits"],
            "file_hits": self.stats["file_hits"],
            "redis_hits": self.stats["redis_hits"],
            "total_requests": self.stats["total_requests"],
            "evictions": self.stats["evictions"],
            "redis_enabled": self.redis_cache is not None,
            "redis_stats": redis_stats
        }
    
    def _calculate_cache_size_mb(self) -> float:
        """计算缓存大小（MB）"""
        try:
            total_size = 0
            
            # 文件缓存大小
            for file_path in self.file_cache_dir.glob("*.cache"):
                total_size += file_path.stat().st_size
            
            # 内存缓存大小（估算）
            memory_size = len(json.dumps(self.memory_cache, default=str).encode())
            total_size += memory_size
            
            return round(total_size / (1024 * 1024), 2)
            
        except Exception as e:
            logger.error(f"Failed to calculate cache size: {str(e)}")
            return 0.0
    
    async def cleanup_expired(self) -> int:
        """清理过期的缓存条目"""
        try:
            cleaned_count = 0
            current_time = time.time()
            
            # 清理内存缓存中的过期条目
            expired_keys = []
            for key, data in self.memory_cache.items():
                if isinstance(data, dict) and data.get("expires_at") and current_time > data["expires_at"]:
                    expired_keys.append(key)
            
            for key in expired_keys:
                self.memory_cache.pop(key, None)
                self.memory_access_order.pop(key, None)
                cleaned_count += 1
            
            # 清理文件缓存中的过期条目
            for file_path in self.file_cache_dir.glob("*.cache"):
                try:
                    with open(file_path, 'rb') as f:
                        cached_data = pickle.load(f)
                    
                    if isinstance(cached_data, dict) and cached_data.get("expires_at") and current_time > cached_data["expires_at"]:
                        file_path.unlink()
                        cleaned_count += 1
                        
                except Exception:
                    # 如果文件损坏，直接删除
                    file_path.unlink()
                    cleaned_count += 1
            
            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} expired cache entries")
            
            return cleaned_count
            
        except Exception as e:
            logger.error(f"Failed to cleanup expired cache: {str(e)}")
            return 0