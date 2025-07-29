import asyncio
import json
import logging
import base64
import binascii
import urllib.parse
from typing import Dict, Set, Optional
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime

logger = logging.getLogger(__name__)

class YjsWebSocketManager:
    """Y.js WebSocket message handler for collaborative editing"""
    
    def __init__(self):
        # Room-based connections: room_name -> set of client websockets
        self.rooms: Dict[str, Set[WebSocket]] = {}
        # Client to room mapping: websocket -> room_name
        self.client_rooms: Dict[WebSocket, str] = {}
        # Authentication mapping: websocket -> auth_info
        self.client_auth: Dict[WebSocket, dict] = {}
    
    def _decode_room_name(self, room_name: str) -> str:
        """Decode Base64 encoded room name to get original file path"""
        try:
            # Try to decode from Base64 (new format: Base64(encodeURIComponent(filePath)))
            try:
                decoded_bytes = base64.b64decode(room_name)
                uri_encoded_path = decoded_bytes.decode('utf-8')
                decoded_path = urllib.parse.unquote(uri_encoded_path)
                return f"file:{decoded_path}"
            except (binascii.Error, UnicodeDecodeError):
                # If Base64 decoding fails, check if it's the old format with 'file:' prefix
                if room_name.startswith('file:'):
                    # Extract the encoded part after 'file:'
                    encoded_part = room_name[5:]  # Remove 'file:' prefix
                    
                    # Try to decode from Base64 (old format)
                    try:
                        decoded_bytes = base64.b64decode(encoded_part)
                        uri_encoded_path = decoded_bytes.decode('utf-8')
                        decoded_path = urllib.parse.unquote(uri_encoded_path)
                        return f"file:{decoded_path}"
                    except (binascii.Error, UnicodeDecodeError):
                        # If Base64 decoding fails, try URL decoding (fallback for old format)
                        try:
                            decoded_path = urllib.parse.unquote(encoded_part)
                            return f"file:{decoded_path}"
                        except Exception:
                            # If all decoding fails, return original
                            return room_name
                else:
                    # If not old format, return original
                    return room_name
        except Exception as e:
            logger.warning(f"Failed to decode room name {room_name}: {e}")
            return room_name
        
    async def connect(self, websocket: WebSocket, room_name: str, auth_token: Optional[str] = None):
        """Connect client to Y.js room"""
        # Decode room name if it's Base64 encoded file path
        decoded_room_name = self._decode_room_name(room_name)
        logger.info(f"Y.js WebSocket connection attempt for room: {room_name} (decoded: {decoded_room_name}), auth: {auth_token}")
        await websocket.accept()
        
        # Store auth info
        self.client_auth[websocket] = {
            'auth_token': auth_token,
            'connected_at': datetime.now()
        }
        
        # Add to room
        if room_name not in self.rooms:
            self.rooms[room_name] = set()
        
        self.rooms[room_name].add(websocket)
        self.client_rooms[websocket] = room_name
        
        logger.info(f"Y.js client successfully connected to room: {room_name}")
        
        # Log room stats
        self._log_room_stats(room_name)
    
    def disconnect(self, websocket: WebSocket):
        """Disconnect client from Y.js room"""
        if websocket in self.client_rooms:
            room_name = self.client_rooms[websocket]
            
            # Remove from room
            if room_name in self.rooms:
                self.rooms[room_name].discard(websocket)
                if not self.rooms[room_name]:
                    # Room is empty, clean up
                    del self.rooms[room_name]
                    logger.info(f"Y.js room {room_name} is now empty and removed")
                else:
                    self._log_room_stats(room_name)
            
            # Clean up mappings
            del self.client_rooms[websocket]
            
            if websocket in self.client_auth:
                del self.client_auth[websocket]
                
            logger.info(f"Y.js client disconnected from room: {room_name}")
    
    async def handle_message(self, websocket: WebSocket, message: bytes):
        """Handle Y.js protocol message and broadcast to room"""
        if websocket not in self.client_rooms:
            logger.warning("Received message from unconnected Y.js client")
            return
            
        room_name = self.client_rooms[websocket]
        
        # Get all other clients in the same room
        room_clients = self.rooms.get(room_name, set())
        other_clients = room_clients - {websocket}
        
        # Broadcast the Y.js message to all other clients in the room
        if other_clients:
            await self._broadcast_to_clients(other_clients, message)
            logger.debug(f"Broadcasted Y.js message in room {room_name} to {len(other_clients)} clients")
    
    async def _broadcast_to_clients(self, clients: Set[WebSocket], message: bytes):
        """Broadcast binary message to multiple clients"""
        if not clients:
            return
            
        disconnected_clients = []
        
        for client in clients:
            try:
                await client.send_bytes(message)
            except Exception as e:
                logger.error(f"Failed to send Y.js message to client: {e}")
                disconnected_clients.append(client)
        
        # Clean up disconnected clients
        for client in disconnected_clients:
            self.disconnect(client)
    
    def _log_room_stats(self, room_name: str):
        """Log current room statistics"""
        if room_name in self.rooms:
            client_count = len(self.rooms[room_name])
            logger.info(f"Y.js room {room_name} now has {client_count} clients")
    
    def get_room_stats(self) -> dict:
        """Get statistics about all rooms"""
        return {
            'total_rooms': len(self.rooms),
            'total_clients': sum(len(clients) for clients in self.rooms.values()),
            'rooms': {
                room_name: {
                    'client_count': len(clients),
                    'clients': [
                        {
                            'auth_token': self.client_auth.get(client, {}).get('auth_token', 'unknown'),
                            'connected_at': self.client_auth.get(client, {}).get('connected_at', datetime.now()).isoformat()
                        }
                        for client in clients
                    ]
                }
                for room_name, clients in self.rooms.items()
            }
        }
    
    def get_room_client_count(self, room_name: str) -> int:
        """Get number of clients in a specific room"""
        return len(self.rooms.get(room_name, set()))
    
    def is_room_active(self, room_name: str) -> bool:
        """Check if a room has active clients"""
        return room_name in self.rooms and len(self.rooms[room_name]) > 0

# Global Y.js WebSocket manager instance
yjs_websocket_manager = YjsWebSocketManager()

async def handle_yjs_websocket(websocket: WebSocket, room_name: str, auth_token: Optional[str] = None):
    """Main handler for Y.js WebSocket connections"""
    try:
        # Connect to room
        await yjs_websocket_manager.connect(websocket, room_name, auth_token)
        
        while True:
            # Receive Y.js protocol message (binary)
            message = await websocket.receive_bytes()
            
            # Handle and broadcast the message
            await yjs_websocket_manager.handle_message(websocket, message)
            
    except WebSocketDisconnect:
        logger.info("Y.js WebSocket client disconnected normally")
    except Exception as e:
        logger.error(f"Y.js WebSocket error: {e}")
    finally:
        # Clean up connection
        yjs_websocket_manager.disconnect(websocket)