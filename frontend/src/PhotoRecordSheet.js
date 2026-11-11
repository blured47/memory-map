import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MeetingForm from './MeetingForm';
import { colors } from './theme';

// 만남을 새로 기록하는 시트. draft.asset 이 있으면 사진으로, 없으면(직접 기록) 지금 시각에서 시작한다
export default function PhotoRecordSheet({ draft, onClose, onSaved }) {
  const insets = useSafeAreaInsets();
  const asset = draft?.asset ?? null;

  return (
    <Modal visible={!!draft} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
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
