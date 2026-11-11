import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]

# 프로젝트 맨 바깥의 .env 를 읽는다 (터미널에서 uvicorn 으로 바로 켜도 키가 들어가게)
load_dotenv(BASE_DIR / ".env")
DATA_DIR = Path(os.getenv("MEMORYMAP_DATA_DIR", BASE_DIR / "data"))
PHOTOS_DIR = DATA_DIR / "photos"
DATABASE_URL = os.getenv("MEMORYMAP_DATABASE_URL", f"sqlite:///{DATA_DIR / 'memorymap.db'}")

# 메모 분류용 로컬 LLM
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")

# 카카오 REST 키 (좌표→주소, 키워드 검색용). 지도 표시용 JS 키는 앱의 frontend/.env 에 둔다
KAKAO_REST_KEY = os.getenv("KAKAO_REST_KEY", "")
