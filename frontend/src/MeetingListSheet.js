import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MeetingDetail } from './MeetingCard';
import { formatDateTime } from './datetime';

// 위치가 없어 지도에 안 나오는 만남까지 모두 보여주는 목록.
// iOS 는 Modal 을 나란히 겹쳐 띄울 수 없어 상세 내용도 이 시트 안에서 보여준다
export default function MeetingListSheet({ visible, onClose, meetings, onDeleted }) {
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState(null);
  const selected = meetings.find((m) => m.id === selectedId);

  const close = () => {
    setSelectedId(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {selected ? (
          <MeetingDetail
            meeting={selected}
            onClose={() => setSelectedId(null)}
            closeLabel="목록"
            onDeleted={(id) => {
              setSelectedId(null);
              onDeleted(id);
            }}
          />
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>만남 기록 ({meetings.length})</Text>
              <Pressable onPress={close} hitSlop={12}>
                <Text style={styles.close}>닫기</Text>
              </Pressable>
            </View>
            <FlatList
              data={meetings}
              keyExtractor={(m) => String(m.id)}
              renderItem={({ item }) => (
                <Pressable style={styles.item} onPress={() => setSelectedId(item.id)}>
                  <Text style={styles.place} numberOfLines={1}>
                    {item.place_name ?? '장소 미지정'}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {formatDateTime(item.met_at)} · {item.people.map((p) => p.name).join(', ')}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>아직 기록한 만남이 없어요</Text>
                </View>
              }
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '80%', minHeight: '40%', backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  close: { fontSize: 15, color: '#2563eb' },
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  place: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#4b5563', marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 15, color: '#6b7280' },
});
