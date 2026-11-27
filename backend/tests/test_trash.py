"""만남 휴지통과, 친구를 완전히 지울 때 만남을 정리하는 규칙 (app/trash.py)"""

from datetime import datetime, timedelta

import pytest

from app.config import PHOTOS_DIR
from app.routers import meetings, persons
from tests.test_photos import make_photo, upload

NOW = datetime(2026, 11, 27, 12, 0)


@pytest.fixture
def clock(monkeypatch):
    # 지운 시각과 '오늘'을 마음대로 옮길 수 있게 한다
    state = {"now": NOW}
    monkeypatch.setattr(persons, "_now", lambda: state["now"])
    monkeypatch.setattr(meetings, "_now", lambda: state["now"])
    return state


def person(client, name):
    return client.post("/api/persons", json={"name": name}).json()["id"]


def meeting(client, *pids, memo=None, photo=None):
    body = {"met_at": "2026-11-01T18:00:00", "person_ids": list(pids), "memo": memo, "photo_path": photo}
    return client.post("/api/meetings", json=body).json()["id"]


def meeting_ids(client, path="/api/meetings"):
    return [m["id"] for m in client.get(path).json()]


# ---------- 만남 휴지통 ----------

def test_deleted_meeting_goes_to_trash_and_can_be_restored(client, clock):
    a = person(client, "철수")
    mid = meeting(client, a)

    assert client.delete(f"/api/meetings/{mid}").status_code == 204
    assert mid not in meeting_ids(client)
    assert mid in meeting_ids(client, "/api/meetings/deleted")
    # 휴지통의 만남은 만남 횟수에 들어가지 않는다
    assert client.get(f"/api/persons/{a}").json()["meeting_count"] == 0
    # 휴지통의 만남은 고치거나 다시 지울 수 없다
    assert client.patch(f"/api/meetings/{mid}", json={"memo": "x"}).status_code == 404

    restored = client.post(f"/api/meetings/{mid}/restore")
    assert restored.status_code == 200 and restored.json()["deleted_at"] is None
    assert mid in meeting_ids(client)
    assert client.get(f"/api/persons/{a}").json()["meeting_count"] == 1


def test_only_trashed_meeting_can_be_deleted_forever(client, clock):
    mid = meeting(client, person(client, "철수"))
    assert client.delete(f"/api/meetings/{mid}/permanent").status_code == 404  # 먼저 휴지통으로
    client.delete(f"/api/meetings/{mid}")
    assert client.delete(f"/api/meetings/{mid}/permanent").status_code == 204
    assert mid not in meeting_ids(client, "/api/meetings/deleted")


def test_trashed_meeting_is_purged_after_30_days(client, clock):
    pid = person(client, "철수")
    photo = upload(client, make_photo()).json()["photo_path"]
    mid = meeting(client, pid, photo=photo)
    client.delete(f"/api/meetings/{mid}")

    clock["now"] = NOW + timedelta(days=29)
    assert mid in meeting_ids(client, "/api/meetings/deleted")

    clock["now"] = NOW + timedelta(days=30)
    assert mid not in meeting_ids(client, "/api/meetings/deleted")
    assert not (PHOTOS_DIR / photo).exists()


def test_trashed_meeting_items_hidden_from_card(client, clock, monkeypatch):
    from app import memo_ai

    monkeypatch.setattr(
        memo_ai, "_chat",
        lambda memo, names: '{"items": [{"person": "철수", "category": "interest", "content": "클라이밍", "date": ""}]}',
    )
    pid = person(client, "철수")
    mid = meeting(client, pid, memo="철수 클라이밍")
    client.post(f"/api/meetings/{mid}/classify")
    client.delete(f"/api/meetings/{mid}")
    assert client.get(f"/api/persons/{pid}/card").json()["interests"] == []
    client.post(f"/api/meetings/{mid}/restore")
    assert len(client.get(f"/api/persons/{pid}/card").json()["interests"]) == 1  # 복구하면 AI 카드도 돌아온다


# ---------- 친구를 완전히 지울 때 ----------

def test_deleting_friend_forever_removes_solo_meetings_and_keeps_shared(client, clock):
    a, b = person(client, "철수"), person(client, "영희")
    photo = upload(client, make_photo()).json()["photo_path"]
    solo = meeting(client, a, photo=photo)
    shared = meeting(client, a, b)
    other = meeting(client, b)

    client.delete(f"/api/persons/{a}")
    assert client.delete(f"/api/persons/{a}/permanent").status_code == 204

    ids = meeting_ids(client)
    assert solo not in ids and not (PHOTOS_DIR / photo).exists()  # 철수와만 한 만남은 사진까지 지운다
    assert other in ids
    kept = client.get(f"/api/meetings/{shared}").json()
    assert [p["name"] for p in kept["people"]] == ["영희"]  # 지운 친구의 이름은 남지 않는다
    assert kept["removed_people"] == 1  # 앱에서 '삭제한 친구'로 표시


def test_solo_meeting_in_trash_is_also_removed_with_friend(client, clock):
    a = person(client, "철수")
    mid = meeting(client, a)
    client.delete(f"/api/meetings/{mid}")
    client.delete(f"/api/persons/{a}")
    client.delete(f"/api/persons/{a}/permanent")
    assert mid not in meeting_ids(client, "/api/meetings/deleted")


def test_friend_purged_after_30_days_follows_same_rule(client, clock):
    a, b = person(client, "철수"), person(client, "영희")
    solo, shared = meeting(client, a), meeting(client, a, b)
    client.delete(f"/api/persons/{a}")

    clock["now"] = NOW + timedelta(days=30)
    assert a not in [p["id"] for p in client.get("/api/persons/deleted").json()]
    assert solo not in meeting_ids(client)
    assert client.get(f"/api/meetings/{shared}").json()["removed_people"] == 1


def test_two_friends_of_same_meeting_purged_together(client, clock):
    # 함께 만난 두 친구가 같은 날 만료되면 사람 없는 만남이 남지 않아야 한다
    a, b = person(client, "철수"), person(client, "영희")
    shared = meeting(client, a, b)
    client.delete(f"/api/persons/{a}")
    client.delete(f"/api/persons/{b}")

    clock["now"] = NOW + timedelta(days=31)
    client.get("/api/persons")
    assert shared not in meeting_ids(client)
    assert shared not in meeting_ids(client, "/api/meetings/deleted")
