import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createPersonFull,
  deletePerson,
  fetchDeletedPersons,
  fetchPersons,
  permanentDeletePerson,
  restorePerson,
  updatePerson,
} from './api';
import { formatDate } from './datetime';
import { MeetingDetail } from './MeetingCard';
import PersonDetail from './PersonDetail';
import PersonForm from './PersonForm';
import { colors, shadow } from './theme';

const UNASSIGNED = '미지정';
// 그룹 순서는 이 기기에만 저장한다
const GROUP_ORDER_KEY = 'friendGroupOrder';

// 사용자가 정한 순서대로, 순서가 없는 그룹은 그 뒤에 가나다순 ('미지정'은 맨 뒤)
function sortGroups(keys, order) {
  const rank = (key) => {
    const i = order.indexOf(key);
    return i === -1 ? Infinity : i;
  };
  return [...keys].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) < rank(b) ? -1 : 1;
    if (a === UNASSIGNED) return 1;
    if (b === UNASSIGNED) return -1;
    return a.localeCompare(b, 'ko');
  });
}

// iOS 는 Modal 을 겹쳐 띄울 수 없어 친구 화면과 만남 상세도 이 시트 안에서 바꿔 보여준다
export default function PersonManagerSheet({ visible, onClose, onPersonsChanged, meetings, onMeetingDeleted }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('list'); // 'list' | 'trash'
  const [persons, setPersons] = useState([]);
  const [deletedPersons, setDeletedPersons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [collapsedRelations, setCollapsedRelations] = useState(new Set());
  const [sortMode, setSortMode] = useState('name'); // 'name' | 'count_desc'
  const [groupOrder, setGroupOrder] = useState([]);
  const [reordering, setReordering] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [personId, setPersonId] = useState(null); // 보고 있는 친구
  const [meetingId, setMeetingId] = useState(null); // 친구 화면에서 연 만남

  const person = persons.find((p) => p.id === personId);
  const meeting = meetings.find((m) => m.id === meetingId);
  const personMeetings = useMemo(
    () => meetings.filter((m) => m.people.some((p) => p.id === personId)),
    [meetings, personId],
  );

  const loadData = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [pList, dList] = await Promise.all([fetchPersons(), fetchDeletedPersons()]);
      setPersons(pList);
      setDeletedPersons(dList);
    } catch (e) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  useEffect(() => {
    AsyncStorage.getItem(GROUP_ORDER_KEY)
      .then((saved) => saved && setGroupOrder(JSON.parse(saved)))
      .catch(() => {}); // 저장된 순서가 없거나 읽지 못하면 기본 순서
  }, []);

  // 관계별 클러스터링 및 정렬
  const clusteredPersons = useMemo(() => {
    const groups = {};
    persons.forEach((p) => {
      const rel = p.relation?.trim() || UNASSIGNED;
      if (!groups[rel]) groups[rel] = [];
      groups[rel].push(p);
    });

    // 각 그룹 내 정렬
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => {
        if (sortMode === 'count_desc') {
          return (b.meeting_count || 0) - (a.meeting_count || 0);
        }
        return a.name.localeCompare(b.name, 'ko');
      });
    });

    return sortGroups(Object.keys(groups), groupOrder).map((key) => ({
      relation: key,
      data: groups[key],
    }));
  }, [persons, sortMode, groupOrder]);

  const moveGroup = (index, offset) => {
    const keys = clusteredPersons.map((c) => c.relation);
    const target = index + offset;
    if (target < 0 || target >= keys.length) return;
    [keys[index], keys[target]] = [keys[target], keys[index]];
    // 지금 없는 그룹의 순서도 지우지 않고 뒤에 남겨 둔다 (그 관계의 친구를 다시 등록할 때를 위해)
    const next = [...keys, ...groupOrder.filter((k) => !keys.includes(k))];
    setGroupOrder(next);
    AsyncStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(next)).catch(() => {});
  };

  const toggleCollapse = (relation) => {
    setCollapsedRelations((prev) => {
      const next = new Set(prev);
      if (next.has(relation)) next.delete(relation);
      else next.add(relation);
      return next;
    });
  };

  const allCollapsed =
    clusteredPersons.length > 0 && clusteredPersons.every((c) => collapsedRelations.has(c.relation));
  const toggleAll = () =>
    setCollapsedRelations(allCollapsed ? new Set() : new Set(clusteredPersons.map((c) => c.relation)));

  const close = () => {
    setPersonId(null);
    setMeetingId(null);
    setReordering(false);
    onClose();
  };

  // 인물 소프트 삭제 (휴지통으로 이동)
  const handleDeletePerson = (target) => {
    Alert.alert(
      '휴지통으로 이동',
      `'${target.name}' 님을 휴지통으로 이동하시겠습니까?\n(30일간 보관되며 언제든 복구할 수 있습니다)`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '이동',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePerson(target.id);
              setPersonId(null);
              await loadData();
              onPersonsChanged?.();
            } catch (e) {
              Alert.alert('삭제 실패', e.message);
            }
          },
        },
      ],
    );
  };

  // 인물 복구
  const handleRestorePerson = async (target) => {
    try {
      await restorePerson(target.id);
      await loadData();
      onPersonsChanged?.();
      Alert.alert('복구 완료', `'${target.name}' 님이 원래 목록으로 복구되었습니다.`);
    } catch (e) {
      Alert.alert('복구 실패', e.message);
    }
  };

  // 인물 영구 완전 삭제
  const handlePermanentDelete = (target) => {
    Alert.alert(
      '영구 완전 삭제',
      `'${target.name}' 님을 데이터베이스에서 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '완전 삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await permanentDeletePerson(target.id);
              await loadData();
              onPersonsChanged?.();
            } catch (e) {
              Alert.alert('삭제 실패', e.message);
            }
          },
        },
      ],
    );
  };

  const addPerson = async (body) => {
    await createPersonFull(body);
    setShowAddForm(false);
    await loadData();
    onPersonsChanged?.();
    Alert.alert('완료', '새로운 친구가 등록되었습니다.');
  };

  const savePerson = async (body) => {
    await updatePerson(person.id, body);
    await loadData({ quiet: true });
    onPersonsChanged?.();
  };

  const handleMeetingDeleted = (id) => {
    setMeetingId(null);
    onMeetingDeleted(id);
    loadData({ quiet: true }); // 만남 횟수·마지막 만남이 바뀐다
  };

  const renderList = () => (
    <View style={styles.tabContent}>
      {/* 툴바: 추가 버튼 + 정렬, 펼치기/접기, 그룹 순서 */}
      <View style={styles.toolbar}>
        {reordering ? (
          <View />
        ) : (
          <Pressable
            style={[styles.btnAdd, showAddForm && styles.btnAddActive]}
            onPress={() => setShowAddForm(!showAddForm)}
          >
            <Text style={styles.btnAddText}>{showAddForm ? '닫기' : '친구 추가'}</Text>
          </Pressable>
        )}
        <View style={styles.toolActions}>
          {!reordering && (
            <>
              <Pressable
                style={styles.btnTool}
                onPress={() => setSortMode(sortMode === 'name' ? 'count_desc' : 'name')}
              >
                <Text style={styles.btnToolText}>{sortMode === 'name' ? '이름순' : '만남순'}</Text>
              </Pressable>
              <Pressable style={styles.btnTool} onPress={toggleAll}>
                <Text style={styles.btnToolText}>{allCollapsed ? '펼치기' : '접기'}</Text>
              </Pressable>
            </>
          )}
          <Pressable
            style={[styles.btnTool, reordering && styles.btnToolActive]}
            onPress={() => {
              setReordering(!reordering);
              setShowAddForm(false);
            }}
          >
            <Text style={[styles.btnToolText, reordering && styles.btnToolTextActive]}>
              {reordering ? '완료' : '그룹 순서'}
            </Text>
          </Pressable>
        </View>
      </View>

      {reordering && <Text style={styles.orderHint}>화살표를 눌러 그룹 순서를 바꾸세요. 이 기기에 저장돼요.</Text>}

      {showAddForm && (
        <View style={styles.formWrap}>
          <PersonForm persons={persons} onSubmit={addPerson} />
        </View>
      )}

      {/* 관계별 클러스터링 목록 */}
      <FlatList
        data={clusteredPersons}
        keyExtractor={(item) => item.relation}
        contentContainerStyle={styles.listContainer}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>등록된 친구가 없습니다.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isCollapsed = reordering || collapsedRelations.has(item.relation);
          return (
            <View style={styles.clusterBox}>
              <Pressable
                style={styles.clusterHeader}
                onPress={() => !reordering && toggleCollapse(item.relation)}
              >
                <View style={styles.clusterTitleRow}>
                  {!reordering && (
                    <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={colors.textTertiary} />
                  )}
                  <Text style={styles.clusterName}>{item.relation}</Text>
                  <View style={styles.clusterCountBadge}>
                    <Text style={styles.clusterCountText}>{item.data.length}명</Text>
                  </View>
                </View>
                {reordering && (
                  <View style={styles.orderButtons}>
                    {[
                      ['chevron-up', -1, index === 0],
                      ['chevron-down', 1, index === clusteredPersons.length - 1],
                    ].map(([icon, offset, disabled]) => (
                      <Pressable
                        key={icon}
                        style={[styles.orderButton, disabled && styles.orderButtonDisabled]}
                        disabled={disabled}
                        onPress={() => moveGroup(index, offset)}
                        hitSlop={4}
                      >
                        <Ionicons name={icon} size={18} color={colors.textSub} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </Pressable>

              {!isCollapsed && (
                <View style={styles.clusterMembers}>
                  {item.data.map((p) => (
                    <Pressable key={p.id} style={styles.personCard} onPress={() => setPersonId(p.id)}>
                      <View style={styles.personInfo}>
                        <Text style={styles.personName}>{p.name}</Text>
                        <Text style={styles.personMeta}>
                          만남 {p.meeting_count || 0}회 · 마지막 만남{' '}
                          {p.last_met_at ? formatDate(p.last_met_at) : '기록 없음'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );

  const renderTrash = () => (
    <FlatList
      data={deletedPersons}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.listContainer}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>휴지통이 비어 있습니다.</Text>
        </View>
      }
      renderItem={({ item }) => {
        // 서버 시각의 마이크로초는 기기마다 해석이 달라 초까지만 쓴다
        const deletedAt = new Date(item.deleted_at.slice(0, 19));
        const daysPassed = Math.floor((new Date() - deletedAt) / (1000 * 60 * 60 * 24));
        const daysLeft = Math.max(30 - daysPassed, 0);

        return (
          <View style={styles.trashCard}>
            <View style={styles.trashInfo}>
              <Text style={styles.trashName}>
                {item.name}{' '}
                {item.relation ? <Text style={styles.trashRelation}>({item.relation})</Text> : null}
              </Text>
              <Text style={styles.trashDays}>{daysLeft}일 후 완전히 삭제돼요</Text>
            </View>
            <View style={styles.trashActions}>
              <Pressable style={styles.btnRestore} onPress={() => handleRestorePerson(item)}>
                <Text style={styles.btnRestoreText}>복구</Text>
              </Pressable>
              <Pressable style={styles.btnPermanent} onPress={() => handlePermanentDelete(item)}>
                <Text style={styles.btnPermanentText}>영구삭제</Text>
              </Pressable>
            </View>
          </View>
        );
      }}
    />
  );

  let body;
  if (meeting) {
    body = (
      <View style={styles.formWrap}>
        <MeetingDetail
          meeting={meeting}
          onClose={() => setMeetingId(null)}
          closeLabel="뒤로"
          onDeleted={handleMeetingDeleted}
        />
      </View>
    );
  } else if (person) {
    body = (
      <PersonDetail
        key={person.id}
        person={person}
        persons={persons}
        meetings={personMeetings}
        onSave={savePerson}
        onDelete={() => handleDeletePerson(person)}
        onOpenMeeting={setMeetingId}
      />
    );
  } else {
    body = (
      <>
        {/* 탭 전환 (친구 목록 vs 휴지통) */}
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tabButton, tab === 'list' && styles.tabButtonActive]}
            onPress={() => setTab('list')}
          >
            <Text style={[styles.tabText, tab === 'list' && styles.tabTextActive]}>친구 ({persons.length})</Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, tab === 'trash' && styles.tabButtonActive]}
            onPress={() => setTab('trash')}
          >
            <Text style={[styles.tabText, tab === 'trash' && styles.tabTextActive]}>
              휴지통 ({deletedPersons.length})
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : tab === 'list' ? (
          renderList()
        ) : (
          renderTrash()
        )}
      </>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          {/* 상단 헤더 */}
          <View style={styles.header}>
            {person && !meeting ? (
              <Pressable onPress={() => setPersonId(null)} hitSlop={12}>
                <View style={styles.backRow}>
                  <Ionicons name="chevron-back" size={20} color={colors.text} />
                  <Text style={styles.backButton}>친구 목록</Text>
                </View>
              </Pressable>
            ) : (
              <Text style={styles.title}>{meeting ? '만남 기록' : '친구 목록'}</Text>
            )}
            <Pressable onPress={close} hitSlop={12}>
              <Text style={styles.close}>닫기</Text>
            </Pressable>
          </View>
          {body}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.dim },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '85%',
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  close: { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
  backRow: { flexDirection: 'row', alignItems: 'center', marginLeft: -4 },
  backButton: { fontSize: 17, color: colors.text, fontWeight: '600' },

  // 회색 바탕 위 흰 칸이 움직이는 세그먼트 탭
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.grey100,
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  tabButton: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabButtonActive: { backgroundColor: colors.white, ...shadow, shadowOpacity: 0.06, shadowRadius: 4 },
  tabText: { fontSize: 14, color: colors.textTertiary, fontWeight: '600' },
  tabTextActive: { color: colors.text, fontWeight: '700' },

  tabContent: { flex: 1 },
  centerBox: { padding: 40, alignItems: 'center' },

  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  btnAdd: { backgroundColor: colors.primaryBg, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  btnAddActive: { backgroundColor: colors.grey100 },
  btnAddText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  toolActions: { flexDirection: 'row', gap: 6 },
  btnTool: { backgroundColor: colors.grey100, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  btnToolText: { fontSize: 13, color: colors.textSub, fontWeight: '600' },
  btnToolActive: { backgroundColor: colors.primary },
  btnToolTextActive: { color: colors.white, fontWeight: '700' },
  orderHint: { fontSize: 13, color: colors.textTertiary, paddingHorizontal: 20, paddingBottom: 8 },
  formWrap: { paddingHorizontal: 20 },

  listContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  clusterBox: { marginBottom: 12, backgroundColor: colors.grey50, borderRadius: 16, overflow: 'hidden' },
  clusterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  clusterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clusterName: { fontSize: 16, fontWeight: '700', color: colors.text },
  clusterCountBadge: { backgroundColor: colors.border, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  clusterCountText: { fontSize: 12, color: colors.textSub, fontWeight: '600' },
  clusterMembers: { paddingHorizontal: 16, paddingBottom: 6 },
  personCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  personInfo: { flex: 1 },
  personName: { fontSize: 16, fontWeight: '600', color: colors.text },
  personMeta: { fontSize: 13, color: colors.textTertiary, marginTop: 3 },
  orderButtons: { flexDirection: 'row', gap: 6 },
  orderButton: { width: 36, height: 32, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  orderButtonDisabled: { opacity: 0.3 },

  trashCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.grey50,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  trashInfo: { flex: 1 },
  trashName: { fontSize: 16, fontWeight: '600', color: colors.text },
  trashRelation: { fontSize: 13, color: colors.textTertiary, fontWeight: 'normal' },
  trashDays: { fontSize: 13, color: colors.danger, marginTop: 4 },
  trashActions: { flexDirection: 'row', gap: 6 },
  btnRestore: { backgroundColor: colors.primaryBg, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  btnRestoreText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  btnPermanent: { backgroundColor: colors.dangerBg, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  btnPermanentText: { color: colors.danger, fontSize: 13, fontWeight: '600' },

  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: colors.textTertiary, fontSize: 15 },
});
