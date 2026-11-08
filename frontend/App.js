import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';

import KakaoMap from './src/KakaoMap';
import MeetingCard from './src/MeetingCard';
import PersonManagerSheet from './src/PersonManagerSheet';
import PhotoRecordSheet from './src/PhotoRecordSheet';
import ReminderSheet from './src/ReminderSheet';
import { fetchMeetings, fetchReminders, photoUrl } from './src/api';

const DEFAULT_RATIO = 1.5; // 백엔드 기본값과 같게 맞춤

export default function App() {
  const map = useRef(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [personSheetOpen, setPersonSheetOpen] = useState(false);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [pickedAsset, setPickedAsset] = useState(null);

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

  const loadMeetings = useCallback(async () => {
    try {
      setMeetings(await fetchMeetings());
    } catch {
      // 서버 연결 오류는 연락 알림 배지에서 이미 보여준다
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const markers = useMemo(
    () =>
      meetings
        .filter((m) => m.latitude != null && m.longitude != null)
        .map((m) => ({ id: m.id, lat: m.latitude, lng: m.longitude, photoUrl: photoUrl(m.photo_path) })),
    [meetings],
  );

  const openSheet = () => {
    setSheetOpen(true);
    load();
  };

  const pickPhoto = async () => {
    // 위치 정보를 지키려고 편집·압축 없이 원본 그대로 고른다
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled) setPickedAsset(result.assets[0]);
  };

  const handleSaved = (meeting) => {
    setPickedAsset(null);
    setMeetings((list) => [meeting, ...list]);
    load(); // 만남이 늘면 연락 알림도 달라진다
    if (meeting.latitude != null && meeting.longitude != null) {
      map.current?.focus(meeting.latitude, meeting.longitude);
    } else {
      Alert.alert('저장했어요', '사진에 위치 정보가 없어 지도에는 표시되지 않습니다.');
    }
  };

  return (
    <View style={styles.container}>
      <KakaoMap
        ref={map}
        markers={markers}
        onMarkerPress={(id) => setSelectedMeeting(meetings.find((m) => m.id === id) ?? null)}
      />

      <Pressable style={styles.personButton} onPress={() => setPersonSheetOpen(true)}>
        <Text style={styles.personButtonText}>👥 사람 관리</Text>
      </Pressable>

      <Pressable style={styles.reminderButton} onPress={openSheet}>
        <Text style={styles.reminderButtonText}>연락할 사람</Text>
        <View style={[styles.badge, error && styles.badgeError]}>
          <Text style={styles.badgeText}>{error ? '!' : reminders.length}</Text>
        </View>
      </Pressable>

      <Pressable style={styles.recordButton} onPress={pickPhoto}>
        <Text style={styles.recordButtonText}>＋ 사진으로 기록</Text>
      </Pressable>

      <PersonManagerSheet
        visible={personSheetOpen}
        onClose={() => setPersonSheetOpen(false)}
        onPersonsChanged={load}
      />
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
      <PhotoRecordSheet asset={pickedAsset} onClose={() => setPickedAsset(null)} onSaved={handleSaved} />
      <MeetingCard meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} />
      <StatusBar style="dark" />
    </View>
  );
}

const TOP_OFFSET = (Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 24 : 44) + 12;

const shadow = {
  elevation: 4,
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  personButton: {
    position: 'absolute',
    top: TOP_OFFSET,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    ...shadow,
  },
  personButtonText: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
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
    ...shadow,
  },
  reminderButtonText: { fontSize: 14, fontWeight: '600', marginRight: 8 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  badgeError: { backgroundColor: '#6b7280' },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  recordButton: {
    position: 'absolute',
    right: 16,
    bottom: 40,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    ...shadow,
  },
  recordButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
