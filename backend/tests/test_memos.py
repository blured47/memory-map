import json

import pytest

from app import memo_ai


def setup_meeting(client, memo="철수는 클라이밍에 빠짐. 영희 생일 12월 3일"):
    a = client.post("/api/persons", json={"name": "철수"}).json()["id"]
    b = client.post("/api/persons", json={"name": "영희"}).json()["id"]
    res = client.post("/api/meetings", json={"met_at": "2026-10-20T18:30:00", "memo": memo, "person_ids": [a, b]})
    return a, b, res.json()["id"]


@pytest.fixture
def fake_ai(monkeypatch):
    # 실제 Ollama 대신 쓰는 가짜 응답
    answer = {
        "items": [
            {"person": "철수", "category": "interest", "content": "클라이밍에 빠짐", "date": ""},
            {"person": "영희", "category": "anniversary", "content": "생일", "date": "12월 3일"},
            {"person": "철수", "category": "interest", "content": "클라이밍에 빠짐", "date": ""},  # 중복
            {"person": "없는사람", "category": "interest", "content": "지어낸 내용", "date": ""},
            {"person": "영희", "category": "이상한분류", "content": "잘못된 분류", "date": ""},
        ]
    }
    monkeypatch.setattr(memo_ai, "_chat", lambda memo, names: json.dumps(answer, ensure_ascii=False))


def test_classify_splits_items_to_each_persons_card(client, fake_ai):
    a, b, mid = setup_meeting(client)
    res = client.post(f"/api/meetings/{mid}/classify")
    assert res.status_code == 200
    assert len(res.json()) == 2  # 중복·없는 사람·잘못된 분류는 버린다

    card_a = client.get(f"/api/persons/{a}/card").json()
    card_b = client.get(f"/api/persons/{b}/card").json()
    assert [i["content"] for i in card_a["interests"]] == ["클라이밍에 빠짐"]
    assert card_a["anniversaries"] == []
    assert card_b["anniversaries"][0]["event_date"] == "12월 3일"


def test_classify_again_replaces_previous_result(client, fake_ai):
    a, _, mid = setup_meeting(client)
    client.post(f"/api/meetings/{mid}/classify")
    client.post(f"/api/meetings/{mid}/classify")
    assert len(client.get(f"/api/persons/{a}/card").json()["interests"]) == 1


def test_user_can_fix_or_delete_item(client, fake_ai):
    a, _, mid = setup_meeting(client)
    item = client.post(f"/api/meetings/{mid}/classify").json()[0]

    res = client.patch(f"/api/memo-items/{item['id']}", json={"category": "question", "content": "클라이밍 대회 결과"})
    assert res.json()["category"] == "question"
    assert client.get(f"/api/persons/{a}/card").json()["questions"][0]["content"] == "클라이밍 대회 결과"

    assert client.patch(f"/api/memo-items/{item['id']}", json={"category": "이상한분류"}).status_code == 422
    assert client.delete(f"/api/memo-items/{item['id']}").status_code == 204
    assert client.get(f"/api/persons/{a}/card").json()["questions"] == []


def test_deleting_meeting_removes_its_items(client, fake_ai):
    a, _, mid = setup_meeting(client)
    client.post(f"/api/meetings/{mid}/classify")
    client.delete(f"/api/meetings/{mid}")
    assert client.get(f"/api/persons/{a}/card").json()["interests"] == []


def test_empty_memo_is_rejected(client):
    _, _, mid = setup_meeting(client, memo="  ")
    assert client.post(f"/api/meetings/{mid}/classify").status_code == 400


def test_ollama_off_gives_clear_error(client, monkeypatch):
    def off(memo, names):
        raise memo_ai.OllamaUnavailable("Ollama가 켜져 있지 않습니다")

    monkeypatch.setattr(memo_ai, "_chat", off)
    _, _, mid = setup_meeting(client)
    res = client.post(f"/api/meetings/{mid}/classify")
    assert res.status_code == 503
    assert "Ollama" in res.json()["detail"]


def test_broken_ai_answer_gives_502(client, monkeypatch):
    monkeypatch.setattr(memo_ai, "_chat", lambda memo, names: "이건 JSON이 아님")
    _, _, mid = setup_meeting(client)
    assert client.post(f"/api/meetings/{mid}/classify").status_code == 502
