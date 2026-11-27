from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..db import get_db
from ..trash import delete_meeting_forever, purge_expired
from .photos import delete_photo_file, photo_exists

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _load_people(db: Session, person_ids: list[int], existing_ids: set[int] | None = None) -> list[models.Person]:
    condition = models.Person.deleted_at.is_(None)
    if existing_ids:
        condition = or_(condition, models.Person.id.in_(existing_ids))
    people = db.scalars(select(models.Person).where(models.Person.id.in_(person_ids), condition)).all()
    missing = set(person_ids) - {p.id for p in people}
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"존재하지 않거나 삭제된 사람 id: {sorted(missing)}")
    return list(people)


def _check_photo(photo_path: str | None) -> None:
    # 사진은 먼저 POST /api/photos 로 올리고, 받은 photo_path 를 넣어야 한다
    if photo_path is not None and not photo_exists(photo_path):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"올라간 사진이 없습니다: {photo_path}")


def _cleanup_unused_photo(db: Session, photo_path: str | None) -> None:
    if not photo_path:
        return
    still_used = db.scalar(select(models.Meeting.id).where(models.Meeting.photo_path == photo_path).limit(1))
    if still_used is None:
        delete_photo_file(photo_path)


def _now() -> datetime:
    return datetime.now()


def _get_or_404(db: Session, meeting_id: int, in_trash: bool = False) -> models.Meeting:
    """in_trash=False 면 휴지통에 없는 만남만, True 면 휴지통에 있는 만남만 찾는다"""
    meeting = db.get(models.Meeting, meeting_id)
    if meeting is None or (meeting.deleted_at is not None) != in_trash:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "만남 기록을 찾을 수 없습니다")
    return meeting


@router.get("", response_model=list[schemas.MeetingOut])
def list_meetings(person_id: int | None = None, db: Session = Depends(get_db)):
    purge_expired(db, _now())
    query = (
        select(models.Meeting)
        .options(selectinload(models.Meeting.people))
        .where(models.Meeting.deleted_at.is_(None))
        .order_by(models.Meeting.met_at.desc())
    )
    if person_id is not None:
        query = query.where(models.Meeting.people.any(models.Person.id == person_id))
    return db.scalars(query).all()


@router.get("/deleted", response_model=list[schemas.MeetingOut])
def list_deleted_meetings(db: Session = Depends(get_db)):
    """휴지통: 지운 만남 (최근에 지운 순). 30일이 지나면 완전히 지워진다"""
    purge_expired(db, _now())
    query = (
        select(models.Meeting)
        .options(selectinload(models.Meeting.people))
        .where(models.Meeting.deleted_at.is_not(None))
        .order_by(models.Meeting.deleted_at.desc())
    )
    return db.scalars(query).all()


@router.post("", response_model=schemas.MeetingOut, status_code=status.HTTP_201_CREATED)
def create_meeting(body: schemas.MeetingCreate, db: Session = Depends(get_db)):
    _check_photo(body.photo_path)
    data = body.model_dump(exclude={"person_ids"})
    meeting = models.Meeting(**data, people=_load_people(db, body.person_ids))
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


@router.get("/{meeting_id}", response_model=schemas.MeetingOut)
def get_meeting(meeting_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, meeting_id)


@router.patch("/{meeting_id}", response_model=schemas.MeetingOut)
def update_meeting(meeting_id: int, body: schemas.MeetingUpdate, db: Session = Depends(get_db)):
    meeting = _get_or_404(db, meeting_id)
    data = body.model_dump(exclude_unset=True)
    _check_photo(data.get("photo_path"))
    old_photo_path = meeting.photo_path
    if "person_ids" in data:
        meeting.people = _load_people(db, data.pop("person_ids"), {p.id for p in meeting.people})
    for key, value in data.items():
        setattr(meeting, key, value)
    db.commit()
    db.refresh(meeting)
    if old_photo_path and old_photo_path != meeting.photo_path:
        _cleanup_unused_photo(db, old_photo_path)
    return meeting


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(meeting_id: int, db: Session = Depends(get_db)):
    """만남을 휴지통으로 옮긴다 (사진과 AI 카드는 복구할 때를 위해 남겨 둔다)"""
    meeting = _get_or_404(db, meeting_id)
    meeting.deleted_at = _now()
    db.commit()


@router.post("/{meeting_id}/restore", response_model=schemas.MeetingOut)
def restore_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = _get_or_404(db, meeting_id, in_trash=True)
    meeting.deleted_at = None
    db.commit()
    db.refresh(meeting)
    return meeting


@router.delete("/{meeting_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def permanent_delete_meeting(meeting_id: int, db: Session = Depends(get_db)):
    """휴지통의 만남을 완전히 지운다 (사진, AI 카드 포함)"""
    delete_meeting_forever(db, _get_or_404(db, meeting_id, in_trash=True))
