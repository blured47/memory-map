from dataclasses import dataclass
from datetime import datetime

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


def _parse_datetime(value) -> datetime | None:
    # EXIF 시각 형식: "2026:10:20 18:30:00"
    try:
        return datetime.strptime(str(value).strip("\x00 "), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None


def _to_degrees(dms, ref) -> float | None:
    # (도, 분, 초) → 소수 좌표. 남위(S)·서경(W)은 음수
    try:
        degrees = float(dms[0]) + float(dms[1]) / 60 + float(dms[2]) / 3600
    except (TypeError, ValueError, IndexError, ZeroDivisionError):
        return None
    return -degrees if str(ref).upper().startswith(("S", "W")) else degrees


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
