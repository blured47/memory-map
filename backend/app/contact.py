from dataclasses import dataclass
from datetime import datetime

# 연락 주기를 따로 정하지 않은 사람은 한 달에 한 번 보는 것으로 본다
DEFAULT_CYCLE_DAYS = 30


@dataclass
class ContactStatus:
    days_since_last_met: int | None
    cycle_days: int  # 계산에 쓴 주기 (사람에게 정해진 값이 없으면 기본값)
    overdue_ratio: float | None  # 마지막 만남 후 지난 날 ÷ 주기. 1 이상이면 연락할 때가 됨
    temperature: str | None  # 관계 온도: hot, warm, cool, cold (만난 적 없으면 None)
    needs_contact: bool


def temperature_of(ratio: float) -> str:
    # 지도에서 hot=붉음, warm=주황, cool=노랑, cold=회색으로 쓰기로 함
    if ratio < 0.5:
        return "hot"
    if ratio < 1:
        return "warm"
    if ratio < 2:
        return "cool"
    return "cold"


def contact_status(last_met_at: datetime | None, cycle_days: int | None, now: datetime) -> ContactStatus:
    cycle = cycle_days or DEFAULT_CYCLE_DAYS
    if last_met_at is None:
        return ContactStatus(None, cycle, None, None, False)

    # 앞으로 만날 약속을 미리 기록한 경우는 0일로 본다
    days = max((now.date() - last_met_at.date()).days, 0)
    ratio = round(days / cycle, 2)
    return ContactStatus(days, cycle, ratio, temperature_of(ratio), ratio >= 1)
