# OneShare - 一站式创意分享平台

一个功能完整的一站式创意分享平台，集成文件管理、应用创建、实时协作、AI 辅助开发等多项核心功能。支持 PWA 离线安装，提供完整的 Web 界面和 RESTful API。

## ✨ 主要特性

### 🔥 核心功能
- **智能文件管理** - 统一存储系统，支持元数据管理和权限控制
- **实时协作编辑** - 基于 Y.js 的多人协作编辑，Monaco 编辑器集成
- **AI 驱动应用创建** - 对话式代码生成，智能模板系统，自动错误修复
- **TSX/JSX 编译服务** - Node.js + esbuild 实时编译，CDN 依赖解析
- **应用画廊系统** - 应用展示、分享和嵌入功能
- **PWA 支持** - 离线安装，移动端优化，桌面应用体验

### 🎯 文件管理特性
- **多模式上传** - 拖拽上传、粘贴上传、分片上传 (2MB 分片)
- **智能下载系统** - URL 内容下载、多媒体下载 (Cobalt API)、批量下载
- **实时同步** - WebSocket 驱动的文件系统事件推送
- **权限体系** - 文件/目录级权限控制，继承机制
- **标签系统** - 文件标记、分类和搜索功能
- **版本管理** - 自动保存和版本历史

### 🤖 AI 集成特性
- **智能代码生成** - 自然语言转代码，流式输出
- **需求分析** - AI 驱动的需求理解和功能建议
- **错误诊断** - AST 分析和自动修复建议
- **内容处理** - HTML 转 Markdown，智能文件命名
- **多模型支持** - OpenAI 兼容 API，模型切换

### 🛡️ 安全与性能
- **多层安全** - Token 认证、路径检查、权限控制、文件锁定
- **缓存优化** - 编译缓存、文件 ETag、浏览器缓存策略
- **异步架构** - 全异步 I/O，分片传输，断点续传
- **容器化部署** - Docker + nginx + supervisord 完整方案

## 🏗️ 技术架构

### 后端技术栈
- **应用框架**: FastAPI + Uvicorn (异步Python web框架)
- **数据库**: SQLite3 + aiosqlite (文件元数据管理)
- **实时通信**: WebSocket + Y.js (协作编辑和文件系统事件)
- **编译服务**: Node.js + esbuild (TSX/JSX实时编译)
- **AI集成**: OpenAI兼容API (流式响应支持)
- **文件处理**: aiofiles (异步文件I/O)
- **HTTP客户端**: aiohttp (URL下载和API调用)

### 前端技术栈
- **核心框架**: React 18 + TypeScript + Vite
- **状态管理**: Zustand (全局状态 + 持久化)
- **UI组件**: Radix UI + Tailwind CSS + shadcn/ui
- **编辑器**: Monaco Editor + y-monaco (协作编辑)
- **路由**: React Router v7 (文件系统路由)
- **文档渲染**: React Markdown + rehype/remark 插件
- **动画**: Framer Motion + Lottie React
- **PWA**: Service Worker + Web App Manifest

### 协作编辑架构
- **CRDT算法**: Y.js 分布式协作
- **实时同步**: WebSocket + y-websocket
- **编辑器集成**: y-monaco (Monaco编辑器绑定)
- **冲突解决**: 自动CRDTs冲突解决
- **用户管理**: 房间状态和连接追踪

### 编译服务架构
- **编译引擎**: esbuild + 自定义插件
- **依赖解析**: CDN自动获取 (jsdelivr/unpkg)
- **缓存系统**: 多层缓存 (内存/磁盘/Redis可选)
- **错误处理**: AST分析 + 智能错误修复
- **沙箱环境**: 安全的代码执行环境

## 🚀 快速开始

### 环境要求
- **Python**: 3.8+ (后端服务)
- **Node.js**: 18+ (编译服务)
- **pnpm**: 8+ (前端包管理)
- **Docker**: 可选 (容器化部署)

### 1. 克隆项目
```bash
git clone <repository-url>
cd file-server
```

