import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

# API配置
API_ENDPOINT = os.getenv("VITE_API_ENDPOINT", "/")
AUTH_TOKEN = os.getenv("AUTH_TOKEN", "your-secret-token")

# 文件存储配置
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 统一存储目录（新的核心存储位置）
FILE_STORAGE_PATH = os.getenv("FILE_STORAGE_PATH", "/opt/file-server/server/storage")

# 文件大小限制配置
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# 分片配置
UPLOAD_CHUNK_SIZE = int(os.getenv("UPLOAD_CHUNK_SIZE_MB", "2")) * 1024 * 1024
DOWNLOAD_CHUNK_SIZE = int(os.getenv("DOWNLOAD_CHUNK_SIZE_MB", "2")) * 1024 * 1024

# 临时目录配置
TEMP_UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "cache"))

# 服务器配置
HOST = os.getenv("VITE_FILE_SERVER_HOST", "0.0.0.0")
PORT = int(os.getenv("VITE_FILE_SERVER_PORT", "8000"))

# HTML文件路径
INDEX_HTML_PATH = os.path.join(os.path.dirname(__file__), "../client/dist/index.html")

# 确保目录存在

os.makedirs(FILE_STORAGE_PATH, exist_ok=True)
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)


# LLM服务配置
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "")
LLM_DEFAULT_MODEL = os.getenv("LLM_DEFAULT_MODEL", "google/gemini-2.5-flash-lite")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.8"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "32000"))
