from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _load_people(db: Session, person_ids: list[int]) -> list[models.Person]:
    people = db.scalars(select(models.Person).where(models.Person.id.in_(person_ids))).all()
    missing = set(person_ids) - {p.id for p in people}
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"존재하지 않는 사람 id: {sorted(missing)}")
    return list(people)


def _get_or_404(db: Session, meeting_id: int) -> models.Meeting:
    meeting = db.get(models.Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "만남 기록을 찾을 수 없습니다")
    return meeting


@router.get("", response_model=list[schemas.MeetingOut])
def list_meetings(person_id: int | None = None, db: Session = Depends(get_db)):
    query = select(models.Meeting).order_by(models.Meeting.met_at.desc())
    if person_id is not None:
        query = query.where(models.Meeting.people.any(models.Person.id == person_id))
    return db.scalars(query).all()


@router.post("", response_model=schemas.MeetingOut, status_code=status.HTTP_201_CREATED)
def create_meeting(body: schemas.MeetingCreate, db: Session = Depends(get_db)):
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
    if "person_ids" in data:
        meeting.people = _load_people(db, data.pop("person_ids"))
    for key, value in data.items():
        setattr(meeting, key, value)
    db.commit()
    db.refresh(meeting)
    return meeting


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(meeting_id: int, db: Session = Depends(get_db)):
    db.delete(_get_or_404(db, meeting_id))
    db.commit()
