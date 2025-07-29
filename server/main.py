"""FastAPI file server with port management and compilation services."""

import os
import signal
import subprocess
import time
import socket

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import HOST, PORT
from routes import register_routes
import llm_routes
from compile_service import compile_router
from template_routes import register_template_routes

def is_port_in_use(port):
    """检查端口是否被占用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def kill_process_on_port(port):
    """杀死占用指定端口的进程并等待端口释放"""
    try:
        # 杀死占用端口的进程
        result = subprocess.run(f'lsof -ti:{port}', shell=True, capture_output=True, text=True, check=False)
        if result.stdout:
            pids = result.stdout.strip().split('\n')
            for pid in pids:
                if pid:
                    try:
                        # 先尝试优雅关闭
                        os.kill(int(pid), signal.SIGTERM)
                        print(f"发送SIGTERM信号给进程 PID: {pid}")
                        time.sleep(2)
                        # 检查进程是否还存在，如果存在则强制杀死
                        try:
                            os.kill(int(pid), 0)  # 检查进程是否存在
                            os.kill(int(pid), signal.SIGKILL)
                            print(f"强制杀死进程 PID: {pid}")
                        except ProcessLookupError:
                            print(f"进程 PID {pid} 已正常退出")
                    except (ProcessLookupError, PermissionError) as e:
                        print(f"处理进程 PID {pid} 时出错: {e}")
        
        # 等待端口释放
        max_wait = 10  # 最多等待10秒
        wait_count = 0
        while is_port_in_use(port) and wait_count < max_wait:
            print(f"等待端口 {port} 释放... ({wait_count + 1}/{max_wait})")
            time.sleep(1)
            wait_count += 1
        if is_port_in_use(port):
            print(f"警告: 端口 {port} 仍被占用，尝试强制清理...")
            # 强制清理所有相关进程
            os.system(f"fuser -k {port}/tcp 2>/dev/null")
            time.sleep(2)
        else:
            print(f"端口 {port} 已成功释放")
    except (OSError, subprocess.SubprocessError) as e:
        print(f"清理端口 {port} 时出错: {e}")

# from fastapi.staticfiles import StaticFiles  # 不再需要

# 创建FastAPI应用
app = FastAPI(title="文件服务API", version="1.0.0")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有源，生产环境建议设置具体的源
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有方法
    allow_headers=["*"],  # 允许所有请求头
)

# 健康检查端点 - 必须在通配符路由之前注册
@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "healthy", 
        "service": "文件服务API",
        "version": "2.0.0",
        "features": [
            "direct_file_access",
            "streaming_download",
            "resume_support",
            "token_auth",
            "inline_display"
        ]
    }

# 注册路由
register_routes(app)
app.include_router(llm_routes.router)

# 注册编译服务路由
app.include_router(compile_router)

# 注册模板管理路由
register_template_routes(app)

# 启动应用
if __name__ == "__main__":
    # 在启动服务前杀死占用8000端口的进程
    kill_process_on_port(8000)

    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
