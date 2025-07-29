# 文件服务器向量存储集成方案
## PostgreSQL + pgvector + OpenAI Embeddings

### 一、项目概述

#### 1.1 现有架构分析

**当前核心组件：**
- **后端**: FastAPI + 统一文件存储 + 元数据管理器
- **前端**: React + FileCard组件 + 文件列表展示
- **存储**: 本地文件系统 + `.meta`元数据文件
- **功能**: 文件上传/下载、权限管理、分片传输、WebSocket实时通信

**关键发现：**
- 已有完善的元数据管理系统 (`MetadataManager`)
- 支持文件标签、描述、笔记字段
- 现有简单的文件搜索功能 (`search_files`方法)
- 现有LLM服务架构 (`llm_routes.py`, `llm_service.py`)
- 前端缺少专门的搜索界面

#### 1.2 改造目标

- **智能搜索**: 支持自然语言搜索，如"关于合同的PDF文件"
- **内容发现**: 自动推荐相似文件，提升工作效率
- **渐进式部署**: 不影响现有功能，平滑升级
- **扩展性强**: 基于PostgreSQL，支持大规模数据
- **成本可控**: 使用API调用embedding，无需本地模型

### 二、PostgreSQL + pgvector 部署方案

#### 2.1 Docker Compose 部署配置

**创建 `docker-compose.vector.yml`：**
```yaml
services:
  postgres-vector:
    image: pgvector/pgvector:pg17
    container_name: file-server-pgvector
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${VECTOR_DB_USER:-vector_user}
      POSTGRES_PASSWORD: ${VECTOR_DB_PASSWORD:-vector_password}
      POSTGRES_DB: ${VECTOR_DB_NAME:-file_vectors}
    ports:
      - "${VECTOR_DB_PORT:-5432}:5432"
    volumes:
      - vector_data:/var/lib/postgresql/data
      - ./server/sql/init_vector_db.sql:/docker-entrypoint-initdb.d/01-init.sql
    networks:
      - file-server-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${VECTOR_DB_USER:-vector_user} -d ${VECTOR_DB_NAME:-file_vectors}"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  vector_data:

networks:
  file-server-network:
    driver: bridge
```

#### 2.2 数据库Schema设计

**创建目录和初始化脚本 `server/sql/init_vector_db.sql`：**
```sql
-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 文件向量表
CREATE TABLE IF NOT EXISTS file_vectors (
    id SERIAL PRIMARY KEY,
    file_path VARCHAR(512) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    content_text TEXT,
    content_vector VECTOR(1536),  -- OpenAI text-embedding-3-small 维度
    file_type VARCHAR(50),
    file_size BIGINT,
    chunk_index INTEGER DEFAULT 0,  -- 文件分块索引
    total_chunks INTEGER DEFAULT 1, -- 总分块数
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- 复合唯一索引（文件路径+分块索引）
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_vectors_path_chunk 
ON file_vectors(file_path, chunk_index);

-- 其他索引
CREATE INDEX IF NOT EXISTS idx_file_vectors_hash ON file_vectors(content_hash);
CREATE INDEX IF NOT EXISTS idx_file_vectors_type ON file_vectors(file_type);
CREATE INDEX IF NOT EXISTS idx_file_vectors_created ON file_vectors(created_at);

-- 向量相似度索引 (HNSW 更高效)
CREATE INDEX IF NOT EXISTS idx_file_vectors_embedding 
ON file_vectors USING hnsw (content_vector vector_cosine_ops);

-- 向量化状态表
CREATE TABLE IF NOT EXISTS vectorization_status (
    id SERIAL PRIMARY KEY,
    file_path VARCHAR(512) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    error_message TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vectorization_status_path ON vectorization_status(file_path);
CREATE INDEX IF NOT EXISTS idx_vectorization_status_status ON vectorization_status(status);

-- 插入示例数据（可选）
INSERT INTO vectorization_status (file_path, status) VALUES 
('example.txt', 'pending') ON CONFLICT DO NOTHING;
```

