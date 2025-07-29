import { useAppStore } from '@/stores/appStore';
import { DocDialog } from './DocDialog';

interface ApiDocDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiDocDialog({ isOpen, onClose }: ApiDocDialogProps) {
  const { config } = useAppStore();
  const server = config.serverAddress || 'http://localhost:8000';

  const apiDocContent = `# OneShare API 文档

## 🔗 文件访问（公共模式无需认证）

### 基本文件下载

\`\`\`bash
# 直接下载文件（公共模式）
curl ${server}/public/file.txt

# 下载子目录文件  
curl ${server}/public/documents/report.pdf

# 下载私有文件（需要认证）
curl -H "Authorization: your-secret-token" ${server}/file.txt

# 断点续传下载
curl -H "Range: bytes=1024-2048" ${server}/public/large-file.zip

# 强制下载（添加下载头）
curl "${server}/public/file.txt?download=1"
\`\`\`

## 🔐 文件管理操作（需要认证）

### 1. 上传文件
\`\`\`bash
# 标准上传
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -F "action=upload" \\
  -F "filename=文件名.txt" \\
  -F "file=@本地文件路径" \\
  ${server}/

# 分块上传（大文件）
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -F "action=upload_chunk" \\
  -F "filename=大文件.zip" \\
  -F "chunk_index=0" \\
  -F "file=@chunk0.part" \\
  ${server}/

# 完成分块上传
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -F "action=complete_upload" \\
  -F "filename=大文件.zip" \\
  -F "total_chunks=5" \\
  ${server}/
\`\`\`

### 2. 获取文件列表
\`\`\`bash
# 获取文件列表
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -F "action=list" \\
  -F "path=documents" \\
  ${server}/

# 公共文件列表（无需认证）
curl ${server}/public/list
\`\`\`

### 3. 文件操作
\`\`\`bash
# 删除文件
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -F "action=delete" \\
  -F "filename=文件名.txt" \\
  ${server}/

# 重命名文件
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -F "action=rename" \\
  -F "filename=原文件名.txt" \\
  -F "new_name=新文件名.txt" \\
  ${server}/

# 创建目录
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -F "action=mkdir" \\
  -F "filename=新目录" \\
  ${server}/

# 移动文件/目录
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -F "action=move" \\
  -F "filename=[\\"源文件.txt\\"]" \\
  -F "new_name=目标目录" \\
  ${server}/

# 批量删除
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -F "action=batch_delete" \\
  -F "filenames=[\\"file1.txt\\", \\"file2.pdf\\"]" \\
  ${server}/
\`\`\`

### 4. URL 内容下载
\`\`\`bash
# 从 URL 下载内容
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -F "action=download_url" \\
  -F "url=https://example.com/file.pdf" \\
  -F "filename=downloaded-file.pdf" \\
  ${server}/
\`\`\`

## 🚀 RESTful API 方法

### PUT - 上传/更新文件
\`\`\`bash
curl -X PUT \\
  -H "Authorization: your-secret-token" \\
  -F "filename=file.txt" \\
  -F "file=@file.txt" \\
  -F "overwrite=true" \\
  ${server}/
\`\`\`

### PATCH - 重命名文件
\`\`\`bash
curl -X PATCH \\
  -H "Authorization: your-secret-token" \\
  -F "filename=old.txt" \\
  -F "new_name=new.txt" \\
  ${server}/
\`\`\`

### DELETE - 删除文件
\`\`\`bash
curl -X DELETE \\
  -H "Authorization: your-secret-token" \\
  -F "filename=file.txt" \\
  ${server}/
\`\`\`

## 🔗 文件分享

### 创建分享链接
\`\`\`bash
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -H "Content-Type: application/json" \\
  -d '{"file_path": "documents/report.pdf", "is_public": true}' \\
  ${server}/share
\`\`\`

### 访问分享文件
\`\`\`bash
# 访问分享页面（浏览器）
${server}/s/share-uuid-here

# 获取分享信息
curl ${server}/share/info/share-uuid-here
\`\`\`

## 🤖 AI 功能 API

### 聊天对话
\`\`\`bash
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "model": "gpt-3.5-turbo"
  }' \\
  ${server}/llm/chat
\`\`\`

### 流式对话
\`\`\`bash
# 流式聊天对话
curl -X POST \\
  -H "Authorization: your-secret-token" \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "写一首诗"}], "model": "moonshotai/kimi-k2-instruct"}' \\
  ${server}/llm/chat/stream

# 获取模型列表
curl -X GET \\
  -H "Authorization: your-secret-token" \\
  ${server}/llm/models
\`\`\`

## 🔌 WebSocket 连接

### 实时文件系统事件
\`\`\`javascript
// 连接 WebSocket
const ws = new WebSocket('ws://${server.replace('http://', '').replace('https://', '')}/ws/client-123');

// 订阅目录变化
ws.send(JSON.stringify({
  type: 'subscribe_directory',
  directory: 'documents'
}));

// 接收事件
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('文件系统事件:', data);
};
\`\`\`

## 📊 系统信息

### 健康检查
\`\`\`bash
# 基本健康检查
curl ${server}/health

# WebSocket 统计
curl ${server}/ws/stats

# LLM 服务状态
curl ${server}/llm/health

# 可用模型列表
curl ${server}/llm/models
\`\`\`

## ✨ 核心特性

### 🔐 双重访问模式
- **公共模式**: 文件无需认证即可访问
- **私有模式**: 需要认证令牌进行管理操作
- **灵活切换**: 支持运行时模式切换

### 📡 实时同步
- **WebSocket 驱动**: 实时文件系统事件通知
- **多客户端同步**: 所有连接的客户端实时更新
- **事件类型**: 创建、更新、删除、重命名、批量操作

### 🚀 高性能上传
- **分块上传**: 2MB 分块，支持大文件和网络中断恢复
- **进度跟踪**: 实时上传进度和速度显示
- **并发处理**: 异步处理多文件上传

### 🤖 AI 智能功能
- **内容分析**: 情感分析、关键词提取、文本分类
- **智能总结**: 自动生成内容摘要
- **代码分析**: 代码结构分析和功能说明
- **多语言翻译**: 支持多种语言互译

### 🛡️ 安全保护
- **路径验证**: 防止目录遍历攻击
- **文件大小限制**: 可配置的上传限制（默认5GB）
- **安全文件名**: 自动处理特殊字符和路径
- **令牌认证**: 基于令牌的简单认证机制

### 📁 完整文件管理
- **CRUD 操作**: 创建、读取、更新、删除文件和目录
- **批量操作**: 多文件选择和批量处理
- **文件预览**: 支持文本、代码、Markdown 等文件类型
- **元数据跟踪**: 文件大小、创建时间、修改时间等

## 🔧 响应格式

### 成功响应
\`\`\`json
{
  "success": true,
  "data": {
    "files": [...],
    "current_path": "documents"
  }
}
\`\`\`

### 错误响应
\`\`\`json
{
  "success": false,
  "error": "错误描述",
  "code": "ERROR_CODE"
}
\`\`\`

## 📝 使用注意事项

1. **认证令牌**: 私有模式操作需要在 Header 中包含 \`Authorization: your-token\`
2. **文件路径**: 使用 URL 编码处理特殊字符
3. **大文件上传**: 建议使用分块上传，提高稳定性
4. **WebSocket**: 保持连接以接收实时更新
5. **错误处理**: 检查响应中的 \`success\` 字段

---

**完整的现代化文件管理 API，支持应用创建、文档管理、实时协作和 AI 功能** 🚀`;

  return (
    <DocDialog
      isOpen={isOpen}
      onClose={onClose}
      title="API 使用说明"
      content={apiDocContent}
      showCopyButton={true}
    />
  );
}