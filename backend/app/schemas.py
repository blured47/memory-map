from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _strip_required(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        raise ValueError("공백만 입력할 수 없습니다")
    return stripped


class PersonBase(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    relation: str | None = Field(default=None, max_length=50)
    birthday: date | None = None
    contact_cycle_days: int | None = Field(default=30, ge=1, le=3650)
    note: str | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: str) -> str:
        return _strip_required(v)


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    relation: str | None = Field(default=None, max_length=50)
    birthday: date | None = None
    contact_cycle_days: int | None = Field(default=None, ge=1, le=3650)
    note: str | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: str | None) -> str | None:
        return _strip_required(v)


class PersonOut(PersonBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    deleted_at: datetime | None = None
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


def _check_coords_pair(latitude: float | None, longitude: float | None) -> None:
    if (latitude is None) != (longitude is None):
        raise ValueError("위도와 경도는 함께 입력하거나 함께 비워야 합니다")


class MeetingBase(BaseModel):
    met_at: datetime
    place_name: str | None = Field(default=None, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    memo: str | None = None
    photo_path: str | None = None

    @model_validator(mode="after")
    def _validate_coords(self):
        _check_coords_pair(self.latitude, self.longitude)
        return self


class MeetingCreate(MeetingBase):
    person_ids: list[int] = Field(min_length=1)


class MeetingUpdate(BaseModel):
    met_at: datetime | None = None
    place_name: str | None = Field(default=None, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    memo: str | None = None
    photo_path: str | None = None
    person_ids: list[int] | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _validate_coords(self):
        _check_coords_pair(self.latitude, self.longitude)
        return self


class MeetingOut(MeetingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    deleted_at: datetime | None = None
    removed_people: int = 0  # 영구 삭제한 친구 수 (앱에서 '삭제한 친구'로 표시)
    people: list[PersonBrief]


class PhotoOut(BaseModel):
    photo_path: str
    url: str
    taken_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None


class Place(BaseModel):
    kakao_id: str
    name: str
    category: str | None = None
    address: str | None = None
    latitude: float
    longitude: float
    distance: int | None = None  # 기준 좌표에서의 거리(m)
    url: str | None = None  # 카카오맵 장소 페이지


class NearbyOut(BaseModel):
    address: str | None = None
    building_name: str | None = None
    places: list[Place]


MemoCategory = Literal["interest", "recommendation", "question", "anniversary"]


class MemoItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    meeting_id: int
    person_id: int
    category: MemoCategory
    content: str
    event_date: str | None = None


class MemoItemUpdate(BaseModel):
    category: MemoCategory | None = None
    content: str | None = Field(default=None, min_length=1)
    event_date: str | None = Field(default=None, max_length=50)

    @field_validator("content")
    @classmethod
    def _validate_content(cls, v: str | None) -> str | None:
        return _strip_required(v)


class PersonCard(BaseModel):
    person_id: int
    name: str
    interests: list[MemoItemOut]
    recommendations: list[MemoItemOut]
    questions: list[MemoItemOut]
    anniversaries: list[MemoItemOut]
