import { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteMeeting, photoUrl } from './api';
import { formatDateTime } from './datetime';
import { colors } from './theme';

// 만남 한 건의 내용. 지도 카드와 만남 기록 목록에서 함께 쓴다
export function MeetingDetail({ meeting, onClose, closeLabel = '닫기', onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const uri = photoUrl(meeting.photo_path);

  const confirmDelete = () => {
    Alert.alert('만남 삭제', '이 만남 기록을 삭제할까요? 되돌릴 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteMeeting(meeting.id);
            onDeleted(meeting.id);
          } catch (e) {
            Alert.alert('삭제 실패', e.message);
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView>
      {uri && <Image source={{ uri }} style={styles.photo} resizeMode="cover" />}
      <View style={styles.header}>
        <Text style={styles.place}>{meeting.place_name ?? '장소 미지정'}</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>{closeLabel}</Text>
        </Pressable>
      </View>
      <Text style={styles.meta}>{formatDateTime(meeting.met_at)}</Text>
      <Text style={styles.meta}>{meeting.people.map((p) => p.name).join(', ')}</Text>
      {meeting.memo ? <Text style={styles.memo}>{meeting.memo}</Text> : null}
      <Pressable style={styles.delete} onPress={confirmDelete} disabled={deleting}>
        <Text style={styles.deleteText}>{deleting ? '삭제 중…' : '이 만남 삭제'}</Text>
      </Pressable>
    </ScrollView>
  );
}

// 지도에서 마커를 눌렀을 때 보여주는 만남 카드
export default function MeetingCard({ meeting, onClose, onDeleted }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!meeting} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {meeting && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <MeetingDetail meeting={meeting} onClose={onClose} onDeleted={onDeleted} />
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.dim },
  sheet: { maxHeight: '80%', backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 24 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: colors.border, marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  place: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1, marginRight: 12 },
  close: { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
  meta: { fontSize: 14, color: colors.textSub, marginTop: 4 },
  memo: { fontSize: 16, color: colors.text, marginTop: 16, lineHeight: 24 },
  delete: { marginTop: 24, paddingVertical: 15, borderRadius: 14, backgroundColor: colors.dangerBg, alignItems: 'center' },
  deleteText: { fontSize: 14, fontWeight: '600', color: colors.danger },
});
