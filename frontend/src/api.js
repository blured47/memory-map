import { File } from 'expo-file-system';

import { getServerConfig } from './serverConfig';

// 백엔드 주소와 토큰은 앱의 '서버 설정'에서 정한다 (serverConfig.js).
// 폰에서 접속하므로 localhost 가 아닌 서버 컴퓨터의 LAN IP 를 써야 한다 (예: http://192.168.0.10:8000)

const TIMEOUT_MS = 8000;
const UPLOAD_TIMEOUT_MS = 60000;

// 서버가 보낸 이유를 담은 오류. status 로 409(다시 분류), 401(토큰 오류) 등을 구분한다
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { timeout = TIMEOUT_MS, json, server = getServerConfig(), ...options } = {}) {
  const { url: baseUrl, token } = server;
  if (!baseUrl) throw new ApiError('서버 주소가 설정되지 않았어요. 오른쪽 위 설정 버튼에서 입력해 주세요.', 0);

  options.headers = { ...options.headers };
  if (token) options.headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    options.body = JSON.stringify(json);
    options.headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      let detail = null;
      if (typeof body?.detail === 'string') {
        detail = body.detail;
      } else if (Array.isArray(body?.detail) && body.detail.length > 0) {
        detail = body.detail.map((item) => item?.msg).filter(Boolean).join(', ');
      }
      throw new ApiError(detail || `서버 오류 (HTTP ${res.status})`, res.status);
    }
    return res.status === 204 ? null : await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError(`서버 응답 없음: ${baseUrl}`, 0);
    if (e instanceof TypeError) throw new ApiError(`서버에 연결할 수 없습니다: ${baseUrl}`, 0);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// 지도(WebView)와 <Image> 는 헤더를 붙일 수 없어 토큰을 주소에 붙인다
export const photoUrl = (photoPath) => {
  if (!photoPath) return null;
  const { url, token } = getServerConfig();
  if (!url) return null;
  const base = `${url}/api/photos/${photoPath}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
};

// 서버 설정 화면의 '연결 확인': 저장하기 전에 입력한 주소·토큰으로 실제로 접속해 본다
export async function checkServer(server) {
  const health = await request('/api/health', { server, timeout: 5000 });
  if (health?.status !== 'ok') throw new ApiError('Memory Map 서버가 아닌 것 같아요', 0);
  if (health.auth_required && !server.token) {
    throw new ApiError('이 서버는 접근 토큰이 필요해요. 서버 .env 의 MEMORYMAP_API_TOKEN 값을 입력해 주세요', 401);
  }
  // 토큰이 맞는지는 실제 API 를 한 번 불러 확인한다
  await request('/api/reminders', { server, timeout: 5000 });
  return health;
}

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

export function createPersonFull(personData) {
  return request('/api/persons', { method: 'POST', json: personData });
}

export function updatePerson(personId, personData) {
  return request(`/api/persons/${personId}`, { method: 'PATCH', json: personData });
}

export function deletePerson(personId) {
  return request(`/api/persons/${personId}`, { method: 'DELETE' });
}

export function fetchDeletedPersons() {
  return request('/api/persons/deleted');
}

export function restorePerson(personId) {
  return request(`/api/persons/${personId}/restore`, { method: 'POST' });
}

export function permanentDeletePerson(personId) {
  return request(`/api/persons/${personId}/permanent`, { method: 'DELETE' });
}

export function fetchMeetings() {
  return request('/api/meetings');
}

export function createMeeting(meeting) {
  return request('/api/meetings', { method: 'POST', json: meeting });
}

export function updateMeeting(meetingId, meeting) {
  return request(`/api/meetings/${meetingId}`, { method: 'PATCH', json: meeting });
}

// 휴지통으로 옮긴다 (30일 뒤 서버가 완전히 지운다)
export function deleteMeeting(meetingId) {
  return request(`/api/meetings/${meetingId}`, { method: 'DELETE' });
}

export function fetchDeletedMeetings() {
  return request('/api/meetings/deleted');
}

export function restoreMeeting(meetingId) {
  return request(`/api/meetings/${meetingId}/restore`, { method: 'POST' });
}

export function permanentDeleteMeeting(meetingId) {
  return request(`/api/meetings/${meetingId}/permanent`, { method: 'DELETE' });
}

// 사진 위치 주변 장소 후보 → { address, building_name, places: [...] }
export function fetchNearby(lat, lon) {
  return request(`/api/places/nearby?lat=${lat}&lon=${lon}&limit=5`);
}

// 카카오 로컬 API 키워드 검색 (위치를 주면 가까운 순) → [{ name, address, latitude, longitude, ... }]
export function searchPlaces(query, lat, lon) {
  const params = new URLSearchParams({ query, limit: '8' });
  if (lat != null && lon != null) {
    params.append('lat', String(lat));
    params.append('lon', String(lon));
  }
  return request(`/api/places/search?${params}`);
}

// 사진을 올리면 서버가 EXIF 에서 촬영 시각·위치를 읽어 돌려준다 → { photo_path, url, taken_at, latitude, longitude }
// Expo 의 fetch 는 React Native 식 { uri, name, type } 파트를 받지 않아 파일 객체로 붙인다
export function uploadPhoto(asset) {
  const form = new FormData();
  form.append('file', new File(asset.uri));
  return request('/api/photos', { method: 'POST', body: form, timeout: UPLOAD_TIMEOUT_MS });
}

// AI 메모 분류는 내 컴퓨터의 Ollama 가 처리해 오래 걸린다 (생각 모드는 메모당 1분 안팎, 서버 제한 300초)
const CLASSIFY_TIMEOUT_MS = 320000;

// 만남 메모를 AI 로 분류해 사람별 카드에 저장 → 분류된 항목 목록
export function classifyMeeting(meetingId) {
  return request(`/api/meetings/${meetingId}/classify`, { method: 'POST', timeout: CLASSIFY_TIMEOUT_MS });
}

// 사람별 카드 → { interests, recommendations, questions, anniversaries }
export function fetchPersonCard(personId) {
  return request(`/api/persons/${personId}/card`);
}

export function updateMemoItem(itemId, item) {
  return request(`/api/memo-items/${itemId}`, { method: 'PATCH', json: item });
}

export function deleteMemoItem(itemId) {
  return request(`/api/memo-items/${itemId}`, { method: 'DELETE' });
}