#### 2.3 部署命令

```bash
# 1. 创建SQL目录
mkdir -p server/sql

# 2. 启动向量数据库
docker-compose -f docker-compose.vector.yml up -d

# 3. 验证安装
docker exec file-server-pgvector psql -U vector_user -d file_vectors -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"

# 4. 查看表结构
docker exec file-server-pgvector psql -U vector_user -d file_vectors -c "\dt"
```

### 三、后端代码架构改造

#### 3.1 配置扩展 (`config.py`)

**在现有配置文件末尾添加：**
```python
# 向量数据库配置
VECTOR_DB_HOST = os.getenv("VECTOR_DB_HOST", "localhost")
VECTOR_DB_PORT = int(os.getenv("VECTOR_DB_PORT", "5432"))
VECTOR_DB_NAME = os.getenv("VECTOR_DB_NAME", "file_vectors")
VECTOR_DB_USER = os.getenv("VECTOR_DB_USER", "vector_user")
VECTOR_DB_PASSWORD = os.getenv("VECTOR_DB_PASSWORD", "vector_password")

# 向量化配置
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
VECTOR_DIMENSION = int(os.getenv("VECTOR_DIMENSION", "1536"))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))

# 搜索配置
SEMANTIC_SEARCH_THRESHOLD = float(os.getenv("SEMANTIC_SEARCH_THRESHOLD", "0.8"))
MAX_SEARCH_RESULTS = int(os.getenv("MAX_SEARCH_RESULTS", "50"))
VECTORIZATION_ENABLED = os.getenv("VECTORIZATION_ENABLED", "true").lower() == "true"
```

#### 3.2 核心向量服务 (`server/vector_service.py`)

