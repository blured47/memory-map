from dataclasses import dataclass
from datetime import datetime
import math

from PIL import Image
from pillow_heif import register_heif_opener

# 아이폰 기본 사진 형식(HEIC)도 열 수 있게 등록
register_heif_opener()

EXIF_IFD = 0x8769
GPS_IFD = 0x8825
DATETIME_ORIGINAL = 36867  # 촬영 시각
DATETIME = 306  # 파일 수정 시각 (촬영 시각이 없을 때 대신 사용)


@dataclass
class PhotoInfo:
    taken_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None


def _decode_text(value) -> str:
    if isinstance(value, bytes):
        return value.decode("ascii", errors="ignore")
    return str(value)


def _parse_datetime(value) -> datetime | None:
    # EXIF 시각 형식: "2026:10:20 18:30:00" (일부 기기는 '-' 구분이나 밀리초·시간대가 붙기도 함)
    text = _decode_text(value).strip("\x00 ")
    if len(text) > 19 and text[19] in (".", "+", "-", "Z"):
        text = text[:19]
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _to_degrees(dms, ref) -> float | None:
    # (도, 분, 초) → 소수 좌표. 남위(S)·서경(W)은 음수
    try:
        degrees = float(dms[0]) + float(dms[1]) / 60 + float(dms[2]) / 3600
    except (TypeError, ValueError, IndexError, ZeroDivisionError):
        return None
    if not math.isfinite(degrees):
        return None
    return -degrees if _decode_text(ref).strip("\x00 ").upper().startswith(("S", "W")) else degrees


def read_photo_info(image: Image.Image) -> PhotoInfo:
    exif = image.getexif()
    info = PhotoInfo()

    raw_time = exif.get_ifd(EXIF_IFD).get(DATETIME_ORIGINAL) or exif.get(DATETIME)
    if raw_time:
        info.taken_at = _parse_datetime(raw_time)

    gps = exif.get_ifd(GPS_IFD)
    if 2 in gps and 4 in gps:
        lat = _to_degrees(gps[2], gps.get(1, "N"))
        lon = _to_degrees(gps[4], gps.get(3, "E"))
        # (0, 0)은 위치가 비어 있는 사진에서 흔히 들어가는 값이라 없는 것으로 본다
        if lat is not None and lon is not None and (lat, lon) != (0.0, 0.0):
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                info.latitude, info.longitude = round(lat, 6), round(lon, 6)

    return info