### 2. 配置环境变量
```bash
# 复制环境配置模板
cp env.example .env

# 编辑配置文件
nano .env
```

必要配置项：
```env
AUTH_TOKEN=your-secret-token         # 认证令牌
LLM_API_KEY=your-openai-api-key     # AI功能API密钥
LLM_BASE_URL=https://api.openai.com/v1  # AI API端点
```

### 3. 安装依赖
```bash
# 后端Python依赖
cd server && pip install -r requirements.txt

# 前端依赖和编译服务依赖
cd ../client && pnpm install
cd ../server/compile_service/node_compiler && npm install
```

### 4. 启动服务

#### 开发模式
```bash
# 启动后端 (包含编译服务)
cd server && python main.py

# 启动前端开发服务器
cd client && pnpm run dev
```

#### 生产部署
```bash
# 构建前端
cd client && pnpm run build

# Docker 一键部署
docker-compose up -d
```

### 5. 访问应用
- **主应用**: http://localhost:8000
- **应用创建**: http://localhost:8000/create
- **应用画廊**: http://localhost:8000/app

> 💡 首次启动会自动初始化 SQLite 数据库和存储目录

## ⚙️ 配置说明

### 环境变量配置
在项目根目录 `.env` 文件中配置：

```env
# 服务器配置
VITE_FILE_SERVER_HOST=0.0.0.0
VITE_FILE_SERVER_PORT=8000
VITE_API_ENDPOINT=http://localhost:8000

# 认证配置
AUTH_TOKEN=your-secret-token

# 存储配置
FILE_STORAGE_PATH=./server/storage        # 统一存储目录
PUBLIC_STORAGE_PATH=./server/storage      # 公共文件路径
USER_STORAGE_PATH=./server/storage        # 用户文件路径

# 文件处理限制
MAX_FILE_SIZE_MB=5000                     # 最大文件大小
UPLOAD_CHUNK_SIZE_MB=2                    # 上传分片大小
DOWNLOAD_CHUNK_SIZE_MB=8                  # 下载分片大小

# AI 服务配置
LLM_API_KEY=your-openai-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini                     # 默认AI模型
LLM_MAX_TOKENS=28000                      # 最大令牌数

# 编译服务配置
COMPILE_CACHE_SIZE=100                    # 编译缓存大小(MB)
COMPILE_TIMEOUT=30                        # 编译超时时间(秒)

# 数据库配置
SQLITE_DB_PATH=./server/storage/metadata.db  # SQLite数据库路径
```

### 前端应用配置
前端配置存储在浏览器localStorage中，可通过设置对话框配置：

- **服务器连接**: API端点、认证令牌
- **编辑器设置**: 主题、字体大小、自动保存
- **界面偏好**: 语言、视图模式、快捷键
- **协作设置**: 用户名、头像、房间偏好

### Docker 部署配置
使用 `docker-compose.yml` 进行容器化部署：

```yaml
# 自定义端口映射
ports:
  - "8090:80"  # 外部端口:内部端口

# 数据持久化
volumes:
  - ./server/storage:/app/storage
  - ./server/shares.json:/app/shares.json
```

## 📡 API 文档

### 文件管理 API

#### 核心文件操作
- `POST /api/files/` - 统一文件操作 (上传、列表、删除、重命名)
- `GET /api/files/{file_path}` - 文件下载
- `PUT /api/files/{file_path}` - 文件上传/更新
- `PATCH /api/files/{file_path}` - 文件重命名/移动
- `DELETE /api/files/{file_path}` - 文件删除

#### 文件元数据
- `GET /api/metadata/{file_path}` - 获取文件元数据
- `PUT /api/metadata/{file_path}` - 更新文件元数据
- `POST /api/metadata/batch` - 批量元数据操作

#### URL 下载服务
- `POST /api/url/download` - 通用文件下载
- `POST /api/cobalt/download` - 多媒体下载 (YouTube、Bilibili等)
- `POST /api/url/process` - HTML内容转Markdown

### 应用创建与编译

