import io
import re
import time
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import PHOTOS_DIR
from ..db import get_db
from ..exif import PhotoInfo, read_photo_info

router = APIRouter(prefix="/api/photos", tags=["photos"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_SIDE = 2048  # 저장할 때 긴 변을 이 크기로 줄인다
PHOTO_NAME = re.compile(r"^[0-9a-f]{32}\.webp$")
# 올리고 나서 만남에 붙이지 않은 사진(기록 시트를 취소한 경우)은 이만큼 지나면 지운다
ORPHAN_MAX_AGE_SECONDS = 24 * 60 * 60


def photo_exists(name: str) -> bool:
    return bool(PHOTO_NAME.fullmatch(name)) and (PHOTOS_DIR / name).is_file()


def delete_photo_file(name: str | None) -> None:
    if name and photo_exists(name):
        (PHOTOS_DIR / name).unlink(missing_ok=True)


def purge_orphan_photos(db: Session, max_age_seconds: int = ORPHAN_MAX_AGE_SECONDS) -> int:
    """어느 만남에도 쓰이지 않고 오래된 사진 파일을 지운다. 지운 개수를 돌려준다"""
    if not PHOTOS_DIR.is_dir():
        return 0
    used = set(db.scalars(select(models.Meeting.photo_path).where(models.Meeting.photo_path.is_not(None))))
    cutoff = time.time() - max_age_seconds
    removed = 0
    for path in PHOTOS_DIR.glob("*.webp"):
        if PHOTO_NAME.fullmatch(path.name) and path.name not in used and path.stat().st_mtime < cutoff:
            path.unlink(missing_ok=True)
            removed += 1
    return removed


def _to_rgb(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.split()[3])
        return background
    return image.convert("RGB")


@router.post("", response_model=schemas.PhotoOut, status_code=status.HTTP_201_CREATED)
def upload_photo(file: UploadFile = File(...), db: Session = Depends(get_db)):
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "사진은 20MB 이하만 올릴 수 있습니다")

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "사진 파일이 아니거나 읽을 수 없는 형식입니다")

    try:
        info = read_photo_info(image)
    except Exception:
        info = PhotoInfo()

    # 날짜·위치는 DB에 따로 저장하므로, 파일은 EXIF 없이 WebP로 저장한다
    # (JPEG보다 용량이 작고, 아이폰 HEIC도 어디서나 보이며, 사진 파일에 위치가 남지 않는다)
    image = _to_rgb(image)
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    name = f"{uuid.uuid4().hex}.webp"
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    image.save(PHOTOS_DIR / name, "WEBP", quality=80)
    purge_orphan_photos(db)  # 사진을 올릴 때마다 예전에 버려진 사진을 함께 정리한다

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