**创建新文件，基于现有LLM服务架构：**
```python
"""
向量化服务模块
基于现有 LLM 服务架构提供文档向量化功能
"""

import asyncio
import hashlib
import logging
import os
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from openai import AsyncOpenAI

import asyncpg
from pydantic import BaseModel

from config import (
    VECTOR_DB_HOST, VECTOR_DB_PORT, VECTOR_DB_NAME, 
    VECTOR_DB_USER, VECTOR_DB_PASSWORD,
    EMBEDDING_MODEL, VECTOR_DIMENSION, CHUNK_SIZE, CHUNK_OVERLAP,
    LLM_API_KEY, LLM_BASE_URL, FILE_STORAGE_PATH
)

logger = logging.getLogger(__name__)

@dataclass
class VectorSearchResult:
    file_path: str
    similarity_score: float
    content_snippet: str
    file_type: str
    file_size: int
    metadata: dict

class EmbeddingRequest(BaseModel):
    text: str
    model: Optional[str] = EMBEDDING_MODEL

class EmbeddingResponse(BaseModel):
    success: bool
    embedding: Optional[List[float]] = None
    error: Optional[str] = None

class VectorService:
    def __init__(self):
        self.openai_client: Optional[AsyncOpenAI] = None
        self.db_pool: Optional[asyncpg.Pool] = None
        self._initialize_clients()
    
    def _initialize_clients(self):
        """初始化 OpenAI 客户端"""
        if LLM_API_KEY:
            self.openai_client = AsyncOpenAI(
                api_key=LLM_API_KEY,
                base_url=LLM_BASE_URL
            )
            logger.info("向量服务 OpenAI 客户端初始化成功")
    
    async def initialize_db(self):
        """初始化数据库连接池"""
        try:
            self.db_pool = await asyncpg.create_pool(
                host=VECTOR_DB_HOST,
                port=VECTOR_DB_PORT,
                database=VECTOR_DB_NAME,
                user=VECTOR_DB_USER,
                password=VECTOR_DB_PASSWORD,
                min_size=2,
                max_size=10
            )
            logger.info("向量数据库连接池初始化成功")
        except Exception as e:
            logger.error(f"向量数据库连接失败: {e}")
            # 不抛出异常，允许系统在没有向量功能的情况下运行
    
    async def close_db(self):
        """关闭数据库连接池"""
        if self.db_pool:
            await self.db_pool.close()
    
    def is_available(self) -> bool:
        """检查向量服务是否可用"""
        return self.openai_client is not None and self.db_pool is not None
    
    async def create_embedding(self, text: str) -> EmbeddingResponse:
        """创建文本向量"""
        if not self.openai_client:
            return EmbeddingResponse(
                success=False,
                error="OpenAI 客户端未初始化"
            )
        
        try:
            response = await self.openai_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=text,
                encoding_format="float"
            )
            
            embedding = response.data[0].embedding
            
            return EmbeddingResponse(
                success=True,
                embedding=embedding
            )
            
        except Exception as e:
            logger.error(f"创建向量失败: {e}")
            return EmbeddingResponse(
                success=False,
                error=f"向量化失败: {str(e)}"
            )
    
    async def vectorize_file(self, file_path: str, file_content: str = None) -> bool:
        """向量化单个文件"""
        try:
            # 更新状态为处理中
            await self._update_vectorization_status(file_path, "processing")
            
            # 提取文件内容
            if file_content is None:
                file_content = await self._extract_file_content(file_path)
            
            if not file_content.strip():
                logger.warning(f"文件内容为空，跳过向量化: {file_path}")
                await self._update_vectorization_status(file_path, "completed")
                return True
            
            # 文本分块
            chunks = self._split_text(file_content)
            
            # 计算内容哈希
            content_hash = hashlib.md5(file_content.encode()).hexdigest()
            
            # 获取文件信息
            file_type = file_path.split('.')[-1].lower() if '.' in file_path else 'unknown'
            full_file_path = os.path.join(FILE_STORAGE_PATH, file_path)
            file_size = os.path.getsize(full_file_path) if os.path.exists(full_file_path) else 0
            
            # 删除旧的向量数据
            await self._delete_file_vectors(file_path)
            
            # 向量化每个分块
            total_chunks = len(chunks)
            
            for i, chunk in enumerate(chunks):
                # 创建向量
                embedding_response = await self.create_embedding(chunk)
                
                if not embedding_response.success:
                    raise Exception(f"分块 {i} 向量化失败: {embedding_response.error}")
                
                # 存储到数据库
                await self._store_vector(
                    file_path=file_path,
                    content_hash=content_hash,
                    content_text=chunk,
                    content_vector=embedding_response.embedding,
                    file_type=file_type,
                    file_size=file_size,
                    chunk_index=i,
                    total_chunks=total_chunks
                )
            
            # 更新状态为完成
            await self._update_vectorization_status(file_path, "completed")
            logger.info(f"文件向量化完成: {file_path}, 分块数: {total_chunks}")
            return True
            
        except Exception as e:
            logger.error(f"文件向量化失败 {file_path}: {e}")
            await self._update_vectorization_status(file_path, "failed", str(e))
            return False
    
    async def semantic_search(self, query: str, limit: int = 20, 
                            file_types: List[str] = None,
                            similarity_threshold: float = 0.8) -> List[VectorSearchResult]:
        """语义搜索"""
        try:
            # 创建查询向量
            embedding_response = await self.create_embedding(query)
            if not embedding_response.success:
                logger.error(f"查询向量化失败: {embedding_response.error}")
                return []
            
            query_vector = embedding_response.embedding
            
            # 构建SQL查询
            sql = """
            SELECT DISTINCT ON (file_path)
                file_path, 
                content_text,
                file_type,
                file_size,
                metadata,
                1 - (content_vector <=> $1::vector) as similarity
            FROM file_vectors 
            WHERE 1 - (content_vector <=> $1::vector) > $2
            """
            
            params = [query_vector, similarity_threshold]
            param_count = 2
            
            # 文件类型过滤
            if file_types:
                param_count += 1
                sql += f" AND file_type = ANY(${param_count})"
                params.append(file_types)
            
            sql += f" ORDER BY file_path, similarity DESC LIMIT ${param_count + 1}"
            params.append(limit)
            
            async with self.db_pool.acquire() as conn:
                rows = await conn.fetch(sql, *params)
            
            results = []
            for row in rows:
                results.append(VectorSearchResult(
                    file_path=row['file_path'],
                    similarity_score=float(row['similarity']),
                    content_snippet=row['content_text'][:200] + "..." if len(row['content_text']) > 200 else row['content_text'],
                    file_type=row['file_type'],
                    file_size=row['file_size'] or 0,
                    metadata=row['metadata'] or {}
                ))
            
            return results
            
        except Exception as e:
            logger.error(f"语义搜索失败: {e}")
            return []
    
    async def find_similar_files(self, file_path: str, limit: int = 10) -> List[VectorSearchResult]:
        """查找相似文件"""
        try:
            # 获取文件的平均向量
            async with self.db_pool.acquire() as conn:
                # 计算文件所有分块的平均向量
                rows = await conn.fetch("""
                    SELECT content_vector, content_text, file_type, file_size, metadata
                    FROM file_vectors 
                    WHERE file_path = $1
                """, file_path)
                
                if not rows:
                    return []
                
                # 计算平均向量
                avg_vector = [0.0] * VECTOR_DIMENSION
                for row in rows:
                    vector = list(row['content_vector'])
                    for i, val in enumerate(vector):
                        avg_vector[i] += val
                
                # 归一化
                for i in range(len(avg_vector)):
                    avg_vector[i] /= len(rows)
                
                # 查找相似文件
                similar_files = await conn.fetch("""
                    SELECT DISTINCT ON (file_path)
                        file_path,
                        content_text,
                        file_type,
                        file_size,
                        metadata,
                        1 - (content_vector <=> $1::vector) as similarity
                    FROM file_vectors 
                    WHERE file_path != $2
                        AND 1 - (content_vector <=> $1::vector) > 0.7
                    ORDER BY file_path, similarity DESC
                    LIMIT $3
                """, avg_vector, file_path, limit)
            
            results = []
            for row in similar_files:
                results.append(VectorSearchResult(
                    file_path=row['file_path'],
                    similarity_score=float(row['similarity']),
                    content_snippet=row['content_text'][:200] + "..." if len(row['content_text']) > 200 else row['content_text'],
                    file_type=row['file_type'],
                    file_size=row['file_size'] or 0,
                    metadata=row['metadata'] or {}
                ))
            
            return results
            
        except Exception as e:
            logger.error(f"查找相似文件失败: {e}")
            return []
    
    async def get_vectorization_status(self, file_path: str = None) -> Dict[str, Any]:
        """获取向量化状态"""
        try:
            async with self.db_pool.acquire() as conn:
                if file_path:
                    row = await conn.fetchrow(
                        "SELECT * FROM vectorization_status WHERE file_path = $1",
                        file_path
                    )
                    return dict(row) if row else {"status": "not_found"}
                else:
                    # 获取统计信息
                    stats = await conn.fetchrow("""
                        SELECT 
                            COUNT(*) as total,
                            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                            COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
                            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
                            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
                        FROM vectorization_status
                    """)
                    return dict(stats)
        except Exception as e:
            logger.error(f"获取向量化状态失败: {e}")
            return {"error": str(e)}
    
    async def delete_file_vectors(self, file_path: str) -> bool:
        """删除文件的向量数据"""
        try:
            await self._delete_file_vectors(file_path)
            await self._delete_vectorization_status(file_path)
            return True
        except Exception as e:
            logger.error(f"删除文件向量失败: {e}")
            return False
    
    # 私有方法
    async def _extract_file_content(self, file_path: str) -> str:
        """提取文件内容"""
        try:
            full_path = os.path.join(FILE_STORAGE_PATH, file_path)
            
            if not os.path.exists(full_path):
                logger.warning(f"文件不存在: {full_path}")
                return ""
            
            file_ext = os.path.splitext(file_path)[1].lower()
            
            # 目前只支持文本文件
            if file_ext in ['.txt', '.md', '.py', '.js', '.ts', '.html', '.css', '.json', '.xml', '.log']:
                try:
                    with open(full_path, 'r', encoding='utf-8') as f:
                        return f.read()
                except UnicodeDecodeError:
                    # 尝试其他编码
                    for encoding in ['gbk', 'gb2312', 'latin1']:
                        try:
                            with open(full_path, 'r', encoding=encoding) as f:
                                return f.read()
                        except UnicodeDecodeError:
                            continue
                    logger.error(f"无法解码文件: {full_path}")
                    return ""
            else:
                logger.info(f"暂不支持的文件格式: {file_ext}")
                return ""
                
        except Exception as e:
            logger.error(f"提取文件内容失败: {e}")
            return ""
    
    def _split_text(self, text: str) -> List[str]:
        """文本分块"""
        if len(text) <= CHUNK_SIZE:
            return [text]
        
        chunks = []
        start = 0
        while start < len(text):
            end = start + CHUNK_SIZE
            
            # 尝试在句号、换行符或空格处分割
            if end < len(text):
                for split_char in ['. ', '\n', ' ']:
                    split_pos = text.rfind(split_char, start, end)
                    if split_pos != -1:
                        end = split_pos + len(split_char)
                        break
            
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            
            start = end - CHUNK_OVERLAP if end < len(text) else end
        
        return chunks
    
    async def _store_vector(self, file_path: str, content_hash: str, 
                          content_text: str, content_vector: List[float],
                          file_type: str, file_size: int, chunk_index: int = 0, 
                          total_chunks: int = 1):
        """存储向量到数据库"""
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO file_vectors 
                    (file_path, content_hash, content_text, content_vector, 
                     file_type, file_size, chunk_index, total_chunks, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """, file_path, content_hash, content_text, content_vector,
                    file_type, file_size, chunk_index, total_chunks, {})
        except Exception as e:
            logger.error(f"存储向量失败: {e}")
            raise
    
    async def _delete_file_vectors(self, file_path: str):
        """删除文件的所有向量数据"""
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    "DELETE FROM file_vectors WHERE file_path = $1",
                    file_path
                )
        except Exception as e:
            logger.error(f"删除文件向量失败: {e}")
            raise
    
    async def _update_vectorization_status(self, file_path: str, status: str, 
                                         error_message: str = None):
        """更新向量化状态"""
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO vectorization_status (file_path, status, error_message, processed_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (file_path) DO UPDATE SET
                        status = EXCLUDED.status,
                        error_message = EXCLUDED.error_message,
                        processed_at = EXCLUDED.processed_at,
                        updated_at = NOW()
                """, file_path, status, error_message)
        except Exception as e:
            logger.error(f"更新向量化状态失败: {e}")
    
    async def _delete_vectorization_status(self, file_path: str):
        """删除向量化状态"""
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    "DELETE FROM vectorization_status WHERE file_path = $1",
                    file_path
                )
        except Exception as e:
            logger.error(f"删除向量化状态失败: {e}")

# 全局向量服务实例
vector_service = VectorService()
```