#### 编译服务
- `POST /api/compile` - TSX/JSX代码编译
- `GET /api/compile/cache/{hash}` - 获取编译缓存
- `DELETE /api/compile/cache` - 清理编译缓存

#### AI 代码生成
- `POST /api/llm/generate` - 代码生成
- `POST /api/llm/analyze` - 需求分析
- `POST /api/llm/fix` - 错误修复建议
- `POST /api/llm/stream` - 流式代码生成

### 协作与分享

#### 文件分享
- `POST /api/share` - 创建分享链接
- `GET /api/share/{share_id}` - 获取分享信息
- `GET /s/{share_id}` - 访问分享内容

#### 实时协作
- `WebSocket /api/ws/{client_id}` - 文件系统事件通知
- `WebSocket /api/yjs/{room_name}` - Y.js协作编辑
- `GET /api/collaboration/rooms` - 活动协作房间列表

### 应用画廊

#### 应用管理
- `GET /api/app/list` - 应用列表 (支持分页和筛选)
- `POST /api/app/create` - 创建新应用
- `GET /api/app/{app_id}` - 获取应用详情
- `PUT /api/app/{app_id}` - 更新应用
- `DELETE /api/app/{app_id}` - 删除应用

### 使用示例

#### 文件上传
```bash
# 单文件上传
curl -X PUT \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@/path/to/file.txt" \
  http://localhost:8000/api/files/example.txt

# 表单上传 (支持元数据)
curl -X POST \
  -H "Authorization: Bearer your-secret-token" \
  -F "action=upload" \
  -F "file=@/path/to/file.txt" \
  -F "tags=document,important" \
  -F "description=示例文档" \
  http://localhost:8000/api/files/
```

#### 文件列表和元数据
```bash
# 获取文件列表
curl -H "Authorization: Bearer your-secret-token" \
  "http://localhost:8000/api/files/?action=list&path=/"

# 获取文件元数据
curl -H "Authorization: Bearer your-secret-token" \
  http://localhost:8000/api/metadata/example.txt
```

#### AI 代码生成
```bash
# 生成React组件
curl -X POST \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "创建一个计算器组件", "type": "tsx"}' \
  http://localhost:8000/api/llm/generate
```

#### 编译TSX代码
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"code": "export default () => <div>Hello</div>", "filename": "App.tsx"}' \
  http://localhost:8000/api/compile
