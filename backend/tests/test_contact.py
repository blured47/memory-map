from datetime import datetime, timedelta

import pytest

from app.contact import contact_status
from app.routers import persons

NOW = datetime(2026, 11, 3, 12, 0)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(persons, "_now", lambda: NOW)


def add_person(client, name, cycle=None):
    return client.post("/api/persons", json={"name": name, "contact_cycle_days": cycle}).json()["id"]


def meet(client, pid, when):
    client.post("/api/meetings", json={"met_at": when, "person_ids": [pid]})


@pytest.mark.parametrize(
    "days, cycle, temperature, needs_contact",
    [
        (3, 14, "hot", False),
        (10, 14, "warm", False),
        (21, 14, "cool", True),  # 2주마다 보는데 3주째 못 봄
        (21, 365, "hot", False),  # 1년에 한 번 보는 사이면 3주는 괜찮음
        (60, 14, "cold", True),
        (45, None, "cool", True),  # 주기를 안 정하면 30일 기준
    ],
)
def test_temperature_depends_on_each_persons_cycle(days, cycle, temperature, needs_contact):
    status = contact_status(NOW.replace(hour=18) - timedelta(days=days), cycle, NOW)
    assert status.days_since_last_met == days
    assert status.temperature == temperature
    assert status.needs_contact is needs_contact


def test_never_met_has_no_temperature():
    status = contact_status(None, 14, NOW)
    assert status.temperature is None and status.needs_contact is False


def test_person_uses_most_recent_meeting(client):
    # 같은 날 처음 만났어도, 그 뒤에 또 만난 사람은 더 따뜻해야 한다
    a = add_person(client, "자주 보는 친구", 14)
    b = add_person(client, "한 번 본 친구", 14)
    meet(client, a, "2026-09-01T18:00:00")
    meet(client, b, "2026-09-01T18:00:00")
    meet(client, a, "2026-10-31T18:00:00")

    pa = client.get(f"/api/persons/{a}").json()
    pb = client.get(f"/api/persons/{b}").json()
    assert (pa["temperature"], pa["days_since_last_met"]) == ("hot", 3)
    assert (pb["temperature"], pb["needs_contact"]) == ("cold", True)


def test_reminders_lists_only_overdue_people_most_overdue_first(client):
    fresh = add_person(client, "최근", 14)
    late = add_person(client, "조금 늦음", 14)
    very_late = add_person(client, "많이 늦음", 7)
    add_person(client, "만난 적 없음", 14)
    meet(client, fresh, "2026-11-01T12:00:00")
    meet(client, late, "2026-10-13T12:00:00")
    meet(client, very_late, "2026-10-06T12:00:00")

    names = [p["name"] for p in client.get("/api/reminders").json()]
    assert names == ["많이 늦음", "조금 늦음"]
