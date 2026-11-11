import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import KakaoMap from './src/KakaoMap';
import MeetingCard from './src/MeetingCard';
import MeetingListSheet from './src/MeetingListSheet';
import PersonManagerSheet from './src/PersonManagerSheet';
import PhotoRecordSheet from './src/PhotoRecordSheet';
import ReminderSheet from './src/ReminderSheet';
import { fetchMeetings, fetchReminders, photoUrl } from './src/api';
import { colors, radius, shadow } from './src/theme';

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
  const [locating, setLocating] = useState(false);

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

  const handleUpdated = (meeting) => {
    setMeetings((list) => list.map((m) => (m.id === meeting.id ? meeting : m)));
    setSelectedMeeting((m) => (m?.id === meeting.id ? meeting : m));
    load(); // 날짜·사람이 바뀌면 연락 알림도 달라진다
  };

  const handleDeleted = (id) => {
    setSelectedMeeting(null);
    setMeetings((list) => list.filter((m) => m.id !== id));
    load();
  };

  const goToMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('위치 권한이 필요해요', '설정에서 이 앱의 위치 접근을 허용해 주세요.');
        return;
      }
      // 마지막으로 알던 위치로 먼저 옮기고, 정확한 위치가 오면 다시 옮긴다
      const last = await Location.getLastKnownPositionAsync();
      if (last) map.current?.showMyLocation(last.coords.latitude, last.coords.longitude);
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      map.current?.showMyLocation(coords.latitude, coords.longitude);
    } catch (e) {
      Alert.alert('위치를 가져오지 못했어요', e.message);
    } finally {
      setLocating(false);
    }
  };

  const handlePersonsChanged = () => {
    load();
    loadMeetings(); // 이름이 바뀌거나 영구 삭제되면 만남 기록에도 반영된다
  };

  const top = insets.top + 8;

  return (
    <View style={styles.container}>
      {/* 지도는 아래 패널 위까지만 차지해 왼쪽 아래 카카오 로고가 가려지지 않는다 */}
      <View style={styles.mapArea}>
        <KakaoMap
          ref={map}
          markers={markers}
          onMarkerPress={(id) => setSelectedMeeting(meetings.find((m) => m.id === id) ?? null)}
        />

        <View style={[styles.topBar, { top }]}>
          <Pressable style={styles.pill} onPress={() => setPersonSheetOpen(true)}>
            <Ionicons name="people" size={16} color={colors.textSub} />
            <Text style={styles.pillText}>친구 목록</Text>
          </Pressable>
          <Pressable style={styles.pill} onPress={openSheet}>
            <Text style={styles.pillText}>연락할 사람</Text>
            <View style={[styles.badge, error && styles.badgeError, !error && !reminders.length && styles.badgeZero]}>
              <Text style={styles.badgeText}>{error ? '!' : reminders.length}</Text>
            </View>
          </Pressable>
        </View>

        <Pressable style={styles.locateButton} onPress={goToMyLocation} disabled={locating} hitSlop={6}>
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="locate" size={22} color={colors.primary} />
          )}
        </Pressable>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.panelRow}>
          <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={openMeetingList}>
            <Ionicons name="list" size={18} color={colors.textSub} />
            <Text style={styles.secondaryText}>만남 기록</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => setDraft({})}>
            <Ionicons name="create-outline" size={18} color={colors.textSub} />
            <Text style={styles.secondaryText}>직접 기록</Text>
          </Pressable>
        </View>
        <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]} onPress={pickPhoto}>
          <Text style={styles.primaryText}>사진으로 기록하기</Text>
        </Pressable>
      </View>

      <PersonManagerSheet
        visible={personSheetOpen}
        onClose={() => setPersonSheetOpen(false)}
        onPersonsChanged={handlePersonsChanged}
        meetings={meetings}
        onMeetingDeleted={handleDeleted}
        onMeetingUpdated={handleUpdated}
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
        onUpdated={handleUpdated}
      />
      <PhotoRecordSheet draft={draft} onClose={() => setDraft(null)} onSaved={handleSaved} />
      <MeetingCard
        meeting={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        onDeleted={handleDeleted}
        onUpdated={handleUpdated}
      />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  mapArea: { flex: 1 },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    ...shadow,
  },
  pillText: { fontSize: 15, fontWeight: '600', color: colors.text },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeZero: { backgroundColor: colors.textDisabled },
  badgeError: { backgroundColor: colors.textTertiary },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  locateButton: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  panel: {
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  panelRow: { flexDirection: 'row', gap: 10 },
  secondaryButton: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: colors.grey100,
  },
  secondaryText: { fontSize: 15, fontWeight: '600', color: colors.textSub },
  pressed: { opacity: 0.7 },
  primaryButton: { height: 56, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  primaryText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
