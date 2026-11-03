// 백엔드는 시간대 없는 현지 시각("2026-10-20T18:30:00")을 주고받는다.
// Date 로 바꾸면 기기 시간대에 따라 해석이 달라질 수 있어 문자열을 그대로 다룬다.

const pad = (n) => String(n).padStart(2, '0');

// "2026-10-20T18:30:00" → "2026.10.20 18:30"
export function formatDateTime(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? '');
  return m ? `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}` : '-';
}

// 지금 시각을 백엔드 형식으로
export function nowLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
