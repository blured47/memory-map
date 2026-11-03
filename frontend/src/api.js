// 백엔드 주소. 폰에서 접속하므로 localhost 가 아닌 PC의 LAN IP 를 써야 합니다. (예: http://192.168.0.10:8000)
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

const TIMEOUT_MS = 8000;

async function request(path) {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL 이 설정되지 않았습니다.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`서버 오류 (HTTP ${res.status})`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`서버 응답 없음: ${API_URL}`);
    if (e instanceof TypeError) throw new Error(`서버에 연결할 수 없습니다: ${API_URL}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// 평소 만남 주기의 ratio 배 이상 못 만난 사람 (오래 못 본 순)
export function fetchReminders(ratio) {
  return request(`/api/reminders?ratio=${ratio}`);
}
