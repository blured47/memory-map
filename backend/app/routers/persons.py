from dataclasses import asdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..contact import DEFAULT_ALERT_RATIO, contact_status
from ..db import get_db

router = APIRouter(prefix="/api/persons", tags=["persons"])
reminders_router = APIRouter(prefix="/api/reminders", tags=["persons"])


def _now() -> datetime:
    return datetime.now()


def _to_out(person: models.Person, alert_ratio: float = DEFAULT_ALERT_RATIO) -> schemas.PersonOut:
    out = schemas.PersonOut.model_validate(person)
    if person.meetings:
        out.last_met_at = max(m.met_at for m in person.meetings)
        out.meeting_count = len(person.meetings)
    status_ = contact_status([m.met_at for m in person.meetings], person.contact_cycle_days, _now(), alert_ratio)
    for key, value in asdict(status_).items():
        setattr(out, key, value)
    return out


def _get_or_404(db: Session, person_id: int) -> models.Person:
    person = db.get(models.Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사람을 찾을 수 없습니다")
    return person


@router.get("", response_model=list[schemas.PersonOut])
def list_persons(db: Session = Depends(get_db)):
    persons = db.scalars(select(models.Person).order_by(models.Person.name)).all()
    return [_to_out(p) for p in persons]


@router.post("", response_model=schemas.PersonOut, status_code=status.HTTP_201_CREATED)
def create_person(body: schemas.PersonCreate, db: Session = Depends(get_db)):
    person = models.Person(**body.model_dump())
    db.add(person)
    db.commit()
    db.refresh(person)
    return _to_out(person)


@router.get("/{person_id}", response_model=schemas.PersonOut)
def get_person(person_id: int, db: Session = Depends(get_db)):
    return _to_out(_get_or_404(db, person_id))


@router.patch("/{person_id}", response_model=schemas.PersonOut)
def update_person(person_id: int, body: schemas.PersonUpdate, db: Session = Depends(get_db)):
    person = _get_or_404(db, person_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(person, key, value)
    db.commit()
    db.refresh(person)
    return _to_out(person)


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person(person_id: int, db: Session = Depends(get_db)):
    db.delete(_get_or_404(db, person_id))
    db.commit()


@reminders_router.get("", response_model=list[schemas.PersonOut])
def list_reminders(
    ratio: float = Query(DEFAULT_ALERT_RATIO, ge=1, le=5, description="평소 주기의 몇 배가 지나면 알릴지"),
    db: Session = Depends(get_db),
):
    """평소보다 오래 만나지 못한 사람 (오래 못 본 순)"""
    persons = [_to_out(p, ratio) for p in db.scalars(select(models.Person)).all()]
    due = [p for p in persons if p.needs_contact]
    return sorted(due, key=lambda p: p.overdue_ratio, reverse=True)
