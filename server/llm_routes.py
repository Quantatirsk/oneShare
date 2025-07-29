"""
LLM API 路由
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from llm_service import (
    llm_service, 
    LLMRequest, 
    LLMResponse
)

router = APIRouter(prefix="/api/llm", tags=["LLM"])

@router.get("/health")
async def health_check():
    """检查 LLM 服务健康状态"""
    return {
        "status": "healthy" if llm_service.is_available() else "unavailable",
        "service": "LLM"
    }

@router.get("/config")
async def get_llm_config():
    """获取 LLM 配置信息"""
    try:
        config = llm_service.get_config()
        return {"data": config}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models")
async def get_models():
    """获取可用的模型列表"""
    try:
        models = await llm_service.get_models()
        return {"data": models}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat", response_model=LLMResponse)
async def chat_completion(request: LLMRequest):
    """聊天补全接口"""
    try:
        response = await llm_service.chat_completion(request)
        if not response.success:
            raise HTTPException(status_code=400, detail=response.error)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat/stream")
async def chat_completion_stream(request: LLMRequest):
    """流式聊天补全接口"""
    try:
        return StreamingResponse(
            llm_service.chat_completion_stream(request),
            media_type="text/plain",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "X-Accel-Buffering": "no",  # 禁用 nginx 缓冲
                "Transfer-Encoding": "chunked",
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

