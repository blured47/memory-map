from fastapi import FastAPI
from sqlalchemy import text

from .db import Base, engine
from .routers import meetings, memos, persons, photos, places

Base.metadata.create_all(engine)

# SQLite 기존 DB에 deleted_at 컬럼이 없을 경우 자동 추가 마이그레이션
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE persons ADD COLUMN deleted_at DATETIME"))
        conn.commit()
    except Exception:
        pass

app = FastAPI(title="Memory Map", description="사진·메모 기반 개인 인간관계 기억지도")
app.include_router(persons.router)
app.include_router(persons.reminders_router)
app.include_router(meetings.router)
app.include_router(photos.router)
app.include_router(places.router)
app.include_router(memos.router)
