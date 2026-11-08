import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import KakaoMap from './src/KakaoMap';
import MeetingCard from './src/MeetingCard';
import MeetingListSheet from './src/MeetingListSheet';
import PersonManagerSheet from './src/PersonManagerSheet';
import PhotoRecordSheet from './src/PhotoRecordSheet';
import ReminderSheet from './src/ReminderSheet';
import { fetchMeetings, fetchReminders, photoUrl } from './src/api';

const DEFAULT_RATIO = 1.5; // 백엔드 기본값과 같게 맞춤

export default function App() {
  return (
    <SafeAreaProvider>
      <MemoryMap />
    </SafeAreaProvider>
  );
}

function MemoryMap() {
  const insets = useSafeAreaInsets();
  const map = useRef(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [personSheetOpen, setPersonSheetOpen] = useState(false);
  const [meetingListOpen, setMeetingListOpen] = useState(false);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [draft, setDraft] = useState(null); // 기록 시트: { asset } (직접 기록이면 asset 없음)

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

  const openMeetingList = () => {
    setMeetingListOpen(true);
    loadMeetings();
  };

  const pickPhoto = async () => {
    try {
      // 위치 정보를 지키려고 편집·압축 없이 원본 그대로 고른다.
      // iOS 는 Current 여야 HEIC 원본 파일이 오고, 기본값(Automatic)은 다시 인코딩하며 EXIF 를 잃는다
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      if (!result.canceled) setDraft({ asset: result.assets[0] });
    } catch (e) {
      Alert.alert('사진을 열 수 없어요', e.message);
    }
  };

  const handleSaved = (meeting) => {
    setDraft(null);
    setMeetings((list) => [meeting, ...list]);
    load(); // 만남이 늘면 연락 알림도 달라진다
    if (meeting.latitude != null && meeting.longitude != null) {
      map.current?.focus(meeting.latitude, meeting.longitude);
    } else {
      Alert.alert('저장했어요', '위치 정보가 없어 지도에는 표시되지 않습니다. 만남 기록에서 볼 수 있어요.');
    }
  };

  const handleDeleted = (id) => {
    setSelectedMeeting(null);
    setMeetings((list) => list.filter((m) => m.id !== id));
    load();
  };

  const handlePersonsChanged = () => {
    load();
    loadMeetings(); // 이름이 바뀌거나 영구 삭제되면 만남 기록에도 반영된다
  };

  const top = insets.top + 12;
  const bottom = Math.max(insets.bottom + 16, 40); // 지도 왼쪽 아래 카카오 로고를 가리지 않게

  return (
    <View style={styles.container}>
      <KakaoMap
        ref={map}
        markers={markers}
        onMarkerPress={(id) => setSelectedMeeting(meetings.find((m) => m.id === id) ?? null)}
      />

      <Pressable style={[styles.personButton, { top }]} onPress={() => setPersonSheetOpen(true)}>
        <Text style={styles.personButtonText}>👥 사람 관리</Text>
      </Pressable>

      <Pressable style={[styles.reminderButton, { top }]} onPress={openSheet}>
        <Text style={styles.reminderButtonText}>연락할 사람</Text>
        <View style={[styles.badge, error && styles.badgeError]}>
          <Text style={styles.badgeText}>{error ? '!' : reminders.length}</Text>
        </View>
      </Pressable>

      <Pressable style={[styles.meetingButton, { bottom }]} onPress={openMeetingList}>
        <Text style={styles.personButtonText}>📋 만남 기록</Text>
      </Pressable>

      <View style={[styles.recordButtons, { bottom }]}>
        <Pressable style={styles.manualButton} onPress={() => setDraft({})}>
          <Text style={styles.personButtonText}>✏️ 직접 기록</Text>
        </Pressable>
        <Pressable style={styles.recordButton} onPress={pickPhoto}>
          <Text style={styles.recordButtonText}>＋ 사진으로 기록</Text>
        </Pressable>
      </View>

      <PersonManagerSheet
        visible={personSheetOpen}
        onClose={() => setPersonSheetOpen(false)}
        onPersonsChanged={handlePersonsChanged}
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
      <MeetingListSheet
        visible={meetingListOpen}
        onClose={() => setMeetingListOpen(false)}
        meetings={meetings}
        onDeleted={handleDeleted}
      />
      <PhotoRecordSheet draft={draft} onClose={() => setDraft(null)} onSaved={handleSaved} />
      <MeetingCard meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} onDeleted={handleDeleted} />
      <StatusBar style="dark" />
    </View>
  );
}

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
  meetingButton: {
    position: 'absolute',
    left: 12,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    ...shadow,
  },
  recordButtons: { position: 'absolute', right: 16, alignItems: 'flex-end', gap: 10 },
  manualButton: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    ...shadow,
  },
  recordButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    ...shadow,
  },
  recordButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
