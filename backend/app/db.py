from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATA_DIR, DATABASE_URL

if DATABASE_URL.startswith("sqlite:///"):
    DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        # WAL: AI 분류처럼 오래 걸리는 요청이 읽는 중에도 다른 요청이 저장할 수 있다
        cursor.execute("PRAGMA journal_mode=WAL")
        # 다른 요청이 쓰는 중이면 바로 실패하지 않고 잠시 기다린다
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
