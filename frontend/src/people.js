// 만남에 함께한 사람을 글자로. 완전히 지운 친구는 이름 없이 '삭제한 친구'로 보여준다
// excludeId: 친구 화면에서 그 친구 자신은 빼고 보여줄 때
export function peopleLabel(meeting, excludeId = null) {
  const names = meeting.people.filter((p) => p.id !== excludeId).map((p) => p.name);
  const removed = meeting.removed_people ?? 0;
  if (removed === 1) names.push('삭제한 친구');
  else if (removed > 1) names.push(`삭제한 친구 ${removed}명`);
  return names.join(', ');
}
