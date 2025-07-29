#!/usr/bin/env python3
"""
文件服务器启动脚本

使用方法:
    python server.py

或者使用uvicorn直接启动:
    uvicorn fileserver.main:app --host 0.0.0.0 --port 8000
"""

import uvicorn
from fileserver.main import app
from fileserver.config import HOST, PORT

if __name__ == "__main__":
    print(f"启动文件服务器...")
    print(f"地址: http://{HOST}:{PORT}")
    print(f"健康检查: http://{HOST}:{PORT}/health")
    
    uvicorn.run(
        app, 
        host=HOST, 
        port=PORT,
        # 生产环境配置
        # access_log=True,
        # reload=False
    )