import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("MEMORYMAP_DATA_DIR", BASE_DIR / "data"))
DATABASE_URL = os.getenv("MEMORYMAP_DATABASE_URL", f"sqlite:///{DATA_DIR / 'memorymap.db'}")
FRONTEND_DIR = BASE_DIR / "frontend"

# 카카오맵 JavaScript 키 (프론트 지도 표시용) / REST 키 (좌표→주소, 키워드 검색용)
KAKAO_JS_KEY = os.getenv("KAKAO_JS_KEY", "")
KAKAO_REST_KEY = os.getenv("KAKAO_REST_KEY", "")
