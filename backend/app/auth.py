import secrets

from fastapi import HTTPException, Request, status

from .config import API_TOKEN


def require_token(request: Request) -> None:
    """MEMORYMAP_API_TOKEN 이 설정돼 있으면 요청마다 같은 토큰을 확인한다.

    앱은 `Authorization: Bearer <토큰>` 헤더로 보낸다.
    지도(WebView)와 <Image> 는 헤더를 붙일 수 없어 사진 주소에는 `?token=` 으로 붙여도 된다.
    """
    if not API_TOKEN:
        return
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else request.query_params.get("token", "")
    # 글자 수·내용으로 시간을 재 토큰을 추측하지 못하게 일정한 시간으로 비교한다
    if not secrets.compare_digest(token.encode(), API_TOKEN.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "접근 토큰이 맞지 않습니다. 앱의 서버 설정에서 토큰을 확인하세요")
