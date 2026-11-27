import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MeetingForm from './MeetingForm';
import { colors } from './theme';

// 만남을 새로 기록하는 시트. draft.asset 이 있으면 사진으로, 없으면(직접 기록) 지금 시각에서 시작한다
export default function PhotoRecordSheet({ draft, onClose, onSaved }) {
  const insets = useSafeAreaInsets();
  const asset = draft?.asset ?? null;

  // 바깥을 실수로 눌러 적던 기록이 사라지지 않게 한 번 묻는다 ('취소' 버튼은 바로 닫는다)
  const confirmClose = () =>
    Alert.alert('기록을 그만둘까요?', '작성 중인 내용은 저장되지 않아요.', [
      { text: '계속 작성', style: 'cancel' },
      { text: '그만두기', style: 'destructive', onPress: onClose },
    ]);

  return (
    <Modal visible={!!draft} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={confirmClose} accessibilityLabel="기록 닫기" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{asset ? '사진으로 기록' : '직접 기록'}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>취소</Text>
            </Pressable>
          </View>
          {/* 새 기록마다 폼 상태를 처음부터 시작한다 */}
          {draft && <MeetingForm key={asset?.uri ?? 'manual'} asset={asset} onSaved={onSaved} />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.dim },
  sheet: { maxHeight: '90%', flexShrink: 1, backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  close: { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
});
