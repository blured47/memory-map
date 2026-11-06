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
    contact_cycle_days: Mapped[int | None] = mapped_column(Integer, default=30)  # 사용자가 직접 지정한 연락 주기 (기본 30일)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)  # 소프트 삭제 (30일 후 완전 삭제)

    meetings: Mapped[list["Meeting"]] = relationship(secondary=meeting_people, back_populates="people")
    memo_items: Mapped[list["MemoItem"]] = relationship(back_populates="person", cascade="all, delete-orphan")


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
    memo_items: Mapped[list["MemoItem"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")


class MemoItem(Base):
    """AI가 메모에서 뽑아 사람별 카드에 저장한 내용"""

    __tablename__ = "memo_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String(20))  # interest, recommendation, question, anniversary
    content: Mapped[str] = mapped_column(Text)
    event_date: Mapped[str | None] = mapped_column(String(50))  # 기념일 날짜 (메모에 적힌 그대로)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    meeting: Mapped[Meeting] = relationship(back_populates="memo_items")
    person: Mapped[Person] = relationship(back_populates="memo_items")
