import pytest

from app import kakao

# 실제 카카오 서버 대신 쓰는 가짜 응답 (카카오 로컬 API 응답 형식)
CAFE = {
    "id": "1", "place_name": "숭실 카페", "category_group_name": "카페",
    "road_address_name": "서울 동작구 상도로 369", "x": "126.9575", "y": "37.4963",
    "distance": "40", "place_url": "http://place.map.kakao.com/1",
}
SCHOOL = {
    "id": "2", "place_name": "숭실대학교", "category_group_name": "학교",
    "address_name": "서울 동작구 상도동 511", "x": "126.9573", "y": "37.4964", "distance": "10",
}
REGION = {
    "address_name": "경기 수원시 팔달구 인계동", "address_type": "REGION", "x": "127.0300", "y": "37.2650",
}


@pytest.fixture
def fake_kakao(monkeypatch):
    calls = []

    def fake_get(path, params):
        calls.append((path, params))
        if path.endswith("coord2address.json"):
            return {"documents": [{
                "road_address": {"address_name": "서울 동작구 상도로 369", "building_name": "숭실대학교"},
                "address": {"address_name": "서울 동작구 상도동 511"},
            }]}
        if path.endswith("category.json"):
            # 같은 장소가 여러 분류에서 나와도 한 번만 보여야 한다
            return {"documents": {"CE7": [CAFE], "SC4": [SCHOOL, CAFE]}.get(params["category_group_code"], [])}
        if path.endswith("keyword.json"):
            return {"documents": [CAFE]}
        if path.endswith("address.json"):
            return {"documents": [REGION] if params["query"] == "인계동" else []}
        raise AssertionError(path)

    monkeypatch.setattr(kakao, "_get", fake_get)
    return calls


def test_nearby_returns_address_and_places_by_distance(client, fake_kakao):
    res = client.get("/api/places/nearby", params={"lat": 37.4963, "lon": 126.9575})
    assert res.status_code == 200
    body = res.json()
    assert body["address"] == "서울 동작구 상도로 369"
    assert body["building_name"] == "숭실대학교"
    assert [p["name"] for p in body["places"]] == ["숭실대학교", "숭실 카페"]
    assert body["places"][1]["distance"] == 40
    assert body["places"][0]["address"] == "서울 동작구 상도동 511"


def test_search_by_keyword_near_location(client, fake_kakao):
    res = client.get("/api/places/search", params={"query": "카페", "lat": 37.4963, "lon": 126.9575})
    assert res.status_code == 200
    assert res.json()[0]["name"] == "숭실 카페"
    params = next(params for path, params in fake_kakao if path.endswith("keyword.json"))
    assert params["sort"] == "distance" and params["x"] == 126.9575


def test_bad_coordinates_are_rejected(client, fake_kakao):
    assert client.get("/api/places/nearby", params={"lat": 100, "lon": 126.9}).status_code == 422
    assert fake_kakao == []


def test_missing_key_gives_clear_error(client, monkeypatch):
    monkeypatch.setattr(kakao, "KAKAO_REST_KEY", "")
    res = client.get("/api/places/search", params={"query": "카페"})
    assert res.status_code == 503
    assert "KAKAO_REST_KEY" in res.json()["detail"]


def test_search_puts_matching_region_first(client, fake_kakao):
    res = client.get("/api/places/search", params={"query": "인계동"})
    assert res.status_code == 200
    body = res.json()
    assert [p["name"] for p in body] == ["경기 수원시 팔달구 인계동", "숭실 카페"]
    assert body[0]["category"] == "지역"
    assert body[0]["latitude"] == 37.265
