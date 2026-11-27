"""5단계 통합 테스트: 앱에서 사용자가 실제로 거치는 흐름을 처음부터 끝까지 이어서 확인한다.

사진 업로드(EXIF) → 친구 등록 → 만남 기록 → AI 메모 분류 → 사람별 카드 수정 → 연락 알림 → 정리(삭제·휴지통)
AI(Ollama)와 오늘 날짜만 가짜로 바꾸고, 나머지는 실제 서버 코드를 그대로 지난다.
"""

import json
from datetime import datetime

import pytest

from app import memo_ai
from app.routers import persons
from tests.test_photos import SSU_GPS, make_photo, upload

NOW = datetime(2026, 11, 26, 12, 0)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(persons, "_now", lambda: NOW)


@pytest.fixture
def fake_ai(monkeypatch):
    # 메모와 함께한 사람 이름을 보고 정해진 답을 돌려주는 가짜 Ollama
    def chat(memo, names):
        items = []
        if "클라이밍" in memo:
            items.append({"person": "철수", "category": "interest", "content": "클라이밍에 빠짐", "date": ""})
        if "생일" in memo:
            items.append({"person": "영희", "category": "anniversary", "content": "생일", "date": "12월 3일"})
        if "면접" in memo:
            items.append({"person": "영희", "category": "question", "content": "면접 결과", "date": ""})
        return json.dumps({"items": items}, ensure_ascii=False)

    monkeypatch.setattr(memo_ai, "_chat", chat)


def test_full_user_flow(client, fake_ai):
    # 1) 사진을 올리면 촬영 시각과 위치가 자동으로 채워진다
    photo = upload(client, make_photo(taken_at="2026:10:20 18:30:00", gps=SSU_GPS)).json()
    assert photo["taken_at"] == "2026-10-20T18:30:00"
    assert photo["latitude"] == pytest.approx(37.4963, abs=1e-3)

    # 2) 친구 등록 (생일·메모 포함)
    chulsoo = client.post(
        "/api/persons", json={"name": "철수", "relation": "대학 동기", "contact_cycle_days": 30}
    ).json()["id"]
    younghee = client.post(
        "/api/persons", json={"name": "영희", "relation": "대학 동기", "birthday": "2003-12-03", "note": "매운 음식 못 먹음"}
    ).json()["id"]
    assert client.get(f"/api/persons/{younghee}").json()["note"] == "매운 음식 못 먹음"

    # 3) 사진에서 읽은 값으로 만남 기록
    meeting = client.post(
        "/api/meetings",
        json={
            "met_at": photo["taken_at"],
            "place_name": "숭실대 정문",
            "latitude": photo["latitude"],
            "longitude": photo["longitude"],
            "memo": "철수는 요즘 클라이밍에 빠짐. 영희 생일 12월 3일. 영희 다음 주 면접",
            "photo_path": photo["photo_path"],
            "person_ids": [chulsoo, younghee],
        },
    )
    assert meeting.status_code == 201
    mid = meeting.json()["id"]
    assert client.get(f"/api/photos/{photo['photo_path']}").status_code == 200

    # 지도와 친구 화면에서 쓰는 목록에 나온다
    assert [m["id"] for m in client.get(f"/api/meetings?person_id={chulsoo}").json()] == [mid]
    assert client.get(f"/api/persons/{chulsoo}").json()["meeting_count"] == 1

    # 4) AI 메모 분류 → 사람별 카드에 나뉘어 들어간다
    items = client.post(f"/api/meetings/{mid}/classify").json()
    assert len(items) == 3
    card_c = client.get(f"/api/persons/{chulsoo}/card").json()
    card_y = client.get(f"/api/persons/{younghee}/card").json()
    assert [i["content"] for i in card_c["interests"]] == ["클라이밍에 빠짐"]
    assert card_y["anniversaries"][0]["event_date"] == "12월 3일"
    assert [i["content"] for i in card_y["questions"]] == ["면접 결과"]

    # 5) AI가 틀린 내용은 고치고 지울 수 있다
    question = card_y["questions"][0]
    assert client.patch(f"/api/memo-items/{question['id']}", json={"content": "카카오 면접 결과"}).status_code == 200
    interest = card_c["interests"][0]
    assert client.delete(f"/api/memo-items/{interest['id']}").status_code == 204
    assert client.get(f"/api/persons/{younghee}/card").json()["questions"][0]["content"] == "카카오 면접 결과"
    assert client.get(f"/api/persons/{chulsoo}/card").json()["interests"] == []

    # 메모를 고친 뒤 다시 분류하면 이 만남의 결과를 새로 만든다
    client.patch(f"/api/meetings/{mid}", json={"memo": "철수는 요즘 클라이밍에 빠짐"})
    client.post(f"/api/meetings/{mid}/classify")
    assert client.get(f"/api/persons/{younghee}/card").json()["questions"] == []
    assert len(client.get(f"/api/persons/{chulsoo}/card").json()["interests"]) == 1

    # 6) 연락 알림: 10/20 이후 37일 → 30일 주기의 1.2배를 넘었으므로 알림 대상
    reminded = {p["name"] for p in client.get("/api/reminders?ratio=1.2").json()}
    assert "철수" in reminded
    assert client.get("/api/reminders?ratio=1.5").json() == []

    # 7) 만남을 지우면 그 만남에서 나온 카드 항목도 함께 사라진다
    assert client.delete(f"/api/meetings/{mid}").status_code == 204
    assert client.get(f"/api/persons/{chulsoo}/card").json()["interests"] == []

    # 8) 친구를 지우면 휴지통으로 가고, 복구할 수 있다
    assert client.delete(f"/api/persons/{younghee}").status_code == 204
    assert younghee not in [p["id"] for p in client.get("/api/persons").json()]
    assert younghee in [p["id"] for p in client.get("/api/persons/deleted").json()]
    assert client.post(f"/api/persons/{younghee}/restore").status_code == 200
    assert younghee in [p["id"] for p in client.get("/api/persons").json()]


def test_classify_reports_when_ollama_is_off(client, monkeypatch):
    # Ollama 가 꺼져 있으면 앱이 이유를 보여줄 수 있게 503 과 안내 문구를 돌려준다
    def off(memo, names):
        raise memo_ai.OllamaUnavailable("Ollama가 켜져 있지 않습니다")

    monkeypatch.setattr(memo_ai, "_chat", off)
    pid = client.post("/api/persons", json={"name": "철수"}).json()["id"]
    mid = client.post("/api/meetings", json={"met_at": "2026-10-20T18:30:00", "memo": "클라이밍", "person_ids": [pid]}).json()["id"]
    res = client.post(f"/api/meetings/{mid}/classify")
    assert res.status_code == 503
    assert "Ollama" in res.json()["detail"]
