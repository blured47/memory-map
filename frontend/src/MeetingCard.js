import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteMeeting, photoUrl } from './api';
import { startClassify, useClassifyStatus } from './autoClassify';
import { formatDateTime } from './datetime';
import MeetingForm from './MeetingForm';
import { peopleLabel } from './people';
import { colors } from './theme';

// 만남 한 건의 내용. 지도 카드, 만남 기록 목록, 친구 화면에서 함께 쓴다.
// iOS 는 Modal 을 겹쳐 띄울 수 없어 수정도 이 자리에서 폼으로 바꿔 보여준다
export function MeetingDetail({ meeting, onClose, closeLabel = '닫기', onDeleted, onUpdated }) {
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const { running, failed } = useClassifyStatus();
  const uri = photoUrl(meeting.photo_path);

  const confirmDelete = () => {
    Alert.alert('휴지통으로 이동', '이 만남 기록을 휴지통으로 옮길까요?\n30일 동안 만남 기록 > 휴지통에서 복구할 수 있어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '이동',
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

  if (editing) {
    return (
      <>
        <View style={styles.header}>
          <Text style={styles.place}>만남 수정</Text>
          <Pressable onPress={() => setEditing(false)} hitSlop={12}>
            <Text style={styles.close}>취소</Text>
          </Pressable>
        </View>
        <MeetingForm
          meeting={meeting}
          onSaved={(updated) => {
            setEditing(false);
            onUpdated(updated);
          }}
        />
      </>
    );
  }

  const busyDeleting = deleting;
  const isClassifying = running.has(meeting.id);
  const classifyError = failed.get(meeting.id);

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
      {peopleLabel(meeting) ? <Text style={styles.meta}>{peopleLabel(meeting)}</Text> : null}
      {meeting.memo ? <Text style={styles.memo}>{meeting.memo}</Text> : null}
      {/* 저장하면 메모는 자동으로 분류된다. 실패했을 때만 다시 시도할 수 있게 한다 */}
      {isClassifying ? (
        <Text style={styles.classifyStatus}>AI가 메모 분류 중…</Text>
      ) : classifyError ? (
        <Pressable onPress={() => startClassify(meeting.id)} disabled={busyDeleting} hitSlop={8}>
          <Text style={styles.classifyFailed}>메모 분류 실패 ({classifyError}) · 다시 시도</Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          style={[styles.edit, busyDeleting && styles.disabled]}
          onPress={() => setEditing(true)}
          disabled={busyDeleting}
        >
          <Text style={styles.editText}>수정</Text>
        </Pressable>
        <Pressable
          style={[styles.delete, busyDeleting && styles.disabled]}
          onPress={confirmDelete}
          disabled={busyDeleting}
        >
          <Text style={styles.deleteText}>{deleting ? '옮기는 중…' : '삭제'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// 지도에서 마커를 눌렀을 때 보여주는 만남 카드
export default function MeetingCard({ meeting, onClose, onDeleted, onUpdated }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!meeting} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        {meeting && (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <MeetingDetail meeting={meeting} onClose={onClose} onDeleted={onDeleted} onUpdated={onUpdated} />
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.dim },
  sheet: { maxHeight: '90%', flexShrink: 1, backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 24 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: colors.border, marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  place: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1, marginRight: 12 },
  close: { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
  meta: { fontSize: 14, color: colors.textSub, marginTop: 4 },
  memo: { fontSize: 16, color: colors.text, marginTop: 16, lineHeight: 24 },
  classifyStatus: { fontSize: 13, color: colors.textTertiary, opacity: 0.7, marginTop: 10 },
  classifyFailed: { fontSize: 13, color: colors.danger, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 24 },
  edit: { flex: 1, paddingVertical: 15, borderRadius: 14, backgroundColor: colors.primaryBg, alignItems: 'center' },
  editText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  delete: { paddingVertical: 15, paddingHorizontal: 24, borderRadius: 14, backgroundColor: colors.dangerBg, alignItems: 'center' },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  disabled: { opacity: 0.5 },
});
