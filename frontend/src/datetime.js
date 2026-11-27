// 백엔드는 시간대 없는 현지 시각("2026-10-20T18:30:00")을 주고받는다.
// Date 로 바꾸면 기기 시간대에 따라 해석이 달라질 수 있어 문자열을 그대로 다룬다.

const pad = (n) => String(n).padStart(2, '0');

// "2026-10-20T18:30:00" → "2026.10.20 18:30"
export function formatDateTime(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? '');
  return m ? `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}` : '-';
}

// "2026-10-20T18:30:00" → "2026.10.20"
export function formatDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return m ? `${m[1]}.${m[2]}.${m[3]}` : '-';
}

// "2026-10-20T18:30:00" 또는 "2026-10-20" → Date (기기 현지 시각)
export function parseLocalIso(value) {
  const [year, month, day, hour = 0, minute = 0] = (value.match(/\d+/g) ?? []).map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

// 지금 시각을 백엔드 형식으로
export function nowLocalIso() {
  return toLocalIso(new Date());
}

// Date → 백엔드 형식 ("2026-10-20T18:30:00", 기기 현지 시각)
export function toLocalIso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Date → "2026-10-20" (기기 현지 날짜)
export function toDateValue(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 생일("2000-05-12")까지 남은 날 수. 오늘이 생일이면 0.
// 2월 29일생은 평년에 3월 1일로 계산된다
export function daysUntilBirthday(birthday) {
  const born = parseLocalIso(birthday);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), born.getMonth(), born.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, born.getMonth(), born.getDate());
  return Math.round((next - today) / 86400000);
}
