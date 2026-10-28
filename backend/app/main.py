from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import FRONTEND_DIR, KAKAO_JS_KEY
from .db import Base, engine
from .routers import meetings, persons

Base.metadata.create_all(engine)

app = FastAPI(title="Memory Map", description="사진·메모 기반 개인 인간관계 기억지도")
app.include_router(persons.router)
app.include_router(meetings.router)


@app.get("/api/config")
def client_config():
    # 프론트에서 카카오맵 SDK를 불러올 때 쓰는 JS 키 (JS 키는 도메인 제한으로 보호됨)
    return {"kakaoJsKey": KAKAO_JS_KEY}


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
