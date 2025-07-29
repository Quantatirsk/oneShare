from fastapi import HTTPException, Header

from config import AUTH_TOKEN

async def verify_token_optional(authorization: str = Header(None)):
    """可选的令牌验证，用于区分用户"""
    if authorization and authorization == AUTH_TOKEN:
        return authorization
    return None

async def verify_token_required(authorization: str = Header(None)):
    """必需的令牌验证"""
    if not authorization:
        raise HTTPException(status_code=401, detail="未提供授权令牌")
    
    if authorization != AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="无效的授权令牌")
    
    return authorization