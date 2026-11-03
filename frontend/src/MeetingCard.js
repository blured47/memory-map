import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { photoUrl } from './api';
import { formatDateTime } from './datetime';

// 지도에서 마커를 눌렀을 때 보여주는 만남 카드
export default function MeetingCard({ meeting, onClose }) {
  const uri = photoUrl(meeting?.photo_path);

  return (
    <Modal visible={!!meeting} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {meeting && (
        <View style={styles.sheet}>
          <ScrollView>
            {uri && <Image source={{ uri }} style={styles.photo} resizeMode="cover" />}
            <View style={styles.header}>
              <Text style={styles.place}>{meeting.place_name ?? '장소 미지정'}</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={styles.close}>닫기</Text>
              </Pressable>
            </View>
            <Text style={styles.meta}>{formatDateTime(meeting.met_at)}</Text>
            <Text style={styles.meta}>{meeting.people.map((p) => p.name).join(', ')}</Text>
            {meeting.memo ? <Text style={styles.memo}>{meeting.memo}</Text> : null}
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '80%', backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 24 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: '#e5e7eb', marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  place: { fontSize: 18, fontWeight: '700', flex: 1, marginRight: 12 },
  close: { fontSize: 15, color: '#2563eb' },
  meta: { fontSize: 14, color: '#4b5563', marginTop: 4 },
  memo: { fontSize: 15, color: '#111827', marginTop: 12, lineHeight: 22 },
});
