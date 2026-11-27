import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchDeletedMeetings, permanentDeleteMeeting, restoreMeeting } from './api';
import DateTimeField from './DateTimeField';
import { MeetingDetail } from './MeetingCard';
import { formatDateTime, parseLocalIso, toDateValue } from './datetime';
import { peopleLabel } from './people';
import { colors } from './theme';

const PERIODS = [
  { key: 'all', label: '전체' },
  { key: 'month', label: '이번 달' },
  { key: '3months', label: '최근 3개월' },
  { key: 'year', label: '올해' },
  { key: 'custom', label: '직접 선택' },
];

const INITIAL_FILTER = { query: '', period: 'all', from: '', to: '', personId: null, photoOnly: false, noLocationOnly: false };

// 기간 선택을 "YYYY-MM-DD" 범위로. 끝이 열려 있으면 null
function periodRange(filter) {
  const today = new Date();
  switch (filter.period) {
    case 'month':
      return { from: toDateValue(new Date(today.getFullYear(), today.getMonth(), 1)), to: null };
    case '3months':
      return { from: toDateValue(new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())), to: null };
    case 'year':
      return { from: `${today.getFullYear()}-01-01`, to: null };
    case 'custom':
      return { from: filter.from, to: filter.to };
    default:
      return { from: null, to: null };
  }
}

