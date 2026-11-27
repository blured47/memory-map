"""휴지통과 영구 삭제 규칙 (친구·만남 공통)

- 친구와 만남은 지우면 휴지통으로 가고, TRASH_DAYS 일이 지나면 완전히 지운다
- 친구를 완전히 지우면
  - 그 친구와만 한 만남은 함께 완전히 지운다 (사진, AI 카드 포함)
  - 다른 친구도 있던 만남은 남기고, 지운 친구는 '삭제한 친구'로만 표시한다 (이름은 남기지 않는다)
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .routers.photos import delete_photo_file

TRASH_DAYS = 30


def _delete_unused_photos(db: Session, photo_paths: set[str]) -> None:
    # 같은 사진을 쓰는 다른 만남이 없을 때만 파일을 지운다 (DB 커밋 뒤에 호출)
    for path in photo_paths:
        still_used = db.scalar(select(models.Meeting.id).where(models.Meeting.photo_path == path).limit(1))
        if still_used is None:
            delete_photo_file(path)


def _drop_meeting(db: Session, meeting: models.Meeting, photos: set[str]) -> None:
    if meeting.photo_path:
        photos.add(meeting.photo_path)
    db.delete(meeting)


def _drop_person(db: Session, person: models.Person, photos: set[str]) -> None:
    for meeting in list(person.meetings):
        if meeting in db.deleted:  # 함께 지우는 다른 친구 때문에 이미 지워지는 만남
            continue
        # 같이 지우는 중인 친구는 남은 사람으로 치지 않는다
        others = [p for p in meeting.people if p.id != person.id and p not in db.deleted]
        if others:
            meeting.removed_people = (meeting.removed_people or 0) + 1
        else:
            _drop_meeting(db, meeting, photos)
    db.delete(person)


def delete_meeting_forever(db: Session, meeting: models.Meeting) -> None:
    photos: set[str] = set()
    _drop_meeting(db, meeting, photos)
    db.commit()
    _delete_unused_photos(db, photos)


def delete_person_forever(db: Session, person: models.Person) -> None:
    photos: set[str] = set()
    _drop_person(db, person, photos)
    db.commit()
    _delete_unused_photos(db, photos)


def purge_expired(db: Session, now: datetime) -> None:
    """휴지통에 들어간 지 TRASH_DAYS 일이 지난 친구·만남을 완전히 지운다"""
    cutoff = now - timedelta(days=TRASH_DAYS)
    persons = db.scalars(
        select(models.Person).where(models.Person.deleted_at.is_not(None), models.Person.deleted_at <= cutoff)
    ).all()
    meetings = db.scalars(
        select(models.Meeting).where(models.Meeting.deleted_at.is_not(None), models.Meeting.deleted_at <= cutoff)
    ).all()
    if not persons and not meetings:
        return
    photos: set[str] = set()
    for person in persons:
        _drop_person(db, person, photos)
    for meeting in meetings:
        if meeting not in db.deleted:  # 위에서 친구와 함께 이미 지워졌을 수 있다
            _drop_meeting(db, meeting, photos)
    db.commit()
    _delete_unused_photos(db, photos)
