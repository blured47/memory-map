def test_person_crud(client):
    r = client.post("/api/persons", json={"name": "김철수", "relation": "대학 동기"})
    assert r.status_code == 201
    pid = r.json()["id"]

    assert client.get("/api/persons").json()[0]["name"] == "김철수"

    r = client.patch(f"/api/persons/{pid}", json={"contact_cycle_days": 30})
    assert r.json()["contact_cycle_days"] == 30

    assert client.delete(f"/api/persons/{pid}").status_code == 204
    assert client.get(f"/api/persons/{pid}").status_code == 404


def test_meeting_with_multiple_people(client):
    a = client.post("/api/persons", json={"name": "A"}).json()["id"]
    b = client.post("/api/persons", json={"name": "B"}).json()["id"]

    r = client.post("/api/meetings", json={
        "met_at": "2026-10-20T18:30:00",
        "place_name": "숭실대 정문",
        "latitude": 37.4963,
        "longitude": 126.9575,
        "memo": "A는 요즘 클라이밍에 빠짐. B 생일 12월 3일",
        "person_ids": [a, b],
    })
    assert r.status_code == 201
    mid = r.json()["id"]
    assert {p["name"] for p in r.json()["people"]} == {"A", "B"}

    person = client.get(f"/api/persons/{a}").json()
    assert person["meeting_count"] == 1
    assert person["last_met_at"].startswith("2026-10-20")

    assert len(client.get(f"/api/meetings?person_id={b}").json()) == 1

    r = client.patch(f"/api/meetings/{mid}", json={"person_ids": [a]})
    assert [p["name"] for p in r.json()["people"]] == ["A"]

    assert client.delete(f"/api/meetings/{mid}").status_code == 204


def test_meeting_rejects_unknown_person(client):
    r = client.post("/api/meetings", json={"met_at": "2026-10-20T18:30:00", "person_ids": [999]})
    assert r.status_code == 400