```

## 🏢 项目结构

```
file-server/
├── server/                      # FastAPI 后端服务
│   ├── main.py                 # 应用入口 + 端口管理
│   ├── routes.py               # 文件管理路由
│   ├── llm_routes.py           # AI服务路由
│   ├── file_handlers.py        # 文件操作核心逻辑
│   ├── websocket.py            # WebSocket文件系统事件
│   ├── yjs_websocket.py        # Y.js协作编辑WebSocket
│   ├── auth.py                 # 认证与权限管理
│   ├── config.py               # 环境配置管理
│   ├── models.py               # 数据模型定义
│   ├── metadata_manager.py     # 文件元数据管理
│   ├── share_manager.py        # 分享链接管理
│   ├── cobalt_service.py       # 多媒体下载服务
│   ├── compile_service/        # TSX/JSX编译服务
│   │   ├── tsx_compiler.py     # Python编译接口
│   │   ├── compile_routes.py   # 编译API路由
│   │   ├── cache_manager.py    # 编译缓存管理
│   │   └── node_compiler/      # Node.js编译器
│   │       ├── compile.js      # esbuild编译核心
│   │       ├── ast/           # AST分析和修复
│   │       └── plugins/       # 自定义esbuild插件
│   ├── storage/               # 统一文件存储
│   │   └── metadata.db        # SQLite元数据数据库
│   └── requirements.txt       # Python依赖
├── client/                     # React前端应用
│   ├── src/
│   │   ├── pages/             # 页面组件
│   │   │   ├── CreatePage.tsx      # AI代码生成页面
│   │   │   ├── AppGalleryPage.tsx  # 应用画廊
│   │   │   ├── ShareRouter.tsx     # 分享页面路由
│   │   │   └── Homepage.tsx        # 主页
│   │   ├── components/        # UI组件库
│   │   │   ├── createpage/         # 代码生成组件
│   │   │   ├── ui/                 # shadcn/ui组件
│   │   │   ├── MonacoEditor.tsx    # 代码编辑器
│   │   │   ├── CollaborativeMonacoEditor.tsx  # 协作编辑器
│   │   │   └── MarkdownViewer.tsx  # Markdown渲染器
│   │   ├── stores/            # Zustand状态管理
│   │   │   └── appStore.ts         # 全局应用状态
│   │   ├── hooks/             # 自定义React Hooks
│   │   │   ├── useFileService.ts   # 文件服务Hook
│   │   │   ├── useCreatePageState.ts # 代码生成状态
│   │   │   └── useConversationManager.ts # 对话管理
│   │   ├── lib/               # 工具库
│   │   │   ├── api.ts              # API客户端
│   │   │   ├── websocket.ts        # WebSocket管理
│   │   │   ├── yjs-provider.ts     # Y.js协作提供者
│   │   │   └── agents/             # AI代理
│   │   └── types/             # TypeScript类型定义
│   ├── public/                # 静态资源
│   │   ├── manifest.json           # PWA清单
│   │   ├── sw.js                   # Service Worker
│   │   ├── templates/              # 代码模板
│   │   └── lottie/                 # 动画资源
│   ├── package.json           # 前端依赖
│   └── vite.config.ts         # Vite构建配置
├── notes/                     # 设计文档和笔记
├── docker-compose.yml         # Docker编排配置
├── nginx.conf                # Nginx反向代理配置
├── supervisord.conf          # 进程管理配置
├── env.example               # 环境变量模板
└── README.md                 # 项目文档
```

## 🎨 功能界面

### 📁 文件管理界面
- **统一存储视图** - 所有文件统一管理，支持元数据展示
- **多视图模式** - 列表视图、网格视图、详情视图
- **实时同步** - WebSocket 驱动的实时文件系统更新
- **智能搜索** - 基于文件名、标签、内容的全文搜索
- **批量操作** - 多选、批量下载、批量权限设置
- **权限可视化** - 直观的权限状态图标和继承关系

### 🤖 AI 代码创建界面 (`/create`)
- **对话式交互** - 自然语言描述需求，AI 理解并生成代码
- **实时预览** - 代码生成后立即编译和预览
- **模板系统** - 预置应用模板，快速开始
- **协作编辑** - 多人实时协作编写代码
- **智能修复** - 自动检测和修复代码错误
- **流式输出** - 代码逐行生成，实时反馈

### 🏪 应用画廊界面 (`/app`)
- **应用展示** - 卡片式应用展示，支持预览和筛选
- **分类浏览** - 按文件类型（HTML、TSX、JSX）分类
- **搜索过滤** - 按关键词、标签、作者搜索
- **一键分享** - 生成永久分享链接
- **嵌入支持** - 应用可嵌入到第三方页面

### 📱 移动端适配
- **PWA 支持** - 可安装到桌面，离线使用
- **响应式设计** - 完美适配手机、平板、桌面
- **触摸优化** - 手势操作、拖拽上传
- **性能优化** - 懒加载、虚拟滚动、图片压缩

### 🔄 实时协作界面
- **用户状态** - 实时显示在线用户和编辑状态
- **光标同步** - 多用户光标位置实时同步
- **冲突处理** - 智能合并编辑冲突
- **版本历史** - 自动保存编辑历史，支持版本回滚

## 🔧 开发指南

### 本地开发环境搭建
```bash
# 1. 后端开发
cd server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py

# 2. 前端开发
cd client
pnpm install
pnpm run dev

# 3. 编译服务开发
cd server/compile_service/node_compiler
npm install
# 编译服务会自动启动
```

### 开发工具配置
```bash
# 代码格式化
cd client && pnpm run lint
cd server && black . && isort .

# 类型检查
cd client && pnpm run type-check
cd server && mypy .

