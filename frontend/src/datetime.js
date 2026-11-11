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

// "2026-10-20T18:30:00" → "2026-10-20 18:30" (입력칸에 보여줄 값)
export function toInputValue(value) {
  return (value ?? '').slice(0, 16).replace('T', ' ');
}

// "2026-10-20 18:30" → "2026-10-20T18:30:00". 없는 날짜·시각이면 null
export function fromInputValue(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day || hour > 23 || minute > 59) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`;
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