#### 3.3 LLM路由扩展 (`llm_routes.py`)

**在现有LLM路由文件末尾添加：**
```python
# 在 llm_routes.py 末尾添加

from vector_service import vector_service, EmbeddingRequest
from typing import List

# 向量化相关端点
@router.post("/embeddings")
async def create_embeddings(request: EmbeddingRequest):
    """创建文本向量"""
    if not vector_service.is_available():
        raise HTTPException(status_code=503, detail="向量服务不可用")
    
    response = await vector_service.create_embedding(request.text)
    if not response.success:
        raise HTTPException(status_code=400, detail=response.error)
    
    return {
        "success": True,
        "embedding": response.embedding,
        "model": request.model,
        "dimension": len(response.embedding)
    }

@router.post("/search/semantic")
async def semantic_search(
    query: str,
    limit: int = 20,
    file_types: Optional[List[str]] = None,
    similarity_threshold: float = 0.8
):
    """语义搜索文件"""
    if not vector_service.is_available():
        raise HTTPException(status_code=503, detail="向量服务不可用")
    
    results = await vector_service.semantic_search(
        query=query,
        limit=limit,
        file_types=file_types,
        similarity_threshold=similarity_threshold
    )
    
    return {
        "success": True,
        "query": query,
        "results": [
            {
                "file_path": r.file_path,
                "similarity_score": r.similarity_score,
                "content_snippet": r.content_snippet,
                "file_type": r.file_type,
                "file_size": r.file_size,
                "metadata": r.metadata
            }
            for r in results
        ],
        "total": len(results)
    }

@router.get("/files/{file_path:path}/similar")
async def find_similar_files(file_path: str, limit: int = 10):
    """查找相似文件"""
    if not vector_service.is_available():
        raise HTTPException(status_code=503, detail="向量服务不可用")
    
    results = await vector_service.find_similar_files(file_path, limit)
    
    return {
        "success": True,
        "file_path": file_path,
        "similar_files": [
            {
                "file_path": r.file_path,
                "similarity_score": r.similarity_score,
                "content_snippet": r.content_snippet,
                "file_type": r.file_type
            }
            for r in results
        ],
        "total": len(results)
    }

@router.post("/vectorize/file")
async def vectorize_single_file(file_path: str):
    """向量化单个文件"""
    if not vector_service.is_available():
        raise HTTPException(status_code=503, detail="向量服务不可用")
    
    success = await vector_service.vectorize_file(file_path)
    
    if success:
        return {"success": True, "message": f"文件 {file_path} 向量化完成"}
    else:
        raise HTTPException(status_code=500, detail="文件向量化失败")

@router.post("/vectorize/batch")
async def vectorize_batch_files(file_paths: List[str]):
    """批量向量化文件"""
    if not vector_service.is_available():
        raise HTTPException(status_code=503, detail="向量服务不可用")
    
    results = []
    for file_path in file_paths:
        success = await vector_service.vectorize_file(file_path)
        results.append({
            "file_path": file_path,
            "success": success
        })
    
    return {
        "success": True,
        "results": results,
        "total": len(file_paths),
        "successful": sum(1 for r in results if r["success"])
    }

@router.get("/vectorization/status")
async def get_vectorization_status(file_path: Optional[str] = None):
    """获取向量化状态"""
    if not vector_service.is_available():
        raise HTTPException(status_code=503, detail="向量服务不可用")
    
    status = await vector_service.get_vectorization_status(file_path)
    return {"success": True, "data": status}

@router.delete("/vectors/{file_path:path}")
async def delete_file_vectors(file_path: str):
    """删除文件的向量数据"""
    if not vector_service.is_available():
        raise HTTPException(status_code=503, detail="向量服务不可用")
    
    success = await vector_service.delete_file_vectors(file_path)
    
    if success:
        return {"success": True, "message": f"文件 {file_path} 的向量数据已删除"}
    else:
        raise HTTPException(status_code=500, detail="删除向量数据失败")
```

