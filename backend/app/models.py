from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

# 만남 ↔ 사람 (여러 사람과 함께한 만남 지원)
meeting_people = Table(
    "meeting_people",
    Base.metadata,
    Column("meeting_id", ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True),
    Column("person_id", ForeignKey("persons.id", ondelete="CASCADE"), primary_key=True),
)


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    relation: Mapped[str | None] = mapped_column(String(50))  # 예: 대학 동기, 가족
    birthday: Mapped[date | None] = mapped_column(Date)
    contact_cycle_days: Mapped[int | None] = mapped_column(Integer)  # 사용자가 직접 지정한 연락 주기
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    meetings: Mapped[list["Meeting"]] = relationship(secondary=meeting_people, back_populates="people")


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    met_at: Mapped[datetime] = mapped_column(DateTime)
    place_name: Mapped[str | None] = mapped_column(String(200))  # None이면 '미지정'
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    memo: Mapped[str | None] = mapped_column(Text)
    photo_path: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    people: Mapped[list[Person]] = relationship(secondary=meeting_people, back_populates="meetings")
