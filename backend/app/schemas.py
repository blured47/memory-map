from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PersonBase(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    relation: str | None = None
    birthday: date | None = None
    contact_cycle_days: int | None = Field(default=None, ge=1)
    note: str | None = None


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    relation: str | None = None
    birthday: date | None = None
    contact_cycle_days: int | None = Field(default=None, ge=1)
    note: str | None = None


class PersonOut(PersonBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    last_met_at: datetime | None = None
    meeting_count: int = 0
    # 맞춤형 연락 알림 (app/contact.py 참고)
    days_since_last_met: int | None = None
    usual_cycle_days: float | None = None
    cycle_source: Literal["average", "manual"] | None = None
    overdue_ratio: float | None = None
    needs_contact: bool = False


class PersonBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class MeetingBase(BaseModel):
    met_at: datetime
    place_name: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    memo: str | None = None
    photo_path: str | None = None


class MeetingCreate(MeetingBase):
    person_ids: list[int] = Field(min_length=1)


class MeetingUpdate(BaseModel):
    met_at: datetime | None = None
    place_name: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    memo: str | None = None
    photo_path: str | None = None
    person_ids: list[int] | None = Field(default=None, min_length=1)


class MeetingOut(MeetingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    people: list[PersonBrief]


class PhotoOut(BaseModel):
    photo_path: str
    url: str
    taken_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