#### 3.4 依赖更新 (`requirements.txt`)

**在现有依赖文件末尾添加：**
```txt
# 新增向量相关依赖
asyncpg>=0.29.0
```

#### 3.5 服务启动集成 (`main.py`)

**在main.py中集成向量服务初始化：**
```python
# 在启动时初始化向量服务
@app.on_event("startup")
async def startup_event():
    """应用启动时的初始化"""
    try:
        from vector_service import vector_service
        await vector_service.initialize_db()
        logger.info("向量服务初始化完成")
    except Exception as e:
        logger.warning(f"向量服务初始化失败，将在无向量功能模式下运行: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时的清理"""
    try:
        from vector_service import vector_service
        await vector_service.close_db()
        logger.info("向量服务连接已关闭")
    except Exception as e:
        logger.error(f"关闭向量服务时出错: {e}")
```

### 四、集成到现有文件流程

#### 4.1 文件上传流程集成

**在 `file_handlers.py` 中的相关函数末尾添加：**

```python
# 在 handle_unified_upload 函数的成功返回前添加
if result.success and VECTORIZATION_ENABLED:
    from vector_service import vector_service
    # 异步向量化，不阻塞上传响应
    asyncio.create_task(vector_service.vectorize_file(filename))

# 在 handle_chunk_complete 函数的成功返回前添加
if result.success and VECTORIZATION_ENABLED:
    from vector_service import vector_service
    # 异步向量化，不阻塞响应
    asyncio.create_task(vector_service.vectorize_file(filename))
```

