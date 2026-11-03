from datetime import datetime

import pytest

from app.contact import contact_status
from app.routers import persons

NOW = datetime(2026, 11, 3, 12, 0)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(persons, "_now", lambda: NOW)


def d(month, day):
    return datetime(2026, month, day, 18, 0)


def add_person(client, name, cycle=None):
    return client.post("/api/persons", json={"name": name, "contact_cycle_days": cycle}).json()["id"]


def meet(client, pid, when):
    client.post("/api/meetings", json={"met_at": when.isoformat(), "person_ids": [pid]})


def test_usual_cycle_is_average_of_meeting_intervals():
    # 10/1 → 10/11 → 10/21: 간격 10일, 10일 → 평소 주기 10일, 마지막 만남 후 13일
    status = contact_status([d(10, 1), d(10, 11), d(10, 21)], None, NOW)
    assert (status.usual_cycle_days, status.cycle_source) == (10.0, "average")
    assert status.days_since_last_met == 13
    assert status.overdue_ratio == 1.3
    assert status.needs_contact is False  # 기본 기준 1.5배는 안 넘음

    # 사용자가 기준 비율을 1.2로 낮추면 알림 대상
    assert contact_status([d(10, 1), d(10, 11), d(10, 21)], None, NOW, alert_ratio=1.2).needs_contact


def test_average_wins_over_manual_cycle_when_records_are_enough():
    status = contact_status([d(10, 1), d(10, 11), d(10, 21)], 30, NOW)
    assert status.cycle_source == "average"


def test_manual_cycle_used_when_records_are_few():
    # 만남이 두 번뿐(간격 1개)이면 사용자가 정한 주기를 쓴다
    status = contact_status([d(9, 1), d(10, 1)], 14, NOW)
    assert (status.usual_cycle_days, status.cycle_source) == (14.0, "manual")
    assert status.days_since_last_met == 33
    assert status.needs_contact is True


def test_no_cycle_means_no_alert():
    status = contact_status([d(10, 1)], None, NOW)
    assert status.usual_cycle_days is None and status.needs_contact is False


def test_same_day_meetings_count_as_one_day():
    status = contact_status([d(10, 1), d(10, 1), d(10, 11), d(10, 21)], None, NOW)
    assert status.usual_cycle_days == 10.0


def test_never_met():
    status = contact_status([], 14, NOW)
    assert status.days_since_last_met is None and status.needs_contact is False


def test_person_api_shows_contact_status(client):
    pid = add_person(client, "철수")
    for when in (d(10, 1), d(10, 11), d(10, 21)):
        meet(client, pid, when)
    p = client.get(f"/api/persons/{pid}").json()
    assert p["usual_cycle_days"] == 10.0
    assert p["cycle_source"] == "average"
    assert p["days_since_last_met"] == 13


def test_reminders_lists_overdue_people_most_overdue_first(client):
    fresh = add_person(client, "최근에 봄", 14)
    late = add_person(client, "조금 늦음", 14)
    very_late = add_person(client, "많이 늦음", 7)
    add_person(client, "만난 적 없음", 14)
    meet(client, fresh, d(11, 1))
    meet(client, late, d(10, 10))  # 24일 ÷ 14일 ≈ 1.71배
    meet(client, very_late, d(10, 6))  # 28일 ÷ 7일 = 4배

    names = [p["name"] for p in client.get("/api/reminders").json()]
    assert names == ["많이 늦음", "조금 늦음"]

    # 기준을 2배로 올리면 조금 늦은 사람은 빠진다
    names = [p["name"] for p in client.get("/api/reminders", params={"ratio": 2}).json()]
    assert names == ["많이 늦음"]
