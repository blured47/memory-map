import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { deleteMemoItem, fetchPersonCard, updateMemoItem } from './api';
import { useClassifyStatus } from './autoClassify';
import { colors } from './theme';

// 서버 카드의 항목 이름과 화면에 보일 제목
const SECTIONS = [
  { key: 'interests', title: '관심사' },
  { key: 'recommendations', title: '추천받은 것' },
  { key: 'questions', title: '다음에 물어볼 것' },
  { key: 'anniversaries', title: '기념일' },
];

// 친구 화면의 "AI 카드": 만남 메모를 AI 로 분류한 내용을 항목별로 모아 보여준다.
// 항목을 누르면 고치거나 지울 수 있다 (AI 가 틀릴 수 있으므로)
export default function PersonMemoCard({ personId }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const { running, version } = useClassifyStatus();

  const load = useCallback(async () => {
    try {
      setCard(await fetchPersonCard(personId));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [personId]);

  // 처음 열 때, 그리고 뒤에서 하던 메모 분류가 끝날 때마다 다시 불러온다
  useEffect(() => {
    load();
  }, [load, version]);

  const edit = (item) => {
    // Alert.prompt 는 iOS 전용이다 (이 앱은 아이폰 앱)
    Alert.prompt(
      '내용 수정',
      undefined,
      async (content) => {
        const text = content?.trim();
        if (!text || text === item.content) return;
        try {
          await updateMemoItem(item.id, { content: text });
          load();
        } catch (e) {
          Alert.alert('수정 실패', e.message);
        }
      },
      'plain-text',
      item.content,
    );
  };

  const remove = async (item) => {
    try {
      await deleteMemoItem(item.id);
      load();
    } catch (e) {
      Alert.alert('삭제 실패', e.message);
    }
  };

  const openItem = (item) => {
    Alert.alert(item.content, item.event_date || undefined, [
      { text: '수정', onPress: () => edit(item) },
      { text: '삭제', style: 'destructive', onPress: () => remove(item) },
      { text: '취소', style: 'cancel' },
    ]);
  };

  let body;
  if (error) {
    body = <Text style={styles.empty}>카드를 불러오지 못했어요: {error}</Text>;
  } else if (!card) {
    body = <ActivityIndicator style={styles.loading} color={colors.primary} />;
  } else if (SECTIONS.every(({ key }) => card[key].length === 0)) {
    body = <Text style={styles.empty}>만남을 메모와 함께 저장하면 AI가 관심사·추천·기념일을 여기에 모아줘요</Text>;
  } else {
    body = SECTIONS.filter(({ key }) => card[key].length > 0).map(({ key, title }) => (
      <View key={key} style={styles.group}>
        <Text style={styles.groupTitle}>{title}</Text>
        <View style={styles.chips}>
          {card[key].map((item) => (
            <Pressable key={item.id} style={styles.chip} onPress={() => openItem(item)}>
              <Text style={styles.chipText}>
                {item.content}
                {item.event_date ? <Text style={styles.chipDate}> · {item.event_date}</Text> : null}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    ));
  }

  return (
    <View>
      <Text style={styles.section}>AI 카드</Text>
      {running.size > 0 ? <Text style={styles.status}>AI가 메모 분류 중…</Text> : null}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 28, marginBottom: 4 },
  status: { fontSize: 13, color: colors.textTertiary, opacity: 0.7, marginTop: 4 },
  loading: { paddingVertical: 16 },
  empty: { fontSize: 14, color: colors.textDisabled, paddingVertical: 16, textAlign: 'center', lineHeight: 20 },
  group: { marginTop: 12 },
  groupTitle: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.grey100, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  chipText: { fontSize: 14, color: colors.text },
  chipDate: { color: colors.primary, fontWeight: '600' },
});
