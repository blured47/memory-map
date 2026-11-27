import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { deleteMemoItem, fetchPersonCard, updateMemoItem } from './api';
import { useClassifyStatus } from './autoClassify';
import { colors } from './theme';

// 서버 카드의 항목 이름과 화면에 보일 제목
const SECTIONS = [
  { key: 'interests', category: 'interest', title: '관심사' },
  { key: 'recommendations', category: 'recommendation', title: '추천받은 것' },
  { key: 'questions', category: 'question', title: '다음에 물어볼 것' },
  { key: 'anniversaries', category: 'anniversary', title: '기념일' },
];

// 친구 화면의 "AI 카드": 만남 메모를 AI 로 분류한 내용을 항목별로 모아 보여준다.
// 항목을 누르면 iOS/Android 모두에서 항목 종류·내용·날짜를 고치거나 지울 수 있다 (AI 가 틀릴 수 있으므로)
// meetingIds: 이 친구가 함께한 만남. 그 만남을 분류할 때만 '분류 중'을 보여준다
export default function PersonMemoCard({ personId, meetingIds = [] }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [category, setCategory] = useState('interest');
  const [content, setContent] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saving, setSaving] = useState(false);
  const { running, version } = useClassifyStatus();

  const load = useCallback(async () => {
    try {
      setCard(await fetchPersonCard(personId));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [personId]);

  useEffect(() => {
    setEditingItem(null);
  }, [personId]);

  // 처음 열 때, 그리고 뒤에서 하던 메모 분류가 끝날 때마다 다시 불러온다
  useEffect(() => {
    load();
  }, [load, version]);

  const startEdit = (item) => {
    if (editingItem?.id === item.id) {
      setEditingItem(null);
      return;
    }
    setEditingItem(item);
    setCategory(item.category);
    setContent(item.content);
    setEventDate(item.event_date ?? '');
  };

  const saveEdit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      Alert.alert('입력 확인', '내용을 입력해 주세요.');
      return;
    }
    setSaving(true);
    try {
      await updateMemoItem(editingItem.id, {
        category,
        content: trimmed,
        event_date: category === 'anniversary' ? eventDate.trim() || null : null,
      });
      setEditingItem(null);
      await load();
    } catch (e) {
      Alert.alert('수정 실패', e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (item) => {
    Alert.alert('항목 삭제', `'${item.content}' 항목을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await deleteMemoItem(item.id);
            setEditingItem(null);
            await load();
          } catch (e) {
            Alert.alert('삭제 실패', e.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  let body;
  if (error) {
    body = (
      <View style={styles.errorBox}>
        <Text style={styles.empty}>카드를 불러오지 못했어요: {error}</Text>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  } else if (!card) {
    body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  } else if (SECTIONS.every(({ key }) => card[key].length === 0)) {
    body = <Text style={styles.empty}>만남을 메모와 함께 저장하면 AI가 관심사·추천·기념일을 여기에 모아줘요</Text>;
  } else {
    body = (
      <>
        {SECTIONS.filter(({ key }) => card[key].length > 0).map(({ key, title }) => (
          <View key={key} style={styles.group}>
            <Text style={styles.groupTitle}>{title}</Text>
            <View style={styles.chips}>
              {card[key].map((item) => {
                const active = editingItem?.id === item.id;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => startEdit(item)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {item.content}
                      {item.event_date ? (
                        <Text style={[styles.chipDate, active && styles.chipTextActive]}> · {item.event_date}</Text>
                      ) : null}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {editingItem && (
          <View style={styles.editBox}>
            <View style={styles.editHeader}>
              <Text style={styles.editTitle}>AI 카드 항목 수정</Text>
              <Pressable onPress={() => setEditingItem(null)} hitSlop={8}>
                <Text style={styles.editCancel}>취소</Text>
              </Pressable>
            </View>
            <View style={styles.catRow}>
              {SECTIONS.map((s) => (
                <Pressable
                  key={s.category}
                  style={[styles.catChip, category === s.category && styles.catChipActive]}
                  onPress={() => setCategory(s.category)}
                >
                  <Text style={[styles.catText, category === s.category && styles.catTextActive]}>{s.title}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={content}
              onChangeText={setContent}
              placeholder="내용"
            />
            {category === 'anniversary' && (
              <TextInput
                style={styles.input}
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="날짜 (예: 3월 14일)"
                maxLength={50}
              />
            )}
            <View style={styles.editActions}>
              <Pressable style={[styles.btnSave, saving && styles.disabled]} onPress={saveEdit} disabled={saving}>
                <Text style={styles.btnSaveText}>{saving ? '저장 중…' : '저장'}</Text>
              </Pressable>
              <Pressable
                style={[styles.btnDelete, saving && styles.disabled]}
                onPress={() => confirmDelete(editingItem)}
                disabled={saving}
              >
                <Text style={styles.btnDeleteText}>삭제</Text>
              </Pressable>
            </View>
          </View>
        )}
      </>
    );
  }

  return (
    <View>
      <Text style={styles.section}>AI 카드</Text>
      {meetingIds.some((id) => running.has(id)) ? <Text style={styles.status}>AI가 메모 분류 중…</Text> : null}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 28, marginBottom: 4 },
  status: { fontSize: 13, color: colors.textTertiary, opacity: 0.7, marginTop: 4 },
  loading: { paddingVertical: 16 },
  errorBox: { alignItems: 'center', paddingVertical: 8 },
  retryBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primaryBg },
  retryText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  empty: { fontSize: 14, color: colors.textDisabled, paddingVertical: 16, textAlign: 'center', lineHeight: 20 },
  group: { marginTop: 12 },
  groupTitle: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.grey100, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text },
  chipTextActive: { color: colors.white, fontWeight: '600' },
  chipDate: { color: colors.primary, fontWeight: '600' },
  editBox: { marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: colors.grey50, gap: 8 },
  editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  editCancel: { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.white },
  catChipActive: { backgroundColor: colors.primaryBg },
  catText: { fontSize: 12, fontWeight: '600', color: colors.textSub },
  catTextActive: { color: colors.primary },
  input: { backgroundColor: colors.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  btnSave: { flex: 1, backgroundColor: colors.primary, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  btnSaveText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  btnDelete: { backgroundColor: colors.dangerBg, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center' },
  btnDeleteText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