#### 4.2 文件删除流程集成

**在文件删除函数中添加向量数据清理：**
```python
# 在文件删除成功后添加
if result.success and VECTORIZATION_ENABLED:
    from vector_service import vector_service
    # 异步删除向量数据
    asyncio.create_task(vector_service.delete_file_vectors(filename))
```

#### 4.3 元数据管理器扩展

**在 `metadata_manager.py` 的 FileMetadata 类中添加：**
```python
vector_status: str = "pending"  # pending, processing, completed, failed
```

### 五、环境变量配置

#### 5.1 更新 `.env` 文件

**添加向量相关配置：**
```env
# 现有配置...

# 向量数据库配置
VECTOR_DB_HOST=localhost
VECTOR_DB_PORT=5432
VECTOR_DB_NAME=file_vectors
VECTOR_DB_USER=vector_user
VECTOR_DB_PASSWORD=vector_password

# 向量化配置
EMBEDDING_MODEL=text-embedding-3-small
VECTOR_DIMENSION=1536
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
VECTORIZATION_ENABLED=true

# 搜索配置
SEMANTIC_SEARCH_THRESHOLD=0.8
MAX_SEARCH_RESULTS=50
```

### 六、前端功能开发

#### 6.1 语义搜索API调用

**创建或更新前端API文件：**
```typescript
// 语义搜索API
export const semanticSearch = async (query: string, options?: {
  limit?: number;
  fileTypes?: string[];
  threshold?: number;
}) => {
  const response = await fetch(`${API_BASE}/api/llm/search/semantic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      limit: options?.limit || 20,
      file_types: options?.fileTypes,
      similarity_threshold: options?.threshold || 0.8
    })
  });
  return response.json();
};

