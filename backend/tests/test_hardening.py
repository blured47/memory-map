"""출시 전 보강한 동작: 접근 토큰, 버려진 사진 정리, 분류 중 만남이 바뀐 경우"""

import json
import os
import time

import pytest

from app import auth, memo_ai
from app.config import PHOTOS_DIR
from tests.test_photos import make_photo, upload


# ---------- 접근 토큰 ----------

@pytest.fixture
def token(monkeypatch):
    monkeypatch.setattr(auth, "API_TOKEN", "secret-token")
    return "secret-token"


def test_no_token_configured_keeps_open_access(client):
    assert client.get("/api/health").json() == {"status": "ok", "auth_required": False}
    assert client.get("/api/persons").status_code == 200


def test_token_required_when_configured(client, token):
    # 상태 확인은 토큰 없이 되고, 토큰이 필요하다는 것을 알려준다
    assert client.get("/api/health").json()["auth_required"] is True

    assert client.get("/api/persons").status_code == 401
    assert client.get("/api/persons", headers={"Authorization": "Bearer wrong"}).status_code == 401
    ok = client.get("/api/persons", headers={"Authorization": f"Bearer {token}"})
    assert ok.status_code == 200


def test_photo_url_accepts_token_query(client, token):
    # 지도(WebView)와 <Image> 는 헤더를 못 붙이므로 사진은 ?token= 으로도 받을 수 있다
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post("/api/photos", files={"file": ("a.jpg", make_photo(), "image/jpeg")}, headers=headers)
    url = res.json()["url"]
    assert client.get(url).status_code == 401
    assert client.get(f"{url}?token={token}").status_code == 200


# ---------- 버려진 사진 정리 ----------

def _age(name: str, seconds: int) -> None:
    path = PHOTOS_DIR / name
    old = time.time() - seconds
    os.utime(path, (old, old))


def test_old_unused_photos_are_removed_on_next_upload(client):
    person = client.post("/api/persons", json={"name": "철수"}).json()["id"]
    used = upload(client, make_photo()).json()["photo_path"]
    abandoned = upload(client, make_photo()).json()["photo_path"]
    recent = upload(client, make_photo()).json()["photo_path"]
    client.post(
        "/api/meetings",
        json={"met_at": "2026-10-20T18:30:00", "photo_path": used, "person_ids": [person]},
    )
    _age(used, 3 * 86400)
    _age(abandoned, 3 * 86400)

    upload(client, make_photo())

    assert (PHOTOS_DIR / used).exists()  # 만남에 쓰는 사진은 오래돼도 남는다
    assert not (PHOTOS_DIR / abandoned).exists()  # 하루 넘게 아무 데도 안 쓴 사진은 지운다
    assert (PHOTOS_DIR / recent).exists()  # 지금 기록 중일 수 있는 최근 사진은 남긴다


def test_permanently_deleting_meeting_removes_its_photo(client):
    person = client.post("/api/persons", json={"name": "철수"}).json()["id"]
    photo = upload(client, make_photo()).json()["photo_path"]
    mid = client.post(
        "/api/meetings",
        json={"met_at": "2026-10-20T18:30:00", "photo_path": photo, "person_ids": [person]},
    ).json()["id"]
    client.delete(f"/api/meetings/{mid}")
    assert (PHOTOS_DIR / photo).exists()  # 휴지통에서는 복구할 때를 위해 남겨 둔다
    client.delete(f"/api/meetings/{mid}/permanent")
    assert not (PHOTOS_DIR / photo).exists()


# ---------- 분류하는 동안 만남이 바뀐 경우 ----------

def _meeting(client, memo="철수는 클라이밍에 빠짐"):
    pid = client.post("/api/persons", json={"name": "철수"}).json()["id"]
    mid = client.post(
        "/api/meetings", json={"met_at": "2026-10-20T18:30:00", "memo": memo, "person_ids": [pid]}
    ).json()["id"]
    return pid, mid


def _answer():
    return json.dumps(
        {"items": [{"person": "철수", "category": "interest", "content": "클라이밍", "date": ""}]},
        ensure_ascii=False,
    )


def test_memo_changed_during_classify_is_not_overwritten(client, monkeypatch):
    pid, mid = _meeting(client)

    def slow_chat(memo, names):
        # AI 가 생각하는 동안 사용자가 메모를 고쳤다
        client.patch(f"/api/meetings/{mid}", json={"memo": "새 메모"})
        return _answer()

    monkeypatch.setattr(memo_ai, "_chat", slow_chat)
    res = client.post(f"/api/meetings/{mid}/classify")
    assert res.status_code == 409
    assert client.get(f"/api/persons/{pid}/card").json()["interests"] == []


def test_meeting_deleted_during_classify_returns_404(client, monkeypatch):
    _, mid = _meeting(client)

    def slow_chat(memo, names):
        client.delete(f"/api/meetings/{mid}")
        return _answer()

    monkeypatch.setattr(memo_ai, "_chat", slow_chat)
    assert client.post(f"/api/meetings/{mid}/classify").status_code == 404


def test_classify_strips_code_fence(client, monkeypatch):
    pid, mid = _meeting(client)
    monkeypatch.setattr(memo_ai, "_chat", lambda memo, names: f"```json\n{_answer()}\n```")
    assert client.post(f"/api/meetings/{mid}/classify").status_code == 200
    assert [i["content"] for i in client.get(f"/api/persons/{pid}/card").json()["interests"]] == ["클라이밍"]


# ---------- 입력 검증 ----------

def test_blank_name_is_rejected(client):
    assert client.post("/api/persons", json={"name": "   "}).status_code == 422


def test_latitude_without_longitude_is_rejected(client):
    pid = client.post("/api/persons", json={"name": "철수"}).json()["id"]
    res = client.post("/api/meetings", json={"met_at": "2026-10-20T18:30:00", "latitude": 37.5, "person_ids": [pid]})
    assert res.status_code == 422


def test_trashed_person_cannot_join_new_meeting(client):
    pid = client.post("/api/persons", json={"name": "철수"}).json()["id"]
    client.delete(f"/api/persons/{pid}")
    res = client.post("/api/meetings", json={"met_at": "2026-10-20T18:30:00", "person_ids": [pid]})
    assert res.status_code == 400
