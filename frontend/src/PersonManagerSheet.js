import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createPersonFull,
  deletePerson,
  fetchDeletedPersons,
  fetchPersons,
  permanentDeletePerson,
  restorePerson,
} from './api';
import { formatDate } from './datetime';

export default function PersonManagerSheet({ visible, onClose, onPersonsChanged }) {
  const [tab, setTab] = useState('list'); // 'list' | 'trash'
  const [persons, setPersons] = useState([]);
  const [deletedPersons, setDeletedPersons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [collapsedRelations, setCollapsedRelations] = useState(new Set());
  const [sortMode, setSortMode] = useState('name'); // 'name' | 'count_desc'

  // 신규 등록 폼 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRelation, setNewRelation] = useState('');
  const [newCycleDays, setNewCycleDays] = useState('30');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
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

  // 기존 등록된 모든 관계 목록 (추천 태그용)
  const existingRelations = useMemo(() => {
    const set = new Set();
    persons.forEach((p) => {
      if (p.relation && p.relation.trim()) set.add(p.relation.trim());
    });
    return Array.from(set);
  }, [persons]);

  // 관계별 클러스터링 및 정렬
  const clusteredPersons = useMemo(() => {
    const groups = {};
    persons.forEach((p) => {
      const rel = p.relation?.trim() || '미지정';
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

    // 그룹 순서 정렬 ('미지정'은 항상 맨 뒤로)
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === '미지정') return 1;
      if (b === '미지정') return -1;
      return a.localeCompare(b, 'ko');
    });

    return sortedKeys.map((key) => ({
      relation: key,
      data: groups[key],
    }));
  }, [persons, sortMode]);

  const toggleCollapse = (relation) => {
    setCollapsedRelations((prev) => {
      const next = new Set(prev);
      if (next.has(relation)) next.delete(relation);
      else next.add(relation);
      return next;
    });
  };

  const collapseAll = () => {
    const all = new Set(clusteredPersons.map((c) => c.relation));
    setCollapsedRelations(all);
  };

  const expandAll = () => {
    setCollapsedRelations(new Set());
  };

  // 인물 소프트 삭제 (휴지통으로 이동)
  const handleDeletePerson = (person) => {
    Alert.alert(
      '휴지통으로 이동',
      `'${person.name}' 님을 휴지통으로 이동하시겠습니까?\n(30일간 보관되며 언제든 복구할 수 있습니다)`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '이동',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePerson(person.id);
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
  const handleRestorePerson = async (person) => {
    try {
      await restorePerson(person.id);
      await loadData();
      onPersonsChanged?.();
      Alert.alert('복구 완료', `'${person.name}' 님이 원래 목록으로 복구되었습니다.`);
    } catch (e) {
      Alert.alert('복구 실패', e.message);
    }
  };

  // 인물 영구 완전 삭제
  const handlePermanentDelete = (person) => {
    Alert.alert(
      '영구 완전 삭제',
      `'${person.name}' 님을 데이터베이스에서 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '완전 삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await permanentDeletePerson(person.id);
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

  // 새 인물 등록 제출
  const handleAddPerson = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      return Alert.alert('입력 확인', '이름을 입력해 주세요.');
    }

    // 동명이인 검사
    const trimmedRel = newRelation.trim();
    const duplicateExact = persons.find(
      (p) => p.name.trim() === trimmedName && (p.relation?.trim() || '') === trimmedRel,
    );
    if (duplicateExact) {
      return Alert.alert('등록 불가', '이름과 관계가 완전히 동일한 인물이 이미 존재합니다.');
    }

    const duplicateNameOnly = persons.find((p) => p.name.trim() === trimmedName);
    if (duplicateNameOnly) {
      Alert.alert(
        '동명이인 주의',
        `'${duplicateNameOnly.relation || '미지정'}'에 이미 같은 이름의 인물이 있습니다. 계속 추가할까요?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '추가', onPress: () => submitNewPerson() },
        ],
      );
      return;
    }

    submitNewPerson();
  };

  const submitNewPerson = async () => {
    setSubmitting(true);
    try {
      const cycleDays = parseInt(newCycleDays, 10);
      await createPersonFull({
        name: newName.trim(),
        relation: newRelation.trim() || null,
        contact_cycle_days: isNaN(cycleDays) ? 30 : cycleDays,
      });
      setNewName('');
      setNewRelation('');
      setNewCycleDays('30');
      setShowAddForm(false);
      await loadData();
      onPersonsChanged?.();
      Alert.alert('완료', '새로운 사람이 등록되었습니다.');
    } catch (e) {
      Alert.alert('등록 실패', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {/* 상단 헤더 */}
        <View style={styles.header}>
          <Text style={styles.title}>사람 관리</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>닫기</Text>
          </Pressable>
        </View>

        {/* 탭 전환 (사람 목록 vs 휴지통) */}
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tabButton, tab === 'list' && styles.tabButtonActive]}
            onPress={() => setTab('list')}
          >
            <Text style={[styles.tabText, tab === 'list' && styles.tabTextActive]}>
              등록된 사람 ({persons.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, tab === 'trash' && styles.tabButtonActive]}
            onPress={() => setTab('trash')}
          >
            <Text style={[styles.tabText, tab === 'trash' && styles.tabTextActive]}>
              휴지통 🗑️ ({deletedPersons.length})
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : tab === 'list' ? (
          /* =================== 사람 목록 탭 =================== */
          <View style={styles.tabContent}>
            {/* 툴바: 추가 버튼 + 정렬 및 펼치기/접기 */}
            <View style={styles.toolbar}>
              <Pressable
                style={[styles.btnAdd, showAddForm && styles.btnAddActive]}
                onPress={() => setShowAddForm(!showAddForm)}
              >
                <Text style={styles.btnAddText}>{showAddForm ? '✕ 닫기' : '＋ 사람 추가'}</Text>
              </Pressable>
              <View style={styles.toolActions}>
                <Pressable
                  style={styles.btnTool}
                  onPress={() => setSortMode(sortMode === 'name' ? 'count_desc' : 'name')}
                >
                  <Text style={styles.btnToolText}>
                    {sortMode === 'name' ? '이름순' : '만남순'}
                  </Text>
                </Pressable>
                <Pressable style={styles.btnTool} onPress={expandAll}>
                  <Text style={styles.btnToolText}>펼치기</Text>
                </Pressable>
                <Pressable style={styles.btnTool} onPress={collapseAll}>
                  <Text style={styles.btnToolText}>접기</Text>
                </Pressable>
              </View>
            </View>

            {/* 사람 추가 인라인 폼 */}
            {showAddForm && (
              <View style={styles.addFormBox}>
                <Text style={styles.formTitle}>새로운 사람 등록</Text>
                <TextInput
                  style={styles.input}
                  placeholder="이름 (필수)"
                  value={newName}
                  onChangeText={setNewName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="관계 (예: 대학 동기, 회사, 친구)"
                  value={newRelation}
                  onChangeText={setNewRelation}
                />

                {/* 기존 등록된 관계 태그 추천 */}
                {existingRelations.length > 0 && (
                  <View style={styles.tagWrap}>
                    <Text style={styles.tagLabel}>추천 태그:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {existingRelations.map((rel) => (
                        <Pressable
                          key={rel}
                          style={styles.tagChip}
                          onPress={() => setNewRelation(rel)}
                        >
                          <Text style={styles.tagChipText}>{rel}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.cycleInputRow}>
                  <Text style={styles.cycleLabel}>연락 주기:</Text>
                  <TextInput
                    style={[styles.input, styles.cycleInput]}
                    placeholder="30"
                    keyboardType="number-pad"
                    value={newCycleDays}
                    onChangeText={setNewCycleDays}
                  />
                  <Text style={styles.cycleUnit}>일마다</Text>
                </View>

                <Pressable
                  style={[styles.btnSubmit, submitting && styles.btnDisabled]}
                  onPress={handleAddPerson}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.btnSubmitText}>등록 완료</Text>
                  )}
                </Pressable>
              </View>
            )}

            {/* 관계별 클러스터링 목록 */}
            <FlatList
              data={clusteredPersons}
              keyExtractor={(item) => item.relation}
              contentContainerStyle={styles.listContainer}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>등록된 사람이 없습니다.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isCollapsed = collapsedRelations.has(item.relation);
                return (
                  <View style={styles.clusterBox}>
                    <Pressable
                      style={styles.clusterHeader}
                      onPress={() => toggleCollapse(item.relation)}
                    >
                      <View style={styles.clusterTitleRow}>
                        <Text style={styles.clusterArrow}>{isCollapsed ? '▶' : '▼'}</Text>
                        <Text style={styles.clusterName}>{item.relation}</Text>
                      </View>
                      <View style={styles.clusterCountBadge}>
                        <Text style={styles.clusterCountText}>{item.data.length}명</Text>
                      </View>
                    </Pressable>

                    {!isCollapsed && (
                      <View style={styles.clusterMembers}>
                        {item.data.map((person) => (
                          <View key={person.id} style={styles.personCard}>
                            <View style={styles.personInfo}>
                              <Text style={styles.personName}>{person.name}</Text>
                              <Text style={styles.personMeta}>
                                만남 {person.meeting_count || 0}회 · 마지막 만남{' '}
                                {person.last_met_at ? formatDate(person.last_met_at) : '기록 없음'}
                              </Text>
                            </View>
                            <Pressable
                              style={styles.btnDelete}
                              onPress={() => handleDeletePerson(person)}
                              hitSlop={8}
                            >
                              <Text style={styles.btnDeleteText}>삭제</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          </View>
        ) : (
          /* =================== 휴지통 탭 =================== */
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
              const deletedAt = new Date(item.deleted_at);
              const daysPassed = Math.floor((new Date() - deletedAt) / (1000 * 60 * 60 * 24));
              const daysLeft = Math.max(30 - daysPassed, 0);

              return (
                <View style={styles.trashCard}>
                  <View style={styles.trashInfo}>
                    <Text style={styles.trashName}>
                      {item.name}{' '}
                      {item.relation ? (
                        <Text style={styles.trashRelation}>({item.relation})</Text>
                      ) : null}
                    </Text>
                    <Text style={styles.trashDays}>⏱️ {daysLeft}일 후 자동 완전 삭제</Text>
                  </View>
                  <View style={styles.trashActions}>
                    <Pressable
                      style={styles.btnRestore}
                      onPress={() => handleRestorePerson(item)}
                    >
                      <Text style={styles.btnRestoreText}>복구</Text>
                    </Pressable>
                    <Pressable
                      style={styles.btnPermanent}
                      onPress={() => handlePermanentDelete(item)}
                    >
                      <Text style={styles.btnPermanentText}>영구삭제</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    minHeight: '60%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700' },
  close: { fontSize: 14, color: '#2563eb', fontWeight: '600' },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#2563eb',
  },
  tabText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  tabTextActive: { color: '#2563eb', fontWeight: '700' },

  tabContent: { flex: 1 },
  centerBox: { padding: 40, alignItems: 'center' },

  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  btnAdd: {
    backgroundColor: '#2563eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  btnAddActive: { backgroundColor: '#64748b' },
  btnAddText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  toolActions: { flexDirection: 'row', gap: 6 },
  btnTool: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  btnToolText: { fontSize: 12, color: '#475569', fontWeight: '500' },

  addFormBox: {
    backgroundColor: '#f8fafc',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  formTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#1e293b' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
  },
  tagWrap: { marginBottom: 8 },
  tagLabel: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  tagChip: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
  },
  tagChipText: { fontSize: 12, color: '#3730a3', fontWeight: '500' },
  cycleInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cycleLabel: { fontSize: 13, color: '#475569', marginRight: 8 },
  cycleInput: { width: 60, marginBottom: 0, textAlign: 'center' },
  cycleUnit: { fontSize: 13, color: '#475569', marginLeft: 6 },
  btnSubmit: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnSubmitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },

  listContainer: { paddingHorizontal: 16, paddingBottom: 20 },
  clusterBox: {
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  clusterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
  },
  clusterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clusterArrow: { fontSize: 11, color: '#64748b' },
  clusterName: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  clusterCountBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  clusterCountText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  clusterMembers: { paddingHorizontal: 12, paddingVertical: 4 },
  personCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  personInfo: { flex: 1 },
  personName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  personMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  btnDelete: { paddingVertical: 4, paddingHorizontal: 8 },
  btnDeleteText: { fontSize: 12, color: '#ef4444' },

  trashCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  trashInfo: { flex: 1 },
  trashName: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  trashRelation: { fontSize: 13, color: '#64748b', fontWeight: 'normal' },
  trashDays: { fontSize: 12, color: '#e11d48', marginTop: 4 },
  trashActions: { flexDirection: 'row', gap: 6 },
  btnRestore: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  btnRestoreText: { color: '#2563eb', fontSize: 12, fontWeight: '600' },
  btnPermanent: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  btnPermanentText: { color: '#dc2626', fontSize: 12, fontWeight: '600' },

  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#94a3b8', fontSize: 14 },
});
