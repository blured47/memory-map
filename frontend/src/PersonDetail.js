import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import PersonForm from './PersonForm';
import { formatDate, formatDateTime } from './datetime';
import { colors } from './theme';

// 친구 목록에서 이름을 눌렀을 때 보이는 한 사람의 화면: 정보, 수정, 함께한 만남
export default function PersonDetail({ person, persons, meetings, onSave, onDelete, onOpenMeeting }) {
  const [editing, setEditing] = useState(false);

  const save = async (body) => {
    await onSave(body);
    setEditing(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}>
        <Text style={styles.name}>{person.name}</Text>
        {person.relation ? (
          <View style={styles.relationChip}>
            <Text style={styles.relationText}>{person.relation}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.stats}>
        <Stat label="만남" value={`${person.meeting_count || 0}회`} />
        <Stat label="마지막 만남" value={person.last_met_at ? formatDate(person.last_met_at) : '기록 없음'} />
        <Stat label="연락 주기" value={`${person.contact_cycle_days ?? 30}일`} />
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.btnEdit} onPress={() => setEditing(!editing)}>
          <Text style={styles.btnEditText}>{editing ? '수정 취소' : '정보 수정'}</Text>
        </Pressable>
        <Pressable style={styles.btnDelete} onPress={onDelete}>
          <Text style={styles.btnDeleteText}>휴지통으로</Text>
        </Pressable>
      </View>

      {editing && <PersonForm person={person} persons={persons} onSubmit={save} />}

      <Text style={styles.section}>함께한 만남 ({meetings.length})</Text>
      {meetings.length === 0 ? (
        <Text style={styles.empty}>아직 함께한 만남이 없어요</Text>
      ) : (
        meetings.map((m) => (
          <Pressable key={m.id} style={styles.meeting} onPress={() => onOpenMeeting(m.id)}>
            <Text style={styles.place} numberOfLines={1}>
              {m.place_name ?? '장소 미지정'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {formatDateTime(m.met_at)}
              {m.people.length > 1
                ? ` · 함께: ${m.people.filter((p) => p.id !== person.id).map((p) => p.name).join(', ')}`
                : ''}
            </Text>
            {m.memo ? (
              <Text style={styles.memo} numberOfLines={1}>
                {m.memo}
              </Text>
            ) : null}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  name: { fontSize: 24, fontWeight: '700', color: colors.text },
  relationChip: { backgroundColor: colors.primaryBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  relationText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  stats: { flexDirection: 'row', marginTop: 16, backgroundColor: colors.grey50, borderRadius: 16, paddingVertical: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnEdit: { flex: 1, backgroundColor: colors.primaryBg, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnEditText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  btnDelete: { backgroundColor: colors.grey100, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  btnDeleteText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  section: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 28, marginBottom: 4 },
  empty: { fontSize: 14, color: colors.textDisabled, paddingVertical: 16, textAlign: 'center' },
  meeting: { paddingVertical: 12 },
  place: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textSub, marginTop: 3 },
  memo: { fontSize: 13, color: colors.textTertiary, marginTop: 2 },
});
