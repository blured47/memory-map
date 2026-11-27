from fastapi import Depends, FastAPI
from sqlalchemy import text

from . import auth
from .db import Base, engine
from .routers import meetings, memos, persons, photos, places

Base.metadata.create_all(engine)

# 예전에 만든 SQLite DB 에 새 컬럼이 없으면 추가한다 (기존 기록은 그대로 둔다)
NEW_COLUMNS = {
    "persons": {"deleted_at": "DATETIME"},
    "meetings": {"deleted_at": "DATETIME", "removed_people": "INTEGER NOT NULL DEFAULT 0"},
}
if engine.dialect.name == "sqlite":
    with engine.connect() as conn:
        for table, columns in NEW_COLUMNS.items():
            existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
            for name, ddl in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
        conn.commit()

app = FastAPI(title="Memory Map", description="사진·메모 기반 개인 인간관계 기억지도")
# 상태 확인(/api/health)을 뺀 모든 API 는 토큰을 확인한다 (토큰을 설정했을 때만)
protected = [Depends(auth.require_token)]
app.include_router(persons.router, dependencies=protected)
app.include_router(persons.reminders_router, dependencies=protected)
app.include_router(meetings.router, dependencies=protected)
app.include_router(photos.router, dependencies=protected)
app.include_router(places.router, dependencies=protected)
app.include_router(memos.router, dependencies=protected)


@app.get("/api/health", tags=["health"])
def health():
    """앱의 '연결 확인'에서 쓴다. 토큰이 필요한 서버인지도 알려준다"""
    return {"status": "ok", "auth_required": bool(auth.API_TOKEN)}