// 相似文件API
export const findSimilarFiles = async (filePath: string) => {
  const response = await fetch(`${API_BASE}/api/llm/files/${encodeURIComponent(filePath)}/similar`);
  return response.json();
};

// 向量化API
export const vectorizeFile = async (filePath: string) => {
  const response = await fetch(`${API_BASE}/api/llm/vectorize/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath })
  });
  return response.json();
};

// 向量化状态API
export const getVectorizationStatus = async (filePath?: string) => {
  const url = filePath 
    ? `${API_BASE}/api/llm/vectorization/status?file_path=${encodeURIComponent(filePath)}`
    : `${API_BASE}/api/llm/vectorization/status`;
  const response = await fetch(url);
  return response.json();
};
```

#### 6.2 FileCard组件增强

**在FileCard组件的下拉菜单中添加：**
```tsx
// 在 DropdownMenuContent 中添加
{file.type !== 'directory' && (
  <>
    <DropdownMenuItem
      onClick={(e) => {
        e.stopPropagation();
        onFindSimilar?.(file.filename);
      }}
    >
      <Search className="h-4 w-4 mr-2" />
      查找相似文件
    </DropdownMenuItem>
    <DropdownMenuItem
      onClick={(e) => {
        e.stopPropagation();
        onVectorizeFile?.(file.filename);
      }}
    >
      <Zap className="h-4 w-4 mr-2" />
      重新向量化
    </DropdownMenuItem>
  </>
)}
```

### 七、部署和测试流程

#### 7.1 完整部署步骤

```bash
# 1. 创建必要目录
mkdir -p server/sql

# 2. 启动向量数据库
docker-compose -f docker-compose.vector.yml up -d

# 3. 验证数据库
docker exec file-server-pgvector psql -U vector_user -d file_vectors -c "SELECT version();"
docker exec file-server-pgvector psql -U vector_user -d file_vectors -c "SELECT extname FROM pg_extension;"

# 4. 安装Python依赖
cd server && pip install -r requirements.txt

# 5. 更新环境变量
cp .env.example .env
# 编辑 .env 文件，添加向量相关配置

# 6. 启动服务器
python main.py
```

#### 7.2 功能验证

```bash
# 1. 测试向量服务健康状态
curl http://localhost:8000/api/llm/health

# 2. 测试向量化功能
curl -X POST http://localhost:8000/api/llm/embeddings \
  -H "Content-Type: application/json" \
  -d '{"text": "测试文本向量化"}'

# 3. 测试文件向量化
curl -X POST http://localhost:8000/api/llm/vectorize/file \
  -H "Content-Type: application/json" \
  -d '{"file_path": "test.txt"}'

# 4. 测试语义搜索
curl -X POST http://localhost:8000/api/llm/search/semantic \
  -H "Content-Type: application/json" \
  -d '{"query": "搜索关键词", "limit": 10}'

# 5. 查看向量化状态
curl http://localhost:8000/api/llm/vectorization/status
```

### 八、性能优化和维护

#### 8.1 数据库优化

```sql
-- 定期清理过期数据
DELETE FROM file_vectors WHERE file_path NOT IN (
  SELECT filename FROM actual_files_table
);

-- 更新统计信息
ANALYZE file_vectors;

-- 重建索引（如需要）
REINDEX INDEX idx_file_vectors_embedding;
```

#### 8.2 监控和日志

```python
# 在向量服务中添加性能监控
import time

async def vectorize_file_with_metrics(self, file_path: str):
    start_time = time.time()
    result = await self.vectorize_file(file_path)
    duration = time.time() - start_time
    
    logger.info(f"向量化耗时: {file_path} - {duration:.2f}秒")
    return result
```

### 九、故障排除

#### 9.1 常见问题

1. **数据库连接失败**
   - 检查Docker容器状态：`docker ps`
   - 查看数据库日志：`docker logs file-server-pgvector`

2. **向量化失败**
   - 检查OpenAI API配置
   - 查看文件权限和路径

3. **搜索结果为空**
   - 确认文件已向量化：查询 `vectorization_status` 表
   - 调整相似度阈值

#### 9.2 调试命令

```bash
# 查看向量数据
docker exec file-server-pgvector psql -U vector_user -d file_vectors -c "SELECT COUNT(*) FROM file_vectors;"

# 查看向量化状态
docker exec file-server-pgvector psql -U vector_user -d file_vectors -c "SELECT status, COUNT(*) FROM vectorization_status GROUP BY status;"

# 测试向量相似度
docker exec file-server-pgvector psql -U vector_user -d file_vectors -c "SELECT file_path, 1 - (content_vector <=> (SELECT content_vector FROM file_vectors LIMIT 1)) as similarity FROM file_vectors LIMIT 5;"
```

### 十、后续扩展计划

1. **支持更多文件格式**
   - PDF: PyPDF2
   - Word: python-docx
   - 图片OCR: Tesseract

2. **高级搜索功能**
   - 混合搜索（关键词+语义）
   - 时间范围过滤
   - 文件大小过滤

3. **性能优化**
   - 异步批量处理
   - 向量压缩
   - 缓存优化

4. **AI功能扩展**
   - 文档摘要生成
   - 自动标签提取
   - 智能分类

---

这个方案将为文件服务器提供强大的向量搜索和智能推荐功能，基于现有架构进行渐进式升级，确保系统稳定性和可维护性。