import { useEffect, useState } from 'react';

import { classifyMeeting } from './api';

// 만남을 저장하면 메모를 AI 로 자동 분류한다 (제안서 4단계 "AI 메모 자동 분류").
// 분류는 10초~1분 걸려서 저장을 기다리게 하지 않고 뒤에서 따로 요청한다.
// 진행 중·실패 상태는 여러 화면(지도, 만남 상세, AI 카드)이 함께 본다

const running = new Set(); // 분류 중인 만남 id
const failed = new Map(); // 만남 id → 실패 이유
const rerun = new Set(); // 분류 중에 메모가 또 바뀌어 끝나면 한 번 더 분류할 만남 id
const removed = new Set(); // 분류 중에 삭제된 만남 id (결과를 버린다)
const listeners = new Set();
let version = 0; // 분류가 끝날 때마다 올라가 AI 카드가 다시 불러오게 한다

const notify = () => listeners.forEach((fn) => fn());

export async function startClassify(meetingId) {
  if (running.has(meetingId)) {
    // 이미 옛 메모를 분류하는 중이면 끝난 뒤 새 메모로 다시 분류한다
    rerun.add(meetingId);
    return;
  }
  running.add(meetingId);
  failed.delete(meetingId);
  removed.delete(meetingId);
  notify();
  try {
    await classifyMeeting(meetingId);
  } catch (e) {
    if (e.status === 409) rerun.add(meetingId); // 서버: 분류하는 동안 메모가 바뀜
    else if (e.status !== 404 && !removed.has(meetingId)) failed.set(meetingId, e.message); // 404: 그사이 삭제됨
  } finally {
    running.delete(meetingId);
    version += 1;
    notify();
  }
  if (rerun.delete(meetingId) && !removed.has(meetingId)) startClassify(meetingId);
}

export function clearClassifyStatus(meetingId) {
  removed.add(meetingId);
  rerun.delete(meetingId);
  const changed = running.delete(meetingId) || failed.delete(meetingId);
  if (changed) notify();
}

// 새 만남이거나, 메모나 함께한 사람이 바뀌었을 때만 다시 분류한다
export function needsClassify(before, after) {
  if (!after.memo?.trim() || !after.people?.length) return false;
  if (!before) return true;
  const ids = (m) => m.people.map((p) => p.id).sort().join(',');
  return before.memo !== after.memo || ids(before) !== ids(after);
}

export function useClassifyStatus() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return { running, failed, version };
}
