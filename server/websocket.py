import json
import asyncio
from datetime import datetime
from typing import Dict, Set, List, Optional
from fastapi import WebSocket, WebSocketDisconnect
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

@dataclass
class ClientInfo:
    websocket: WebSocket
    user_id: str
    current_path: str = ""
    current_file: Optional[str] = None
    last_seen: datetime = None

class WebSocketManager:
    def __init__(self):
        # 存储活动连接
        self.active_connections: Dict[str, ClientInfo] = {}
        # 文件订阅：文件路径 -> 订阅的客户端ID集合
        self.file_subscriptions: Dict[str, Set[str]] = {}
        # 目录订阅：目录路径 -> 订阅的客户端ID集合  
        self.directory_subscriptions: Dict[str, Set[str]] = {}
        
    async def connect(self, websocket: WebSocket, client_id: str, user_id: str):
        """接受WebSocket连接"""
        await websocket.accept()
        self.active_connections[client_id] = ClientInfo(
            websocket=websocket,
            user_id=user_id,
            last_seen=datetime.now()
        )
        logger.info(f"Client {client_id} connected")
        
        # 发送连接成功消息
        await self.send_message(client_id, {
            "type": "connected",
            "client_id": client_id,
            "timestamp": datetime.now().isoformat()
        })
    
    def disconnect(self, client_id: str):
        """断开WebSocket连接"""
        if client_id in self.active_connections:
            # 清理所有订阅
            self._cleanup_subscriptions(client_id)
            del self.active_connections[client_id]
            logger.info(f"Client {client_id} disconnected")
    
    def _cleanup_subscriptions(self, client_id: str):
        """清理客户端的所有订阅"""
        # 清理文件订阅
        for file_path in list(self.file_subscriptions.keys()):
            if client_id in self.file_subscriptions[file_path]:
                self.file_subscriptions[file_path].discard(client_id)
                if not self.file_subscriptions[file_path]:
                    del self.file_subscriptions[file_path]
        
        # 清理目录订阅
        for dir_path in list(self.directory_subscriptions.keys()):
            if client_id in self.directory_subscriptions[dir_path]:
                self.directory_subscriptions[dir_path].discard(client_id)
                if not self.directory_subscriptions[dir_path]:
                    del self.directory_subscriptions[dir_path]
    
    async def send_message(self, client_id: str, message: dict):
        """发送消息给指定客户端"""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].websocket.send_text(
                    json.dumps(message)
                )
                self.active_connections[client_id].last_seen = datetime.now()
            except Exception as e:
                logger.error(f"Failed to send message to {client_id}: {e}")
                self.disconnect(client_id)
    
    async def broadcast_to_subscribers(self, subscribers: Set[str], message: dict):
        """广播消息给订阅者"""
        if not subscribers:
            return
            
        disconnected_clients = []
        for client_id in subscribers:
            if client_id in self.active_connections:
                try:
                    await self.active_connections[client_id].websocket.send_text(
                        json.dumps(message)
                    )
                    self.active_connections[client_id].last_seen = datetime.now()
                except Exception as e:
                    logger.error(f"Failed to broadcast to {client_id}: {e}")
                    disconnected_clients.append(client_id)
        
        # 清理断开的连接
        for client_id in disconnected_clients:
            self.disconnect(client_id)
    
    async def subscribe_to_directory(self, client_id: str, directory_path: str):
        """订阅目录变更"""
        print(f"客户端 {client_id} 订阅目录: '{directory_path}'")
        
        if directory_path not in self.directory_subscriptions:
            self.directory_subscriptions[directory_path] = set()
        
        self.directory_subscriptions[directory_path].add(client_id)
        
        # 更新客户端当前路径
        if client_id in self.active_connections:
            self.active_connections[client_id].current_path = directory_path
        
        print(f"目录订阅更新: {dict([(k, len(v)) for k, v in self.directory_subscriptions.items()])}")
        
        await self.send_message(client_id, {
            "type": "directory_subscribed",
            "directory": directory_path,
            "timestamp": datetime.now().isoformat()
        })
    
    async def subscribe_to_file(self, client_id: str, file_path: str):
        """订阅文件变更"""
        if file_path not in self.file_subscriptions:
            self.file_subscriptions[file_path] = set()
        
        self.file_subscriptions[file_path].add(client_id)
        
        # 更新客户端当前文件
        if client_id in self.active_connections:
            self.active_connections[client_id].current_file = file_path
        
        await self.send_message(client_id, {
            "type": "file_subscribed", 
            "file": file_path,
            "timestamp": datetime.now().isoformat()
        })
    
    async def unsubscribe_from_file(self, client_id: str, file_path: str):
        """取消文件订阅"""
        if file_path in self.file_subscriptions:
            self.file_subscriptions[file_path].discard(client_id)
            if not self.file_subscriptions[file_path]:
                del self.file_subscriptions[file_path]
        
        if client_id in self.active_connections:
            if self.active_connections[client_id].current_file == file_path:
                self.active_connections[client_id].current_file = None
    
    # 文件系统事件通知方法
    async def notify_file_created(self, file_path: str, file_info: dict):
        """通知文件创建"""
        import os
        directory = os.path.dirname(file_path) or ""
        
        message = {
            "type": "file_created",
            "file_path": file_path,
            "file_info": file_info,
            "directory": directory,
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"WebSocket通知: 文件创建 {file_path}，目录: '{directory}'")
        
        # 通知目录订阅者
        if directory in self.directory_subscriptions:
            print(f"向目录 '{directory}' 的 {len(self.directory_subscriptions[directory])} 个订阅者发送通知")
            await self.broadcast_to_subscribers(
                self.directory_subscriptions[directory], 
                message
            )
        else:
            print(f"目录 '{directory}' 没有订阅者")
    
    async def notify_file_updated(self, file_path: str, file_info: dict):
        """通知文件更新"""
        import os
        directory = os.path.dirname(file_path) or ""
        
        message = {
            "type": "file_updated",
            "file_path": file_path,
            "file_info": file_info,
            "directory": directory,
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"WebSocket通知: 文件更新 {file_path}，目录: '{directory}'")
        
        # 通知文件订阅者
        if file_path in self.file_subscriptions:
            await self.broadcast_to_subscribers(
                self.file_subscriptions[file_path], 
                message
            )
        
        # 通知目录订阅者
        if directory in self.directory_subscriptions:
            await self.broadcast_to_subscribers(
                self.directory_subscriptions[directory], 
                message
            )
    
    async def notify_file_deleted(self, file_path: str):
        """通知文件删除"""
        import os
        directory = os.path.dirname(file_path) or ""
        
        message = {
            "type": "file_deleted",
            "file_path": file_path,
            "directory": directory,
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"WebSocket通知: 文件删除 {file_path}，目录: '{directory}'")
        
        # 通知文件订阅者
        if file_path in self.file_subscriptions:
            await self.broadcast_to_subscribers(
                self.file_subscriptions[file_path], 
                message
            )
            # 清理订阅
            del self.file_subscriptions[file_path]
        
        # 通知目录订阅者
        if directory in self.directory_subscriptions:
            await self.broadcast_to_subscribers(
                self.directory_subscriptions[directory], 
                message
            )
    
    async def notify_file_renamed(self, old_path: str, new_path: str, file_info: dict):
        """通知文件重命名"""
        import os
        old_directory = os.path.dirname(old_path) or ""
        new_directory = os.path.dirname(new_path) or ""
        
        message = {
            "type": "file_renamed",
            "old_path": old_path,
            "new_path": new_path,
            "file_info": file_info,
            "old_directory": old_directory,
            "new_directory": new_directory,
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"WebSocket通知: 文件重命名 {old_path} -> {new_path}")
        
        # 通知旧文件订阅者
        if old_path in self.file_subscriptions:
            await self.broadcast_to_subscribers(
                self.file_subscriptions[old_path], 
                message
            )
            # 迁移订阅到新路径
            if new_path not in self.file_subscriptions:
                self.file_subscriptions[new_path] = set()
            self.file_subscriptions[new_path].update(self.file_subscriptions[old_path])
            del self.file_subscriptions[old_path]
        
        # 通知目录订阅者
        directories = {old_directory, new_directory}
        for directory in directories:
            if directory in self.directory_subscriptions:
                await self.broadcast_to_subscribers(
                    self.directory_subscriptions[directory], 
                    message
                )
    
    async def notify_batch_operation(self, operation: str, files: List[str], result: dict):
        """通知批量操作"""
        import os
        affected_directories = set()
        
        # 添加源文件所在的目录
        for file_path in files:
            directory = os.path.dirname(file_path) or ""
            # 标准化目录路径
            if directory == "":
                directory = ""
            affected_directories.add(directory)
        
        # 对于move操作，还要添加目标目录
        if operation == "move" and "target_dir" in result:
            target_dir = result["target_dir"]
            if target_dir == "":
                target_dir = ""
            affected_directories.add(target_dir)
        
        message = {
            "type": "batch_operation",
            "operation": operation,
            "files": files,
            "result": result,
            "affected_directories": list(affected_directories),
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"WebSocket通知: {operation} 操作，影响目录: {list(affected_directories)}")
        print(f"当前目录订阅: {list(self.directory_subscriptions.keys())}")
        
        # 通知所有受影响目录的订阅者
        for directory in affected_directories:
            if directory in self.directory_subscriptions:
                print(f"向目录 '{directory}' 的 {len(self.directory_subscriptions[directory])} 个订阅者发送通知")
                await self.broadcast_to_subscribers(
                    self.directory_subscriptions[directory], 
                    message
                )
            else:
                print(f"目录 '{directory}' 没有订阅者")
    
    async def notify_url_processing_progress(self, url: str, message: str):
        """通知URL处理进度"""
        notification = {
            "type": "url_processing_progress",
            "url": url,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"WebSocket通知: URL处理进度 - {url}: {message}")
        
        # 向所有活跃连接广播进度
        for client_id in list(self.active_connections.keys()):
            await self.send_message(client_id, notification)
    
    async def notify_directory_permission_changed(self, dir_path: str, permission_info: dict):
        """通知目录权限变更"""
        import os
        
        message = {
            "type": "directory_permission_changed",
            "directory_path": dir_path,
            "permission_info": permission_info,
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"WebSocket通知: 目录权限变更 {dir_path}: {permission_info}")
        
        # 通知目录订阅者
        if dir_path in self.directory_subscriptions:
            await self.broadcast_to_subscribers(
                self.directory_subscriptions[dir_path], 
                message
            )
        
        # 如果应用到子文件，也通知父目录的订阅者
        parent_dir = os.path.dirname(dir_path) or ""
        if parent_dir != dir_path and parent_dir in self.directory_subscriptions:
            await self.broadcast_to_subscribers(
                self.directory_subscriptions[parent_dir], 
                message
            )
    
    async def notify_directory_lock_changed(self, dir_path: str, lock_info: dict):
        """通知目录锁定状态变更"""
        import os
        
        message = {
            "type": "directory_lock_changed",
            "directory_path": dir_path,
            "lock_info": lock_info,
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"WebSocket通知: 目录锁定状态变更 {dir_path}: {lock_info}")
        
        # 通知目录订阅者
        if dir_path in self.directory_subscriptions:
            await self.broadcast_to_subscribers(
                self.directory_subscriptions[dir_path], 
                message
            )
        
        # 如果应用到子文件，也通知父目录的订阅者
        parent_dir = os.path.dirname(dir_path) or ""
        if parent_dir != dir_path and parent_dir in self.directory_subscriptions:
            await self.broadcast_to_subscribers(
                self.directory_subscriptions[parent_dir], 
                message
            )
    
    def get_connection_stats(self) -> dict:
        """获取连接统计信息"""
        return {
            "active_connections": len(self.active_connections),
            "file_subscriptions": len(self.file_subscriptions),
            "directory_subscriptions": len(self.directory_subscriptions),
            "clients": [
                {
                    "client_id": client_id,
                    "user_id": info.user_id,
                    "current_path": info.current_path,
                    "current_file": info.current_file,
                    "last_seen": info.last_seen.isoformat() if info.last_seen else None
                }
                for client_id, info in self.active_connections.items()
            ]
        }

# 全局WebSocket管理器实例
websocket_manager = WebSocketManager()