function applyFilter(meetings, filter) {
  const { from, to } = periodRange(filter);
  const query = filter.query.trim().toLowerCase();
  return meetings.filter((m) => {
    // met_at 은 "2026-10-20T18:30:00" 형식이라 앞 10자리를 문자열로 비교하면 날짜 비교가 된다
    const day = m.met_at.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (filter.personId != null && !m.people.some((p) => p.id === filter.personId)) return false;
    if (filter.photoOnly && !m.photo_path) return false;
    if (filter.noLocationOnly && m.latitude != null && m.longitude != null) return false;
    if (query) {
      const text = [m.place_name, m.memo, peopleLabel(m)].filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });
}

// 최신순으로 정렬해 월별로 묶는다
function groupByMonth(meetings) {
  const sections = [];
  [...meetings]
    .sort((a, b) => b.met_at.localeCompare(a.met_at))
    .forEach((m) => {
      const key = m.met_at.slice(0, 7);
      let section = sections[sections.length - 1];
      if (section?.key !== key) {
        section = { key, title: `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`, data: [] };
        sections.push(section);
      }
      section.data.push(m);
    });
  return sections;
}

// 만남이 있는 사람만, 자주 만난 순
function peopleInMeetings(meetings) {
  const counts = new Map();
  meetings.forEach((m) =>
    m.people.forEach((p) => {
      const entry = counts.get(p.id) ?? { id: p.id, name: p.name, count: 0 };
      entry.count += 1;
      counts.set(p.id, entry);
    }),
  );
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// 위치가 없어 지도에 안 나오는 만남까지 모두 보여주는 목록.
// iOS 는 Modal 을 나란히 겹쳐 띄울 수 없어 상세 내용도 이 시트 안에서 보여준다
const TRASH_DAYS = 30; // 서버(app/trash.py)와 같게

// 휴지통에서 완전히 지워지기까지 남은 날
function daysLeft(deletedAt) {
  const passed = Math.floor((Date.now() - parseLocalIso(deletedAt).getTime()) / 86400000);
  return Math.max(TRASH_DAYS - passed, 0);
}

// 휴지통 탭: 지운 만남을 복구하거나 완전히 지운다
function MeetingTrash({ visible, onRestored }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchDeletedMeetings());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const restore = async (m) => {
    setBusyId(m.id);
    try {
      const restored = await restoreMeeting(m.id);
      setItems((list) => list.filter((x) => x.id !== m.id));
      onRestored(restored);
    } catch (e) {
      Alert.alert('복구 실패', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const removeForever = (m) => {
    Alert.alert('완전 삭제', '이 만남 기록을 완전히 삭제할까요?\n사진과 AI 카드 내용도 함께 지워지고 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '완전 삭제',
        style: 'destructive',
        onPress: async () => {
          setBusyId(m.id);
          try {
            await permanentDeleteMeeting(m.id);
            setItems((list) => list.filter((x) => x.id !== m.id));
          } catch (e) {
            Alert.alert('삭제 실패', e.message);
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (error) {
    return (
      <View style={styles.empty}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
  if (!items) return <ActivityIndicator style={styles.loading} color={colors.primary} />;

  return (
    <FlatList
      style={styles.flex}
      data={items}
      keyExtractor={(m) => String(m.id)}
      ListHeaderComponent={<Text style={styles.trashCaption}>지운 만남은 {TRASH_DAYS}일 뒤 완전히 삭제돼요</Text>}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>휴지통이 비어 있어요</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.trashItem}>
          <View style={styles.flex}>
            <Text style={styles.place} numberOfLines={1}>
              {item.place_name ?? '장소 미지정'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {formatDateTime(item.met_at)}
              {peopleLabel(item) ? ` · ${peopleLabel(item)}` : ''}
            </Text>
            <Text style={styles.trashDays}>{daysLeft(item.deleted_at)}일 후 완전히 삭제돼요</Text>
          </View>
          <View style={styles.trashActions}>
            <Pressable
              style={[styles.btnRestore, busyId === item.id && styles.disabled]}
              onPress={() => restore(item)}
              disabled={busyId === item.id}
            >
              <Text style={styles.btnRestoreText}>복구</Text>
            </Pressable>
            <Pressable
              style={[styles.btnPermanent, busyId === item.id && styles.disabled]}
              onPress={() => removeForever(item)}
              disabled={busyId === item.id}
            >
              <Text style={styles.btnPermanentText}>완전 삭제</Text>
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}

export default function MeetingListSheet({ visible, onClose, meetings, onDeleted, onUpdated, onRestored }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('list'); // 'list' | 'trash'
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState(INITIAL_FILTER);
  const selected = meetings.find((m) => m.id === selectedId);

  const people = useMemo(() => peopleInMeetings(meetings), [meetings]);
  const filtered = useMemo(() => applyFilter(meetings, filter), [meetings, filter]);
  const sections = useMemo(() => groupByMonth(filtered), [filtered]);
  const filtering = JSON.stringify(filter) !== JSON.stringify(INITIAL_FILTER);

  const update = (changes) => setFilter((f) => ({ ...f, ...changes }));

  // 직접 선택을 처음 누르면 최근 한 달로 시작한다
  const selectPeriod = (period) => {
    if (period === 'custom' && !filter.from) {
      const today = new Date();
      const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
      update({ period, from: toDateValue(monthAgo), to: toDateValue(today) });
    } else {
      update({ period });
    }
  };

  const close = () => {
    setSelectedId(null);
    setTab('list');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={[styles.sheet, !selected && styles.sheetList, { paddingBottom: insets.bottom + 16 }]}>
          {selected ? (
            <MeetingDetail
              meeting={selected}
              onClose={() => setSelectedId(null)}
              closeLabel="목록"
              onUpdated={onUpdated}
              onDeleted={(id) => {
                setSelectedId(null);
                onDeleted(id);
              }}
            />
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>만남 기록</Text>
                <Pressable onPress={close} hitSlop={12}>
                  <Text style={styles.close}>닫기</Text>
                </Pressable>
              </View>

              <View style={styles.tabBar}>
                {[
                  ['list', `기록 (${meetings.length})`],
                  ['trash', '휴지통'],
                ].map(([key, label]) => (
                  <Pressable
                    key={key}
                    style={[styles.tabButton, tab === key && styles.tabButtonActive]}
                    onPress={() => setTab(key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === key }}
                  >
                    <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              {tab === 'trash' ? (
                <MeetingTrash visible={visible && tab === 'trash'} onRestored={onRestored} />
              ) : (
                <>
                <TextInput
                  style={styles.input}
                  value={filter.query}
                  onChangeText={(query) => update({ query })}
                  placeholder="장소, 메모, 이름으로 검색"
                  placeholderTextColor={colors.textDisabled}
                  clearButtonMode="while-editing"
                  returnKeyType="search"
                />

                <Text style={styles.label}>기간</Text>
                <ScrollView horizontal style={styles.chipScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {PERIODS.map((p) => (
                    <Chip key={p.key} label={p.label} active={filter.period === p.key} onPress={() => selectPeriod(p.key)} />
                  ))}
                </ScrollView>
                {filter.period === 'custom' && (
                  <View style={styles.dateRow}>
                    <DateTimeField
                      mode="date"
                      value={parseLocalIso(filter.from)}
                      maximumDate={parseLocalIso(filter.to)}
                      onChange={(d) => update({ from: toDateValue(d) })}
                    />
                    <Text style={styles.dateDash}>~</Text>
                    <DateTimeField
                      mode="date"
                      value={parseLocalIso(filter.to)}
                      minimumDate={parseLocalIso(filter.from)}
                      onChange={(d) => update({ to: toDateValue(d) })}
                    />
                  </View>
                )}

                {people.length > 0 && (
                  <>
                    <Text style={styles.label}>사람</Text>
                    <ScrollView horizontal style={styles.chipScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                      <Chip label="전체" active={filter.personId == null} onPress={() => update({ personId: null })} />
                      {people.map((p) => (
                        <Chip
                          key={p.id}
                          label={`${p.name} ${p.count}`}
                          active={filter.personId === p.id}
                          onPress={() => update({ personId: filter.personId === p.id ? null : p.id })}
                        />
                      ))}
                    </ScrollView>
                  </>
                )}

                <Text style={styles.label}>조건</Text>
                <View style={styles.chips}>
                  <Chip label="사진 있음" active={filter.photoOnly} onPress={() => update({ photoOnly: !filter.photoOnly })} />
                  <Chip
                    label="지도에 없음"
                    active={filter.noLocationOnly}
                    onPress={() => update({ noLocationOnly: !filter.noLocationOnly })}
                  />
                </View>

                <View style={styles.summary}>
                  <Text style={styles.summaryText}>
                    {filtering ? `${filtered.length}개 / 전체 ${meetings.length}개` : `전체 ${meetings.length}개`}
                  </Text>
                  {filtering && (
                    <Pressable onPress={() => setFilter(INITIAL_FILTER)} hitSlop={8}>
                      <Text style={styles.reset}>필터 초기화</Text>
                    </Pressable>
                  )}
                </View>

                <SectionList
                  style={styles.flex}
                  sections={sections}
                  keyExtractor={(m) => String(m.id)}
                  keyboardShouldPersistTaps="handled"
                  stickySectionHeadersEnabled
                  renderSectionHeader={({ section }) => (
                    <Text style={styles.sectionHeader}>
                      {section.title} · {section.data.length}
                    </Text>
                  )}
                  renderItem={({ item }) => (
                    <Pressable style={styles.item} onPress={() => setSelectedId(item.id)}>
                      <Text style={styles.place} numberOfLines={1}>
                        {item.place_name ?? '장소 미지정'}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {formatDateTime(item.met_at)}
                        {peopleLabel(item) ? ` · ${peopleLabel(item)}` : ''}
                      </Text>
                      {item.memo ? (
                        <Text style={styles.memo} numberOfLines={1}>
                          {item.memo}
                        </Text>
                      ) : null}
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View style={styles.empty}>
                      <Text style={styles.emptyText}>
                        {meetings.length === 0 ? '아직 기록한 만남이 없어요' : '조건에 맞는 만남이 없어요'}
                      </Text>
                    </View>
                  }
                />
                </>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.dim },
  sheet: { maxHeight: '90%', minHeight: '40%', flexShrink: 1, backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 24 },
  sheetList: { height: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  close: { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
  input: { backgroundColor: colors.grey100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginTop: 12, marginBottom: 6 },
  chipScroll: { flexGrow: 0 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.grey100 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.textSub },
  chipTextActive: { color: colors.white, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dateDash: { marginHorizontal: 8, color: colors.textTertiary },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 4 },
  summaryText: { fontSize: 13, color: colors.textSub },
  reset: { fontSize: 13, color: colors.primary },
  sectionHeader: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, backgroundColor: colors.white, paddingTop: 16, paddingBottom: 4 },
  item: { paddingVertical: 14 },
  place: { fontSize: 17, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textSub, marginTop: 4 },
  memo: { fontSize: 13, color: colors.textTertiary, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 15, color: colors.textTertiary },
  loading: { paddingVertical: 32 },
  errorText: { fontSize: 14, color: colors.danger, textAlign: 'center' },
  retry: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primaryBg },
  retryText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  disabled: { opacity: 0.5 },

  // 친구 목록과 같은 세그먼트 탭
  tabBar: { flexDirection: 'row', backgroundColor: colors.grey100, borderRadius: 12, padding: 4, marginBottom: 12 },
  tabButton: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabButtonActive: { backgroundColor: colors.white },
  tabText: { fontSize: 14, color: colors.textTertiary, fontWeight: '600' },
  tabTextActive: { color: colors.text, fontWeight: '700' },

  trashCaption: { fontSize: 13, color: colors.textTertiary, marginBottom: 4 },
  trashItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 10 },
  trashDays: { fontSize: 12, color: colors.danger, marginTop: 4 },
  trashActions: { flexDirection: 'row', gap: 6 },
  btnRestore: { backgroundColor: colors.primaryBg, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  btnRestoreText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  btnPermanent: { backgroundColor: colors.dangerBg, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  btnPermanentText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
});
