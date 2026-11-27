import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// 서버 주소와 접근 토큰. 앱의 '서버 설정'에서 바꾸고 이 기기에 저장한다.
// 저장한 값이 없으면 빌드할 때 넣은 EXPO_PUBLIC_API_URL 을 쓴다 (개발용)
const STORAGE_KEY = 'serverConfig';

const DEFAULT_PORT = 8000; // 서버(uvicorn) 기본 포트

// "192.168.0.10" → "http://192.168.0.10:8000". http 인데 포트를 안 적으면 서버 기본 포트를 붙인다
export const normalizeUrl = (url) => {
  let value = (url ?? '').trim().replace(/\/+$/, '');
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  const m = /^(http:\/\/)([^/:]+)(\/.*)?$/i.exec(value);
  if (m) value = `${m[1]}${m[2]}:${DEFAULT_PORT}${m[3] ?? ''}`;
  return value;
};

let config = { url: normalizeUrl(process.env.EXPO_PUBLIC_API_URL), token: '' };
let version = 0; // 설정이 바뀔 때마다 올라가 화면들이 다시 불러오게 한다
const listeners = new Set();

export const getServerConfig = () => config;

export async function loadServerConfig() {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null');
    if (saved?.url) config = { url: normalizeUrl(saved.url), token: saved.token ?? '' };
  } catch {
    // 저장된 값을 읽지 못하면 기본값으로 시작한다
  }
  return config;
}

export async function saveServerConfig(next) {
  config = { url: normalizeUrl(next.url), token: (next.token ?? '').trim() };
  version += 1;
  listeners.forEach((fn) => fn());
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useServerConfig() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return { ...config, version };
}
