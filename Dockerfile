# 构建阶段 - 前端依赖
FROM node:22-slim AS frontend-deps
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci

# 构建阶段 - 前端构建
FROM frontend-deps AS frontend-builder
COPY client/ .
COPY shared/ /shared/
RUN npm run build
RUN ls -la dist/

FROM node:22-slim AS agent-runtime-deps
WORKDIR /app
COPY agent-runtime/package.json agent-runtime/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim AS agent-runtime-builder
WORKDIR /app
COPY agent-runtime/package.json agent-runtime/package-lock.json ./
RUN npm ci
COPY agent-runtime/ .
# The bundled runtime imports the repository-level conversation contract.
COPY shared/ /shared/
RUN npm run build

# 构建阶段 - 后端依赖
FROM ghcr.io/astral-sh/uv:0.9.22 AS uv
FROM python:3.11-slim AS backend-deps
WORKDIR /app
COPY --from=uv /uv /uvx /bin/
# 安装构建工具
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*
COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# 构建阶段 - 后端代码
FROM backend-deps AS backend-builder
COPY server/ .

# 最终阶段 - 基于 debian slim
FROM python:3.11-slim
WORKDIR /app

# 安装 Node.js 和运行时依赖
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

# 复制 Python 虚拟环境
COPY --from=backend-deps /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:${PATH}"

# 复制后端代码
COPY --from=backend-builder /app /app

COPY --from=agent-runtime-deps /app/node_modules /app/agent-runtime/node_modules
COPY --from=agent-runtime-builder /app/package.json /app/agent-runtime/package.json
COPY --from=agent-runtime-builder /app/dist /app/agent-runtime/dist

# 安装 Node.js 编译器依赖
RUN cd /app/compile_service/node_compiler \
    && npm ci --omit=dev

# 验证 Node.js 和编译器依赖是否正确安装
RUN node --version && npm --version \
    && cd /app/compile_service/node_compiler \
    && node -e "console.log('Node.js compiler dependencies installed successfully')" \
    && ls -la node_modules/esbuild

# 复制前端构建产物
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# 复制配置文件
COPY nginx.conf /etc/nginx/sites-available/default
RUN ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
COPY supervisord.conf /etc/supervisord.conf

# 创建必要的目录和设置最宽松权限
RUN mkdir -p /app/storage /var/log/supervisor \
    && chmod -R 777 /app \
    && chmod -R 777 /var/log/supervisor \
    && chmod -R 777 /usr/share/nginx/html

# 测试 nginx 配置
RUN nginx -t

# 添加健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health && curl -f http://127.0.0.1:8001/healthz || exit 1

EXPOSE 80

# 使用 supervisor 管理进程
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
