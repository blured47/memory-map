from dataclasses import asdict
from datetime import datetime, timedelta

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


def _purge_expired_deleted(db: Session):
    """삭제된 지 30일이 지난 인물은 데이터베이스에서 영구 삭제"""
    cutoff = _now() - timedelta(days=30)
    expired = db.scalars(
        select(models.Person).where(models.Person.deleted_at.is_not(None), models.Person.deleted_at <= cutoff)
    ).all()
    for p in expired:
        db.delete(p)
    if expired:
        db.commit()


def _to_out(person: models.Person, alert_ratio: float = DEFAULT_ALERT_RATIO) -> schemas.PersonOut:
    out = schemas.PersonOut.model_validate(person)
    if person.meetings:
        out.last_met_at = max(m.met_at for m in person.meetings)
        out.meeting_count = len(person.meetings)
    status_ = contact_status([m.met_at for m in person.meetings], person.contact_cycle_days, _now(), alert_ratio)
    for key, value in asdict(status_).items():
        setattr(out, key, value)
    return out


def _get_or_404(db: Session, person_id: int, include_deleted: bool = False) -> models.Person:
    person = db.get(models.Person, person_id)
    if person is None or (not include_deleted and person.deleted_at is not None):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사람을 찾을 수 없습니다")
    return person


@router.get("", response_model=list[schemas.PersonOut])
def list_persons(db: Session = Depends(get_db)):
    _purge_expired_deleted(db)
    persons = db.scalars(
        select(models.Person).where(models.Person.deleted_at.is_(None)).order_by(models.Person.name)
    ).all()
    return [_to_out(p) for p in persons]


@router.get("/deleted", response_model=list[schemas.PersonOut])
def list_deleted_persons(db: Session = Depends(get_db)):
    """휴지통: 소프트 삭제된 인물 목록 (최근 삭제순)"""
    _purge_expired_deleted(db)
    persons = db.scalars(
        select(models.Person).where(models.Person.deleted_at.is_not(None)).order_by(models.Person.deleted_at.desc())
    ).all()
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
    """인물 소프트 삭제 (휴지통으로 이동, 30일 후 자동 완전 삭제)"""
    person = _get_or_404(db, person_id)
    person.deleted_at = _now()
    db.commit()


@router.post("/{person_id}/restore", response_model=schemas.PersonOut)
def restore_person(person_id: int, db: Session = Depends(get_db)):
    """삭제된 인물 복구"""
    person = _get_or_404(db, person_id, include_deleted=True)
    person.deleted_at = None
    db.commit()
    db.refresh(person)
    return _to_out(person)


@router.delete("/{person_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def permanent_delete_person(person_id: int, db: Session = Depends(get_db)):
    """인물 영구 완전 삭제"""
    person = _get_or_404(db, person_id, include_deleted=True)
    db.delete(person)
    db.commit()


@reminders_router.get("", response_model=list[schemas.PersonOut])
def list_reminders(
    ratio: float = Query(DEFAULT_ALERT_RATIO, ge=1, le=5, description="평소 주기의 몇 배가 지나면 알릴지"),
    db: Session = Depends(get_db),
):
    """평소보다 오래 만나지 못한 사람 (오래 못 본 순)"""
    persons = [_to_out(p, ratio) for p in db.scalars(select(models.Person).where(models.Person.deleted_at.is_(None))).all()]
    due = [p for p in persons if p.needs_contact]
    return sorted(due, key=lambda p: p.overdue_ratio, reverse=True)
