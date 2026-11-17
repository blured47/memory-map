import httpx

from .config import KAKAO_REST_KEY

API = "https://dapi.kakao.com"

# 만남 장소로 나올 만한 카카오 장소 분류
# FD6 음식점, CE7 카페, AT4 관광명소, CT1 문화시설, SC4 학교, AD5 숙박
NEARBY_CATEGORIES = ["FD6", "CE7", "AT4", "CT1", "SC4", "AD5"]


class KakaoError(Exception):
    pass


class KakaoKeyMissing(KakaoError):
    pass


def _get(path: str, params: dict) -> dict:
    if not KAKAO_REST_KEY:
        raise KakaoKeyMissing("카카오 REST 키가 설정되지 않았습니다 (.env 의 KAKAO_REST_KEY)")
    try:
        res = httpx.get(
            API + path,
            params=params,
            headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"},
            timeout=5,
        )
    except httpx.HTTPError as e:
        raise KakaoError(f"카카오 서버에 연결하지 못했습니다: {e}") from e
    if res.status_code != 200:
        raise KakaoError(f"카카오 API 오류 ({res.status_code}): {res.text[:200]}")
    return res.json()


def _to_place(doc: dict) -> dict:
    return {
        "kakao_id": doc["id"],
        "name": doc["place_name"],
        "category": doc.get("category_group_name") or doc.get("category_name", "").split(" > ")[-1],
        "address": doc.get("road_address_name") or doc.get("address_name"),
        "latitude": float(doc["y"]),
        "longitude": float(doc["x"]),
        "distance": int(doc["distance"]) if doc.get("distance") else None,
        "url": doc.get("place_url"),
    }


def address_of(lat: float, lon: float) -> dict | None:
    """좌표 → 주소와 건물 이름"""
    docs = _get("/v2/local/geo/coord2address.json", {"x": lon, "y": lat})["documents"]
    if not docs:
        return None
    road, jibun = docs[0].get("road_address"), docs[0].get("address")
    return {
        "address": (road or jibun or {}).get("address_name"),
        "building_name": (road or {}).get("building_name") or None,
    }


def nearby_places(lat: float, lon: float, radius: int, limit: int) -> list[dict]:
    """좌표 주변 장소를 가까운 순으로"""
    places: dict[str, dict] = {}
    for code in NEARBY_CATEGORIES:
        params = {"category_group_code": code, "x": lon, "y": lat, "radius": radius, "sort": "distance", "size": 15}
        for doc in _get("/v2/local/search/category.json", params)["documents"]:
            places.setdefault(doc["id"], _to_place(doc))
    return sorted(places.values(), key=lambda p: p["distance"] if p["distance"] is not None else 1e9)[:limit]


# 주소 검색 결과는 장소 목록 위에 이만큼만 붙인다
ADDRESS_LIMIT = 3


def _address_to_place(doc: dict) -> dict:
    return {
        "kakao_id": f"address:{doc['address_name']}",
        "name": doc["address_name"],
        "category": "지역" if doc.get("address_type") == "REGION" else "주소",
        "address": None,
        "latitude": float(doc["y"]),
        "longitude": float(doc["x"]),
        "distance": None,
        "url": None,
    }


def search_addresses(query: str) -> list[dict]:
    """동네·주소 검색 (예: 양천구, 인계동 → 그 지역 중심 좌표)"""
    params = {"query": query, "analyze_type": "similar", "size": ADDRESS_LIMIT}
    return [_address_to_place(doc) for doc in _get("/v2/local/search/address.json", params)["documents"]]


def search_places(query: str, lat: float | None, lon: float | None, limit: int) -> list[dict]:
    """동네·주소와 맞는 지역을 먼저, 이어서 키워드로 찾은 장소. 좌표가 있으면 장소는 가까운 순"""
    params: dict = {"query": query, "size": min(limit, 15)}
    if lat is not None and lon is not None:
        params.update({"x": lon, "y": lat, "sort": "distance"})
    places = [_to_place(doc) for doc in _get("/v2/local/search/keyword.json", params)["documents"]]
    return (search_addresses(query) + places)[:limit]
