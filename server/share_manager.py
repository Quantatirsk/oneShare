import os
import json
import uuid
from typing import Optional, Dict, Any
from datetime import datetime

# 分享信息存储文件
SHARES_FILE = "shares.json"

class ShareInfo:
    def __init__(self, share_id: str, filename: str, is_public: bool, created_at: str):
        self.share_id = share_id
        self.filename = filename
        self.is_public = is_public
        self.created_at = created_at
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "share_id": self.share_id,
            "filename": self.filename,
            "is_public": self.is_public,
            "created_at": self.created_at
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ShareInfo':
        return cls(
            share_id=data["share_id"],
            filename=data["filename"], 
            is_public=data["is_public"],
            created_at=data["created_at"]
        )

class ShareManager:
    def __init__(self, shares_file: str = SHARES_FILE):
        self.shares_file = shares_file
        self._ensure_shares_file()
    
    def _ensure_shares_file(self):
        """确保分享文件存在"""
        if not os.path.exists(self.shares_file):
            with open(self.shares_file, 'w', encoding='utf-8') as f:
                json.dump({}, f)
    
    def _load_shares(self) -> Dict[str, ShareInfo]:
        """加载所有分享信息"""
        try:
            with open(self.shares_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return {k: ShareInfo.from_dict(v) for k, v in data.items()}
        except (FileNotFoundError, json.JSONDecodeError):
            return {}
    
    def _save_shares(self, shares: Dict[str, ShareInfo]):
        """保存所有分享信息"""
        data = {k: v.to_dict() for k, v in shares.items()}
        with open(self.shares_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def generate_share_id(self) -> str:
        """生成UUID格式的分享ID"""
        return str(uuid.uuid4())
    
    def find_existing_share(self, filename: str, is_public: bool) -> Optional[ShareInfo]:
        """查找现有的分享链接"""
        shares = self._load_shares()
        for share_info in shares.values():
            if share_info.filename == filename and share_info.is_public == is_public:
                return share_info
        return None
    
    def get_or_create_share(self, filename: str, is_public: bool) -> ShareInfo:
        """获取或创建分享链接"""
        # 先查找现有的
        existing = self.find_existing_share(filename, is_public)
        if existing:
            return existing
        
        # 创建新的
        share_id = self.generate_share_id()
        share_info = ShareInfo(
            share_id=share_id,
            filename=filename,
            is_public=is_public,
            created_at=datetime.now().isoformat()
        )
        
        # 保存
        shares = self._load_shares()
        shares[share_id] = share_info
        self._save_shares(shares)
        
        return share_info
    
    def get_share_info(self, share_id: str) -> Optional[ShareInfo]:
        """根据分享ID获取分享信息"""
        shares = self._load_shares()
        return shares.get(share_id)
    
    def delete_share(self, share_id: str) -> bool:
        """删除分享链接"""
        shares = self._load_shares()
        if share_id in shares:
            del shares[share_id]
            self._save_shares(shares)
            return True
        return False
    
    def list_shares(self) -> Dict[str, ShareInfo]:
        """列出所有分享"""
        return self._load_shares()

# 全局分享管理器实例
share_manager = ShareManager()