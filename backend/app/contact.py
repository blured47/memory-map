from dataclasses import dataclass
from datetime import date, datetime

# 제안서 5.2 만남 주기 분석
# - 사람별 만남 간격의 평균으로 평소 주기를 추정한다
# - 기록이 적을 때는 사용자가 직접 지정한 주기를 쓴다
# - 마지막 만남 이후 경과 시간이 평소 주기 × 기준 비율을 넘으면 알린다
MIN_INTERVALS = 2  # 평균을 내려면 만남 간격이 최소 2개(만난 날 3일) 있어야 한다
DEFAULT_ALERT_RATIO = 1.5  # 기준 비율 기본값. 연락할 사람 목록에서 바꿀 수 있다


@dataclass
class ContactStatus:
    days_since_last_met: int | None
    usual_cycle_days: float | None  # 평소 주기 (일)
    cycle_source: str | None  # "average": 만남 기록 평균, "manual": 사용자가 지정, None: 알 수 없음
    overdue_ratio: float | None  # 경과 일수 ÷ 평소 주기
    needs_contact: bool


def usual_cycle(meeting_days: list[date], manual_cycle_days: int | None) -> tuple[float | None, str | None]:
    days = sorted(set(meeting_days))  # 같은 날 여러 번 만난 건 하루로 본다
    intervals = [(b - a).days for a, b in zip(days, days[1:])]
    if len(intervals) >= MIN_INTERVALS:
        return round(sum(intervals) / len(intervals), 1), "average"
    if manual_cycle_days:
        return float(manual_cycle_days), "manual"
    return None, None


def contact_status(
    meeting_times: list[datetime],
    manual_cycle_days: int | None,
    now: datetime,
    alert_ratio: float = DEFAULT_ALERT_RATIO,
) -> ContactStatus:
    if not meeting_times:
        return ContactStatus(None, float(manual_cycle_days) if manual_cycle_days else None,
                             "manual" if manual_cycle_days else None, None, False)

    cycle, source = usual_cycle([t.date() for t in meeting_times], manual_cycle_days)
    # 앞으로 만날 약속을 미리 기록한 경우는 0일로 본다
    days = max((now.date() - max(meeting_times).date()).days, 0)
    if not cycle:
        return ContactStatus(days, None, None, None, False)

    ratio = round(days / cycle, 2)
    return ContactStatus(days, cycle, source, ratio, ratio > alert_ratio)
