import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import KakaoMap from './src/KakaoMap';
import ReminderSheet from './src/ReminderSheet';
import { fetchReminders } from './src/api';

const DEFAULT_RATIO = 1.5; // 백엔드 기본값과 같게 맞춤

export default function App() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const data = await fetchReminders(ratio);
      if (requestId !== latestRequest.current) return; // 비율을 바꾼 뒤 도착한 이전 응답은 버림
      setReminders(data);
      setError(null);
    } catch (e) {
      if (requestId === latestRequest.current) setError(e.message);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [ratio]);

  useEffect(() => {
    load();
  }, [load]);

  const openSheet = () => {
    setSheetOpen(true);
    load();
  };

  return (
    <View style={styles.container}>
      <KakaoMap />

      <Pressable style={styles.reminderButton} onPress={openSheet}>
        <Text style={styles.reminderButtonText}>연락할 사람</Text>
        <View style={[styles.badge, error && styles.badgeError]}>
          <Text style={styles.badgeText}>{error ? '!' : reminders.length}</Text>
        </View>
      </Pressable>

      <ReminderSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        reminders={reminders}
        loading={loading}
        error={error}
        ratio={ratio}
        onChangeRatio={setRatio}
        onRefresh={load}
      />
      <StatusBar style="dark" />
    </View>
  );
}

const TOP_OFFSET = (Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 24 : 44) + 12;

const styles = StyleSheet.create({
  container: { flex: 1 },
  reminderButton: {
    position: 'absolute',
    top: TOP_OFFSET,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  reminderButtonText: { fontSize: 14, fontWeight: '600', marginRight: 8 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  badgeError: { backgroundColor: '#6b7280' },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
