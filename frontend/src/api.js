// 백엔드 주소. 폰에서 접속하므로 localhost 가 아닌 PC의 LAN IP 를 써야 합니다. (예: http://192.168.0.10:8000)
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

const TIMEOUT_MS = 8000;
const UPLOAD_TIMEOUT_MS = 60000;

async function request(path, { timeout = TIMEOUT_MS, json, ...options } = {}) {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL 이 설정되지 않았습니다.');

  if (json !== undefined) {
    options.body = JSON.stringify(json);
    options.headers = { 'Content-Type': 'application/json', ...options.headers };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${API_URL}${path}`, { ...options, signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(typeof body?.detail === 'string' ? body.detail : `서버 오류 (HTTP ${res.status})`);
    }
    return res.status === 204 ? null : await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`서버 응답 없음: ${API_URL}`);
    if (e instanceof TypeError) throw new Error(`서버에 연결할 수 없습니다: ${API_URL}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const photoUrl = (photoPath) => (photoPath ? `${API_URL}/api/photos/${photoPath}` : null);

// 평소 만남 주기의 ratio 배 이상 못 만난 사람 (오래 못 본 순)
export function fetchReminders(ratio) {
  return request(`/api/reminders?ratio=${ratio}`);
}

export function fetchPersons() {
  return request('/api/persons');
}

export function createPerson(name) {
  return request('/api/persons', { method: 'POST', json: { name } });
}

export function fetchMeetings() {
  return request('/api/meetings');
}

export function createMeeting(meeting) {
  return request('/api/meetings', { method: 'POST', json: meeting });
}

// 사진을 올리면 서버가 EXIF 에서 촬영 시각·위치를 읽어 돌려준다 → { photo_path, url, taken_at, latitude, longitude }
export function uploadPhoto(asset) {
  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    name: asset.fileName ?? 'photo.jpg',
    type: asset.mimeType ?? 'image/jpeg',
  });
  return request('/api/photos', { method: 'POST', body: form, timeout: UPLOAD_TIMEOUT_MS });
}
