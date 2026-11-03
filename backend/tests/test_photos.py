import io

from PIL import Image

from app.exif import DATETIME_ORIGINAL, EXIF_IFD, GPS_IFD


def make_photo(fmt="JPEG", taken_at=None, gps=None) -> bytes:
    # 숭실대 정문 근처 좌표: 37°29'46.68"N, 126°57'27.0"E ≈ (37.4963, 126.9575)
    image = Image.new("RGB", (64, 48), "orange")
    exif = image.getexif()
    if taken_at:
        exif.get_ifd(EXIF_IFD)[DATETIME_ORIGINAL] = taken_at
    if gps:
        exif.get_ifd(GPS_IFD).update(gps)
    buf = io.BytesIO()
    image.save(buf, fmt, exif=exif)
    return buf.getvalue()


SSU_GPS = {1: "N", 2: (37.0, 29.0, 46.68), 3: "E", 4: (126.0, 57.0, 27.0)}


def upload(client, data: bytes, name="photo.jpg"):
    return client.post("/api/photos", files={"file": (name, data, "image/jpeg")})


def test_upload_reads_time_and_location(client):
    res = upload(client, make_photo(taken_at="2026:10:20 18:30:00", gps=SSU_GPS))
    assert res.status_code == 201
    body = res.json()
    assert body["taken_at"] == "2026-10-20T18:30:00"
    assert abs(body["latitude"] - 37.4963) < 0.0001
    assert abs(body["longitude"] - 126.9575) < 0.0001

    # 저장된 사진은 다시 받을 수 있고, 위치 정보는 지워져 있다
    saved = client.get(body["url"])
    assert saved.status_code == 200
    assert saved.headers["content-type"] == "image/webp"
    assert not Image.open(io.BytesIO(saved.content)).getexif().get_ifd(GPS_IFD)


def test_upload_heic_from_iphone(client):
    res = upload(client, make_photo("HEIF", "2026:10:21 12:00:00", SSU_GPS), "IMG_0001.HEIC")
    assert res.status_code == 201
    body = res.json()
    assert body["taken_at"] == "2026-10-21T12:00:00"
    assert body["latitude"] is not None


def test_photo_without_exif_still_uploads(client):
    res = upload(client, make_photo())
    assert res.status_code == 201
    body = res.json()
    assert body["taken_at"] is None
    assert body["latitude"] is None and body["longitude"] is None


def test_southern_western_hemisphere_is_negative(client):
    gps = {1: "S", 2: (33.0, 52.0, 0.0), 3: "W", 4: (151.0, 12.0, 0.0)}
    body = upload(client, make_photo(gps=gps)).json()
    assert body["latitude"] < 0 and body["longitude"] < 0


def test_not_an_image_is_rejected(client):
    res = upload(client, b"this is not a photo", "note.txt")
    assert res.status_code == 400


def test_unknown_photo_is_404(client):
    assert client.get("/api/photos/" + "0" * 32 + ".webp").status_code == 404
    assert client.get("/api/photos/..%2Fmemorymap.db").status_code == 404


def test_meeting_with_uploaded_photo(client):
    person = client.post("/api/persons", json={"name": "테스트"}).json()
    photo = upload(client, make_photo(taken_at="2026:10:20 18:30:00", gps=SSU_GPS)).json()

    res = client.post(
        "/api/meetings",
        json={
            "met_at": photo["taken_at"],
            "latitude": photo["latitude"],
            "longitude": photo["longitude"],
            "photo_path": photo["photo_path"],
            "person_ids": [person["id"]],
        },
    )
    assert res.status_code == 201
    assert res.json()["photo_path"] == photo["photo_path"]

    bad = client.post(
        "/api/meetings",
        json={"met_at": "2026-10-20T18:30:00", "photo_path": "nope.jpg", "person_ids": [person["id"]]},
    )
    assert bad.status_code == 400
