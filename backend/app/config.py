import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("MEMORYMAP_DATA_DIR", BASE_DIR / "data"))
DATABASE_URL = os.getenv("MEMORYMAP_DATABASE_URL", f"sqlite:///{DATA_DIR / 'memorymap.db'}")
FRONTEND_DIR = BASE_DIR / "frontend"

# 메모 분류용 로컬 LLM
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")

# 카카오맵 JavaScript 키 (프론트 지도 표시용) / REST 키 (좌표→주소, 키워드 검색용)
KAKAO_JS_KEY = os.getenv("KAKAO_JS_KEY", "")
KAKAO_REST_KEY = os.getenv("KAKAO_REST_KEY", "")
