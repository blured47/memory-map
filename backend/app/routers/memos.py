from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import memo_ai, models, schemas
from ..db import get_db

router = APIRouter(prefix="/api", tags=["memos"])


@router.post("/meetings/{meeting_id}/classify", response_model=list[schemas.MemoItemOut])
def classify_meeting_memo(meeting_id: int, db: Session = Depends(get_db)):
    """만남 메모를 AI로 분류해 사람별 카드에 저장한다. 다시 실행하면 이 만남의 분류 결과를 새로 만든다"""
    meeting = db.get(models.Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "만남 기록을 찾을 수 없습니다")
    if not (meeting.memo or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "분류할 메모가 없습니다")

    # 이름이 같은 사람이 함께 있으면 첫 번째 사람에게 저장된다
    by_name = {}
    for person in meeting.people:
        by_name.setdefault(person.name, person)

    try:
        items = memo_ai.classify_memo(meeting.memo, list(by_name))
    except memo_ai.OllamaUnavailable as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))
    except memo_ai.MemoAIError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))

    meeting.memo_items = [
        models.MemoItem(
            person=by_name[item["person"]],
            category=item["category"],
            content=item["content"],
            event_date=item["date"],
        )
        for item in items
    ]
    db.commit()
    return meeting.memo_items


@router.get("/persons/{person_id}/card", response_model=schemas.PersonCard)
def get_person_card(person_id: int, db: Session = Depends(get_db)):
    """사람별 카드: 메모에서 분류된 내용을 항목별로 모아서 보여준다"""
    person = db.get(models.Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사람을 찾을 수 없습니다")

    query = (
        select(models.MemoItem)
        .join(models.Meeting)
        .where(models.MemoItem.person_id == person_id)
        .order_by(models.Meeting.met_at.desc(), models.MemoItem.id)
    )
    items = db.scalars(query).all()
    return schemas.PersonCard(
        person_id=person.id,
        name=person.name,
        interests=[i for i in items if i.category == "interest"],
        recommendations=[i for i in items if i.category == "recommendation"],
        questions=[i for i in items if i.category == "question"],
        anniversaries=[i for i in items if i.category == "anniversary"],
    )


def _item_or_404(db: Session, item_id: int) -> models.MemoItem:
    item = db.get(models.MemoItem, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "분류 항목을 찾을 수 없습니다")
    return item


@router.patch("/memo-items/{item_id}", response_model=schemas.MemoItemOut)
def update_memo_item(item_id: int, body: schemas.MemoItemUpdate, db: Session = Depends(get_db)):
    """AI가 잘못 분류한 내용을 사용자가 고친다"""
    item = _item_or_404(db, item_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/memo-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memo_item(item_id: int, db: Session = Depends(get_db)):
    db.delete(_item_or_404(db, item_id))
    db.commit()
