def test_person_crud(client):
    r = client.post("/api/persons", json={"name": "김철수", "relation": "대학 동기"})
    assert r.status_code == 201
    pid = r.json()["id"]

    assert client.get("/api/persons").json()[0]["name"] == "김철수"

    r = client.patch(f"/api/persons/{pid}", json={"contact_cycle_days": 30})
    assert r.json()["contact_cycle_days"] == 30

    assert client.delete(f"/api/persons/{pid}").status_code == 204
    assert client.get(f"/api/persons/{pid}").status_code == 404

    # 휴지통 목록에 나타나는지 확인
    deleted = client.get("/api/persons/deleted").json()
    assert any(p["id"] == pid for p in deleted)

    # 복구 테스트
    r_restore = client.post(f"/api/persons/{pid}/restore")
    assert r_restore.status_code == 200
    assert client.get(f"/api/persons/{pid}").status_code == 200

    # 영구 완전 삭제 테스트
    client.delete(f"/api/persons/{pid}")  # 다시 소프트 삭제
    assert client.delete(f"/api/persons/{pid}/permanent").status_code == 204
    assert not any(p["id"] == pid for p in client.get("/api/persons/deleted").json())


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