# 测试运行
cd server && python run_tests.py
```

### 代码架构规范
- **后端**: FastAPI + 异步编程模式
- **前端**: 函数式组件 + Hooks + TypeScript 严格模式
- **状态管理**: Zustand + 单向数据流
- **API 设计**: RESTful + WebSocket 双通道
- **数据库**: SQLite + 异步 ORM 模式
- **缓存策略**: 多层缓存 + ETag + 浏览器缓存

### 新功能开发流程
1. **需求分析**: 使用 AI 助手分析功能需求
2. **API 设计**: 定义 API 接口和数据模型
3. **后端实现**: 实现核心逻辑和数据处理
4. **前端开发**: 实现用户界面和交互
5. **集成测试**: 端到端功能测试
6. **部署上线**: Docker 容器化部署

## 🚀 生产部署

### Docker 容器化部署
```bash
# 1. 构建镜像
docker build -t file-server:latest .

# 2. 使用 Docker Compose 部署
docker-compose up -d

# 3. 查看服务状态
docker-compose ps
docker-compose logs -f app
```

### nginx 反向代理配置
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 静态文件服务
    location /assets/ {
        proxy_pass http://localhost:8000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # WebSocket 支持
    location /api/ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # API 代理
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 环境变量管理
```bash
# 生产环境配置
AUTH_TOKEN=strong-production-token
LLM_API_KEY=production-api-key
SQLITE_DB_PATH=/app/data/metadata.db
FILE_STORAGE_PATH=/app/data/storage
```

## ⚡ 性能优化

### 前端性能优化
- **代码分割**: 路由级别的懒加载
- **缓存策略**: 
  - Service Worker 缓存静态资源
  - API 响应缓存 (ETag)
  - 编译结果缓存
- **虚拟化**: 大列表虚拟滚动
- **图片优化**: 自动压缩和格式转换
- **Bundle 优化**: Tree-shaking + 代码压缩

### 后端性能优化
- **异步 I/O**: 全异步文件操作
- **数据库优化**: 
  - SQLite WAL 模式
  - 索引优化
  - 连接池管理
- **缓存架构**: 
  - 内存缓存 (编译结果)
  - 磁盘缓存 (静态资源)
  - Redis 缓存 (可选)
- **分片传输**: 大文件分片上传/下载

### 监控和日志
```bash
# 应用监控
docker stats file-server
docker-compose logs --tail=100 -f

# 文件系统监控
df -h /app/storage
du -sh /app/storage/*

# 数据库监控
sqlite3 metadata.db ".dbinfo"
```

## 🤝 贡献指南

### 贡献类型
- **Bug 修复**: 提交 Issue 并附带复现步骤
- **新功能**: 先提交 Feature Request 讨论
- **文档改进**: 直接提交 PR
- **性能优化**: 提供性能测试数据

### 开发规范
- **提交信息**: 使用 [Conventional Commits](https://conventionalcommits.org/) 规范
- **代码质量**: 通过 ESLint 和类型检查
- **测试覆盖**: 新功能需要添加测试
- **文档更新**: 功能变更需要更新文档

### 常见问题

**Q: 如何增加新的AI模型支持？**
A: 在 `llm_service.py` 中添加模型配置，更新环境变量即可。

**Q: 如何自定义编译插件？**
A: 在 `compile_service/node_compiler/plugins/` 目录添加新插件。

**Q: 如何扩展文件类型支持？**
A: 更新 `constants/fileExtensions.ts` 和对应的预览组件。

**Q: 如何配置自定义存储后端？**
A: 实现 `file_handlers.py` 的存储接口，支持 S3、OSS 等。

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

感谢以下开源项目：
- [FastAPI](https://fastapi.tiangolo.com/) - 现代化的 Python Web 框架
- [React](https://reactjs.org/) - 用户界面构建库
- [Y.js](https://github.com/yjs/yjs) - 实时协作编辑 CRDT
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code 编辑器核心
- [esbuild](https://esbuild.github.io/) - 极速 JavaScript 打包工具

---

**OneShare** - 让创意分享更简单 🚀