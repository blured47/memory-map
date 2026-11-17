import { FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';

export const RATIO_OPTIONS = [1.2, 1.5, 2, 3];

const CYCLE_SOURCE_LABEL = { average: '만남 기록 평균', manual: '직접 지정' };

function severityColor(ratio) {
  if (ratio >= 3) return colors.danger;
  if (ratio >= 2) return colors.warning;
  return colors.caution;
}

function ReminderItem({ person }) {
  const color = severityColor(person.overdue_ratio);
  return (
    <View style={styles.item}>
      <View style={styles.itemBody}>
        <Text style={styles.name}>
          {person.name}
          {person.relation ? <Text style={styles.relation}>  {person.relation}</Text> : null}
        </Text>
        <Text style={styles.detail}>
          마지막 만남 {person.days_since_last_met}일 전 · 평소 {person.usual_cycle_days}일마다
          ({CYCLE_SOURCE_LABEL[person.cycle_source] ?? '알 수 없음'})
        </Text>
      </View>
      <View style={[styles.ratioBadge, { backgroundColor: color }]}>
        <Text style={styles.ratioText}>{person.overdue_ratio.toFixed(1)}배</Text>
      </View>
    </View>
  );
}

export default function ReminderSheet({ visible, onClose, reminders, loading, error, ratio, onChangeRatio, onRefresh }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>연락할 사람</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>닫기</Text>
          </Pressable>
        </View>

        <Text style={styles.caption}>평소 만남 주기보다 이만큼 더 지나면 알려드려요</Text>
        <View style={styles.chips}>
          {RATIO_OPTIONS.map((r) => (
            <Pressable
              key={r}
              style={[styles.chip, r === ratio && styles.chipActive]}
              onPress={() => onChangeRatio(r)}
            >
              <Text style={[styles.chipText, r === ratio && styles.chipTextActive]}>{r}배</Text>
            </Pressable>
          ))}
        </View>

        {error ? (
          <View style={styles.empty}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retry} onPress={onRefresh}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={reminders}
            keyExtractor={(p) => String(p.id)}
            renderItem={({ item }) => <ReminderItem person={item} />}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
            ListEmptyComponent={
              loading ? null : (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>지금 연락이 필요한 사람이 없어요</Text>
                </View>
              )
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.dim },
  sheet: { maxHeight: '70%', minHeight: '40%', backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  close: { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
  caption: { fontSize: 13, color: colors.textTertiary, marginBottom: 8 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.grey100 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.textSub },
  chipTextActive: { color: colors.white, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  itemBody: { flex: 1, marginRight: 12 },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  relation: { fontSize: 13, fontWeight: '400', color: colors.textTertiary },
  detail: { fontSize: 13, color: colors.textSub, marginTop: 4 },
  ratioBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  ratioText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 15, color: colors.textTertiary },
  errorText: { fontSize: 14, color: colors.danger, textAlign: 'center' },
  retry: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primaryBg },
  retryText: { fontSize: 15, fontWeight: '600', color: colors.primary },
});
