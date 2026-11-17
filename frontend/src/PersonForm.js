import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from './theme';

// 사람 등록·수정 폼. person 이 있으면 그 사람을 수정한다.
// onSubmit(body) 가 끝나면 저장된 것으로 본다 (실패하면 throw)
export default function PersonForm({ person, persons, onSubmit }) {
  const [name, setName] = useState(person?.name ?? '');
  const [relation, setRelation] = useState(person?.relation ?? '');
  const [cycleDays, setCycleDays] = useState(String(person?.contact_cycle_days ?? 30));
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
      const days = parseInt(cycleDays, 10);
      await onSubmit({
        name: name.trim(),
        relation: relation.trim() || null,
        contact_cycle_days: days >= 1 ? days : 30,
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
      <TextInput style={styles.input} placeholder="이름 (필수)" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="관계 (예: 대학 동기, 회사, 친구)"
        value={relation}
        onChangeText={setRelation}
      />

      {existingRelations.length > 0 && (
        <View style={styles.tagWrap}>
          <Text style={styles.tagLabel}>추천 태그:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {existingRelations.map((rel) => (
              <Pressable key={rel} style={styles.tagChip} onPress={() => setRelation(rel)}>
                <Text style={styles.tagChipText}>{rel}</Text>
              </Pressable>
            ))}
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
        />
        <Text style={styles.cycleUnit}>일마다</Text>
      </View>

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
  tagChipText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  cycleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cycleLabel: { fontSize: 14, color: colors.textSub, marginRight: 8 },
  cycleInput: { width: 64, marginBottom: 0, textAlign: 'center' },
  cycleUnit: { fontSize: 14, color: colors.textSub, marginLeft: 8 },
  submit: { backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
