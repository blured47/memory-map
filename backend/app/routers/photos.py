import io
import re
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError

from .. import schemas
from ..config import PHOTOS_DIR
from ..exif import read_photo_info

router = APIRouter(prefix="/api/photos", tags=["photos"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_SIDE = 2048  # 저장할 때 긴 변을 이 크기로 줄인다
PHOTO_NAME = re.compile(r"^[0-9a-f]{32}\.webp$")


def photo_exists(name: str) -> bool:
    return bool(PHOTO_NAME.fullmatch(name)) and (PHOTOS_DIR / name).is_file()


@router.post("", response_model=schemas.PhotoOut, status_code=status.HTTP_201_CREATED)
def upload_photo(file: UploadFile = File(...)):
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "사진은 20MB 이하만 올릴 수 있습니다")

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "사진 파일이 아니거나 읽을 수 없는 형식입니다")

    info = read_photo_info(image)

    # 날짜·위치는 DB에 따로 저장하므로, 파일은 EXIF 없이 WebP로 저장한다
    # (JPEG보다 용량이 작고, 아이폰 HEIC도 어디서나 보이며, 사진 파일에 위치가 남지 않는다)
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    name = f"{uuid.uuid4().hex}.webp"
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    image.save(PHOTOS_DIR / name, "WEBP", quality=80)

    return schemas.PhotoOut(
        photo_path=name,
        url=f"/api/photos/{name}",
        taken_at=info.taken_at,
        latitude=info.latitude,
        longitude=info.longitude,
    )


@router.get("/{name}")
def get_photo(name: str):
    if not photo_exists(name):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사진을 찾을 수 없습니다")
    return FileResponse(PHOTOS_DIR / name, media_type="image/webp")
