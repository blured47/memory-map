import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import DateTimeField from './DateTimeField';
import { parseLocalIso, toDateValue } from './datetime';
import { colors } from './theme';

// 생일을 처음 고를 때 달력이 열리는 날짜. 오늘부터 시작하면 태어난 해까지 한참 넘겨야 한다
const DEFAULT_BIRTHDAY = '2000-01-01';
const MAX_CYCLE_DAYS = 3650; // 10년

// 사람 등록·수정 폼. person 이 있으면 그 사람을 수정한다.
// onSubmit(body) 가 끝나면 저장된 것으로 본다 (실패하면 throw)
export default function PersonForm({ person, persons, onSubmit }) {
  const [name, setName] = useState(person?.name ?? '');
  const [relation, setRelation] = useState(person?.relation ?? '');
  const [cycleDays, setCycleDays] = useState(String(person?.contact_cycle_days ?? 30));
  const [birthday, setBirthday] = useState(person?.birthday ?? null); // "2000-05-12" 또는 null
  const [note, setNote] = useState(person?.note ?? '');
  const [submitting, setSubmitting] = useState(false);

  // 기존 등록된 모든 관계 목록 (추천 태그용)
  const existingRelations = useMemo(() => {
    const set = new Set();
    persons.forEach((p) => {
      if (p.relation && p.relation.trim()) set.add(p.relation.trim());
    });
    return Array.from(set);
  }, [persons]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const trimmedCycle = cycleDays.trim();
      const days = trimmedCycle ? parseInt(trimmedCycle, 10) : 30;
      await onSubmit({
        name: name.trim(),
        relation: relation.trim() || null,
        contact_cycle_days: days,
        birthday,
        note: note.trim() || null,
      });
    } catch (e) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return Alert.alert('입력 확인', '이름을 입력해 주세요.');
    }
    const trimmedCycle = cycleDays.trim();
    if (trimmedCycle) {
      const days = Number(trimmedCycle);
      if (!/^\d+$/.test(trimmedCycle) || days < 1 || days > MAX_CYCLE_DAYS) {
        return Alert.alert('입력 확인', `연락 주기는 1일부터 ${MAX_CYCLE_DAYS}일 사이의 숫자로 입력해 주세요.`);
      }
    }

    // 동명이인 검사 (수정 중인 본인은 제외)
    const trimmedRel = relation.trim();
    const others = persons.filter((p) => p.id !== person?.id);
    const duplicateExact = others.find(
      (p) => p.name.trim() === trimmedName && (p.relation?.trim() || '') === trimmedRel,
    );
    if (duplicateExact) {
      return Alert.alert('저장 불가', '이름과 관계가 완전히 동일한 인물이 이미 존재합니다.');
    }

    const duplicateNameOnly = others.find((p) => p.name.trim() === trimmedName);
    if (duplicateNameOnly) {
      Alert.alert(
        '동명이인 주의',
        `'${duplicateNameOnly.relation || '미지정'}'에 이미 같은 이름의 인물이 있습니다. 계속할까요?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '계속', onPress: submit },
        ],
      );
      return;
    }

    submit();
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{person ? `${person.name} 님 정보 수정` : '새로운 친구 등록'}</Text>
      <TextInput style={styles.input} placeholder="이름 (필수)" value={name} onChangeText={setName} maxLength={50} />
      <TextInput
        style={styles.input}
        placeholder="관계 (예: 대학 동기, 회사, 친구)"
        value={relation}
        onChangeText={setRelation}
        maxLength={50}
      />

      {existingRelations.length > 0 && (
        <View style={styles.tagWrap}>
          <Text style={styles.tagLabel}>추천 태그:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {existingRelations.map((rel) => {
              const active = relation.trim() === rel;
              return (
                <Pressable
                  key={rel}
                  style={[styles.tagChip, active && styles.tagChipActive]}
                  onPress={() => setRelation(active ? '' : rel)}
                >
                  <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>{rel}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.cycleRow}>
        <Text style={styles.cycleLabel}>연락 주기:</Text>
        <TextInput
          style={[styles.input, styles.cycleInput]}
          placeholder="30"
          keyboardType="number-pad"
          value={cycleDays}
          onChangeText={setCycleDays}
          maxLength={4}
        />
        <Text style={styles.cycleUnit}>일마다</Text>
      </View>

      <View style={styles.birthdayRow}>
        <Text style={styles.cycleLabel}>생일:</Text>
        {birthday ? (
          <>
            <DateTimeField
              mode="date"
              value={parseLocalIso(birthday)}
              maximumDate={new Date()}
              onChange={(d) => setBirthday(toDateValue(d))}
            />
            <Pressable onPress={() => setBirthday(null)} hitSlop={8}>
              <Text style={styles.clearText}>지우기</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.addButton} onPress={() => setBirthday(DEFAULT_BIRTHDAY)}>
            <Text style={styles.addButtonText}>+ 생일 추가</Text>
          </Pressable>
        )}
      </View>

      <TextInput
        style={[styles.input, styles.note]}
        placeholder="메모 (예: 좋아하는 음식, 알레르기, 근황)"
        value={note}
        onChangeText={setNote}
        multiline
      />

      <Pressable style={[styles.submit, submitting && styles.disabled]} onPress={handleSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.submitText}>{person ? '수정 완료' : '등록 완료'}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.grey50, marginVertical: 8, padding: 16, borderRadius: 16 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: colors.text },
  input: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  tagWrap: { marginBottom: 8 },
  tagLabel: { fontSize: 13, color: colors.textTertiary, marginBottom: 6 },
  tagChip: { backgroundColor: colors.primaryBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginRight: 6 },
  tagChipActive: { backgroundColor: colors.primary },
  tagChipText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  tagChipTextActive: { color: colors.white },
  cycleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cycleLabel: { fontSize: 14, color: colors.textSub, marginRight: 8 },
  cycleInput: { width: 64, marginBottom: 0, textAlign: 'center' },
  cycleUnit: { fontSize: 14, color: colors.textSub, marginLeft: 8 },
  birthdayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  addButton: { backgroundColor: colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  addButtonText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  clearText: { fontSize: 14, color: colors.textTertiary },
  note: { minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
  submit: { backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
