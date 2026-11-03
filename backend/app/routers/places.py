from fastapi import APIRouter, HTTPException, Query, status

from .. import kakao, schemas

router = APIRouter(prefix="/api/places", tags=["places"])

LAT = Query(ge=-90, le=90, description="위도")
LON = Query(ge=-180, le=180, description="경도")


def _call(fn, *args):
    try:
        return fn(*args)
    except kakao.KakaoKeyMissing as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except kakao.KakaoError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))


@router.get("/nearby", response_model=schemas.NearbyOut)
def nearby(
    lat: float = LAT,
    lon: float = LON,
    radius: int = Query(150, ge=10, le=1000, description="검색 반경(m)"),
    limit: int = Query(15, ge=1, le=50),
):
    """사진 위치 주변 장소 후보. 앱에서 이 중 하나를 골라 만남 장소로 쓴다"""
    addr = _call(kakao.address_of, lat, lon)
    return schemas.NearbyOut(
        address=addr and addr["address"],
        building_name=addr and addr["building_name"],
        places=_call(kakao.nearby_places, lat, lon, radius, limit),
    )


@router.get("/search", response_model=list[schemas.Place])
def search(
    query: str = Query(min_length=1, max_length=100, description="검색어 (예: 숭실대 카페)"),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    limit: int = Query(15, ge=1, le=15),
):
    """후보에 원하는 장소가 없을 때 직접 검색"""
    return _call(kakao.search_places, query, lat, lon, limit)
