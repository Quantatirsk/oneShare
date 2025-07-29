"""
LLM 服务模块
提供 OpenAI API 调用功能
"""

import logging
from typing import List, Dict, Any, Optional
from openai import AsyncOpenAI
from pydantic import BaseModel
from config import LLM_API_KEY, LLM_BASE_URL, LLM_DEFAULT_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS

logger = logging.getLogger(__name__)

class Message(BaseModel):
    role: str
    content: str

class LLMRequest(BaseModel):
    messages: List[Message]
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None

class LLMResponse(BaseModel):
    success: bool
    data: Optional[str] = None
    error: Optional[str] = None


class LLMService:
    def __init__(self):
        self.client: Optional[AsyncOpenAI] = None
        self._initialize_client()
    
    def _initialize_client(self):
        """初始化 OpenAI 客户端"""
        api_key = LLM_API_KEY
        base_url = LLM_BASE_URL
        
        if not api_key:
            logger.warning("LLM_API_KEY 未设置，LLM 功能将不可用")
            return
        
        try:
            self.client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url
            )
            logger.info("OpenAI 客户端初始化成功")
        except Exception as e:
            logger.error(f"OpenAI 客户端初始化失败: {e}")
    
    def is_available(self) -> bool:
        """检查 LLM 服务是否可用"""
        return self.client is not None
    
    def get_config(self) -> Dict[str, Any]:
        """获取 LLM 配置信息"""
        return {
            "default_model": LLM_DEFAULT_MODEL,
            "temperature": LLM_TEMPERATURE,
            "max_tokens": LLM_MAX_TOKENS,
            "available": self.is_available()
        }
    
    async def get_models(self) -> List[Dict[str, Any]]:
        """获取可用的模型列表"""
        if not self.is_available():
            return []
        
        try:
            response = await self.client.models.list()
            return [model.dict() for model in response.data]
        except Exception as e:
            logger.error(f"获取模型列表失败: {e}")
            return []
    
    async def chat_completion(self, request: LLMRequest) -> LLMResponse:
        """聊天补全接口"""
        if not self.is_available():
            return LLMResponse(
                success=False,
                error="LLM 服务不可用，请检查 API Key 配置"
            )
        
        try:
            # 转换消息格式
            messages = [
                {"role": msg.role, "content": msg.content}
                for msg in request.messages
            ]
            
            response = await self.client.chat.completions.create(
                model=request.model or LLM_DEFAULT_MODEL,
                messages=messages,
                temperature=request.temperature or LLM_TEMPERATURE,
                max_tokens=request.max_tokens or LLM_MAX_TOKENS
            )
            
            content = response.choices[0].message.content or ""
            
            return LLMResponse(
                success=True,
                data=content
            )
            
        except Exception as e:
            logger.error(f"LLM API 调用失败: {e}")
            return LLMResponse(
                success=False,
                error=f"请求失败: {str(e)}"
            )
    
    async def chat_completion_stream(self, request: LLMRequest):
        """流式聊天补全接口"""
        import json
        if not self.is_available():
            yield f"data: {json.dumps({'error': 'LLM 服务不可用，请检查 API Key 配置'})}\n\n"
            return
        
        try:
            # 转换消息格式
            messages = [
                {"role": msg.role, "content": msg.content}
                for msg in request.messages
            ]
            
            stream = await self.client.chat.completions.create(
                model=request.model or LLM_DEFAULT_MODEL,
                messages=messages,
                temperature=request.temperature or LLM_TEMPERATURE,
                max_tokens=request.max_tokens or LLM_MAX_TOKENS,
                stream=True
            )
            
            async for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    # 使用 JSON 模块确保正确的格式
                    data = {"content": content}
                    yield f"data: {json.dumps(data)}\n\n"
            
            yield f"data: {json.dumps({'done': True})}\n\n"
            
        except Exception as e:
            logger.error(f"LLM 流式API 调用失败: {e}")
            yield f"data: {json.dumps({'error': f'请求失败: {str(e)}'})}\n\n"
    
# 全局 LLM 服务实例
llm_service = LLMService()