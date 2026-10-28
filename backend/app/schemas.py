from datetime import date, datetime

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


class MeetingCreate(MeetingBase):
    person_ids: list[int] = Field(min_length=1)


class MeetingUpdate(BaseModel):
    met_at: datetime | None = None
    place_name: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    memo: str | None = None
    person_ids: list[int] | None = Field(default=None, min_length=1)


class MeetingOut(MeetingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    photo_path: str | None
    created_at: datetime
    people: list[PersonBrief]
