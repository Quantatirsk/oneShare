"""
模板管理API路由
"""

import os
import json
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends, Body
from pydantic import BaseModel, Field

from auth import verify_token_required, verify_token_optional
from config import FILE_STORAGE_PATH

# 模板数据模型
class Template(BaseModel):
    id: str
    codeLang: str = Field(..., description="代码语言")
    title: str = Field(..., description="模板标题")
    description: str = Field(..., description="模板描述")
    category: str = Field(..., description="模板分类")
    tags: List[str] = Field(default_factory=list, description="标签列表")
    code: str = Field(..., description="模板代码")
    preview: Optional[str] = Field(None, description="预览图片")
    difficulty: str = Field(..., description="难度等级")
    # 用户模板特有字段
    isUserTemplate: bool = Field(False, description="是否为用户模板")
    creator: Optional[str] = Field(None, description="创建者")
    createdAt: Optional[datetime] = Field(None, description="创建时间")
    updatedAt: Optional[datetime] = Field(None, description="更新时间")

class TemplateCreateRequest(BaseModel):
    codeLang: str
    title: str
    description: str
    category: str
    tags: List[str] = []
    code: str
    preview: Optional[str] = None
    difficulty: str = "beginner"

class TemplateUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    code: Optional[str] = None
    preview: Optional[str] = None
    difficulty: Optional[str] = None

# 用户模板存储路径
USER_TEMPLATES_DIR = os.path.join(FILE_STORAGE_PATH, "user_templates")
USER_TEMPLATES_FILE = os.path.join(USER_TEMPLATES_DIR, "templates.json")

# 确保目录存在
os.makedirs(USER_TEMPLATES_DIR, exist_ok=True)

def get_user_templates() -> List[Dict[str, Any]]:
    """获取用户模板列表"""
    try:
        if os.path.exists(USER_TEMPLATES_FILE):
            with open(USER_TEMPLATES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('templates', [])
        return []
    except Exception as e:
        print(f"Error reading user templates: {e}")
        return []

def save_user_templates(templates: List[Dict[str, Any]]) -> bool:
    """保存用户模板列表"""
    try:
        data = {
            "version": "1.0",
            "lastUpdated": datetime.now().isoformat(),
            "templates": templates
        }
        with open(USER_TEMPLATES_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error saving user templates: {e}")
        return False

def get_default_templates() -> List[Dict[str, Any]]:
    """获取默认模板列表"""
    try:
        # 使用后端自己的模板文件
        templates_file = os.path.join(os.path.dirname(__file__), "templates.json")
        if os.path.exists(templates_file):
            with open(templates_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                templates = data.get('templates', [])
                # 标记为系统模板
                for template in templates:
                    template['isUserTemplate'] = False
                    template['creator'] = 'system'
                return templates
        return []
    except Exception as e:
        print(f"Error reading default templates: {e}")
        return []

def register_template_routes(app: FastAPI):
    """注册模板管理相关路由"""
    
    @app.get("/api/templates")
    async def get_templates(token: Optional[str] = Depends(verify_token_optional)):
        """获取所有模板（系统模板 + 用户模板）"""
        try:
            # 获取默认模板
            default_templates = get_default_templates()
            
            # 获取用户模板
            user_templates = []
            if token:  # 只有认证用户才能看到用户模板
                user_templates = get_user_templates()
                # 标记为用户模板
                for template in user_templates:
                    template['isUserTemplate'] = True
            
            # 合并模板列表
            all_templates = default_templates + user_templates
            
            return {
                "success": True,
                "data": {
                    "templates": all_templates,
                    "systemTemplatesCount": len(default_templates),
                    "userTemplatesCount": len(user_templates)
                }
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"获取模板失败: {str(e)}")
    
    @app.post("/api/templates")
    async def create_template(
        template_data: TemplateCreateRequest,
        token: str = Depends(verify_token_required)
    ):
        """创建新的用户模板"""
        try:
            user_templates = get_user_templates()
            
            # 创建新模板
            new_template = {
                "id": str(uuid.uuid4()),
                "codeLang": template_data.codeLang,
                "title": template_data.title,
                "description": template_data.description,
                "category": template_data.category,
                "tags": template_data.tags,
                "code": template_data.code,
                "preview": template_data.preview,
                "difficulty": template_data.difficulty,
                "isUserTemplate": True,
                "creator": "user",  # 可以根据实际需求修改为从token解析用户ID
                "createdAt": datetime.now().isoformat(),
                "updatedAt": datetime.now().isoformat()
            }
            
            user_templates.append(new_template)
            
            if save_user_templates(user_templates):
                return {
                    "success": True,
                    "data": new_template,
                    "message": "模板创建成功"
                }
            else:
                raise HTTPException(status_code=500, detail="保存模板失败")
                
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"创建模板失败: {str(e)}")
    
    @app.put("/api/templates/{template_id}")
    async def update_template(
        template_id: str,
        template_data: TemplateUpdateRequest,
        token: str = Depends(verify_token_required)
    ):
        """更新用户模板"""
        try:
            user_templates = get_user_templates()
            
            # 查找模板
            template_index = None
            for i, template in enumerate(user_templates):
                if template.get('id') == template_id:
                    template_index = i
                    break
            
            if template_index is None:
                raise HTTPException(status_code=404, detail="模板不存在")
            
            # 更新模板
            template = user_templates[template_index]
            if template_data.title is not None:
                template['title'] = template_data.title
            if template_data.description is not None:
                template['description'] = template_data.description
            if template_data.category is not None:
                template['category'] = template_data.category
            if template_data.tags is not None:
                template['tags'] = template_data.tags
            if template_data.code is not None:
                template['code'] = template_data.code
            if template_data.preview is not None:
                template['preview'] = template_data.preview
            if template_data.difficulty is not None:
                template['difficulty'] = template_data.difficulty
            
            template['updatedAt'] = datetime.now().isoformat()
            
            if save_user_templates(user_templates):
                return {
                    "success": True,
                    "data": template,
                    "message": "模板更新成功"
                }
            else:
                raise HTTPException(status_code=500, detail="保存模板失败")
                
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"更新模板失败: {str(e)}")
    
    @app.delete("/api/templates/{template_id}")
    async def delete_template(
        template_id: str,
        token: str = Depends(verify_token_required)
    ):
        """删除用户模板"""
        try:
            user_templates = get_user_templates()
            
            # 查找并删除模板
            template_index = None
            for i, template in enumerate(user_templates):
                if template.get('id') == template_id:
                    template_index = i
                    break
            
            if template_index is None:
                raise HTTPException(status_code=404, detail="模板不存在")
            
            deleted_template = user_templates.pop(template_index)
            
            if save_user_templates(user_templates):
                return {
                    "success": True,
                    "data": deleted_template,
                    "message": "模板删除成功"
                }
            else:
                raise HTTPException(status_code=500, detail="保存模板失败")
                
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"删除模板失败: {str(e)}")
    
    @app.get("/api/templates/user")
    async def get_user_templates_only(token: str = Depends(verify_token_required)):
        """获取当前用户的模板"""
        try:
            user_templates = get_user_templates()
            
            # 标记为用户模板
            for template in user_templates:
                template['isUserTemplate'] = True
            
            return {
                "success": True,
                "data": {
                    "templates": user_templates,
                    "count": len(user_templates)
                }
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"获取用户模板失败: {str(e)}")