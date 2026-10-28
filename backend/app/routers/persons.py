from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db

router = APIRouter(prefix="/api/persons", tags=["persons"])


def _to_out(person: models.Person) -> schemas.PersonOut:
    out = schemas.PersonOut.model_validate(person)
    if person.meetings:
        out.last_met_at = max(m.met_at for m in person.meetings)
        out.meeting_count = len(person.meetings)
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
