import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import KakaoMap from './src/KakaoMap';
import MeetingCard from './src/MeetingCard';
import MeetingListSheet from './src/MeetingListSheet';
import PersonManagerSheet from './src/PersonManagerSheet';
import PhotoRecordSheet from './src/PhotoRecordSheet';
import ReminderSheet, { RATIO_OPTIONS } from './src/ReminderSheet';
import SettingsSheet from './src/SettingsSheet';
import { fetchMeetings, fetchReminders, photoUrl } from './src/api';
import { clearClassifyStatus, useClassifyStatus } from './src/autoClassify';
import { pickPhotoFromLibrary } from './src/photoLibrary';
import { loadServerConfig, useServerConfig } from './src/serverConfig';
import { colors, radius, shadow } from './src/theme';

const DEFAULT_RATIO = 1.5; // 백엔드 기본값과 같게 맞춤
const RATIO_KEY = 'reminderRatio'; // 연락 알림 기준 비율은 이 기기에 저장한다

export default function App() {
  // 저장된 서버 주소를 읽은 뒤에 화면을 띄워야 첫 요청이 옛 주소로 가지 않는다
  const [configLoaded, setConfigLoaded] = useState(false);
  useEffect(() => {
    loadServerConfig().finally(() => setConfigLoaded(true));
  }, []);

  return (
    <SafeAreaProvider>
      {configLoaded ? <MemoryMap /> : <View style={styles.container} />}
    </SafeAreaProvider>
  );
}

function MemoryMap() {
  const insets = useSafeAreaInsets();
  const map = useRef(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [personSheetOpen, setPersonSheetOpen] = useState(false);
  const [focusPersonId, setFocusPersonId] = useState(null); // 친구 목록을 열 때 바로 보여줄 친구
  const [meetingListOpen, setMeetingListOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [draft, setDraft] = useState(null); // 기록 시트: { asset } (직접 기록이면 asset 없음)
  const [locating, setLocating] = useState(false);

  const latestRequest = useRef(0);
  const classify = useClassifyStatus(); // 저장 후 뒤에서 하는 메모 분류 상태
  const server = useServerConfig(); // 서버 설정이 바뀌면 version 이 올라간다

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
    // server.version: 서버 설정을 바꾸면 새 서버에서 다시 불러온다
  }, [ratio, server.version]);

  const latestMeetingsRequest = useRef(0);
  const loadMeetings = useCallback(async () => {
    const requestId = ++latestMeetingsRequest.current;
    try {
      const data = await fetchMeetings();
      if (requestId === latestMeetingsRequest.current) setMeetings(data);
    } catch {
      // 서버 연결 오류는 연락 알림 배지와 아래 안내에서 보여준다
    }
  }, [server.version]);

  // 저장해 둔 연락 알림 기준 비율을 불러온다
  useEffect(() => {
    AsyncStorage.getItem(RATIO_KEY)
      .then((saved) => {
        const value = Number(saved);
        if (RATIO_OPTIONS.includes(value)) setRatio(value);
      })
      .catch(() => {});
  }, []);

  const changeRatio = (value) => {
    setRatio(value);
    AsyncStorage.setItem(RATIO_KEY, String(value)).catch(() => {});
  };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  // 다른 앱에 갔다 돌아오면(날짜가 바뀌었거나 서버를 그사이 켰을 수 있다) 다시 불러온다
  const refreshAll = useRef(() => {});
  refreshAll.current = () => {
    load();
    loadMeetings();
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAll.current();
    });
    return () => sub.remove();
  }, []);

  const markers = useMemo(
    () =>
      meetings
        .filter((m) => m.latitude != null && m.longitude != null)
        .map((m) => ({ id: m.id, lat: m.latitude, lng: m.longitude, photoUrl: photoUrl(m.photo_path) })),
    // server.version: 서버 주소·토큰이 바뀌면 사진 주소도 바뀐다
    [meetings, server.version],
  );

  const openSheet = () => {
    setSheetOpen(true);
    load();
  };

  // iOS 는 시트(Modal)를 닫는 동안 다른 시트를 띄우지 못해, 닫힌 뒤에 친구 화면을 연다
  const openPersonFromReminder = (id) => {
    setSheetOpen(false);
    setTimeout(() => {
      setFocusPersonId(id);
      setPersonSheetOpen(true);
    }, 400);
  };

  const openPersonList = () => {
    setFocusPersonId(null);
    setPersonSheetOpen(true);
  };

  const openMeetingList = () => {
    setMeetingListOpen(true);
    loadMeetings();
  };

  const pickPhoto = async () => {
    try {
      const asset = await pickPhotoFromLibrary();
      if (asset) setDraft({ asset });
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

  // 휴지통에서 복구한 만남을 지도와 목록에 되돌린다
  const handleRestored = (meeting) => {
    setMeetings((list) => [meeting, ...list.filter((m) => m.id !== meeting.id)]);
    load();
  };

  const handleDeleted = (id) => {
    clearClassifyStatus(id);
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
          <Pressable style={styles.pill} onPress={openPersonList} accessibilityRole="button">
            <Ionicons name="people" size={16} color={colors.textSub} />
            <Text style={styles.pillText}>친구 목록</Text>
          </Pressable>
          <View style={styles.topRight}>
            <Pressable
              style={styles.pill}
              onPress={openSheet}
              accessibilityRole="button"
              accessibilityLabel={error ? '연락할 사람, 서버 연결 오류' : `연락할 사람 ${reminders.length}명`}
            >
              <Text style={styles.pillText}>연락할 사람</Text>
              <View style={[styles.badge, error && styles.badgeError, !error && !reminders.length && styles.badgeZero]}>
                <Text style={styles.badgeText}>{error ? '!' : reminders.length}</Text>
              </View>
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => setSettingsOpen(true)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="서버 설정"
            >
              <Ionicons name="settings-outline" size={20} color={colors.textSub} />
            </Pressable>
          </View>
        </View>

        {/* 서버에 연결하지 못하면 이유와 함께 설정으로 가는 길을 보여준다 */}
        {error && (
          <Pressable style={[styles.errorBanner, { top: top + 52 }]} onPress={() => setSettingsOpen(true)}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
            <Text style={styles.errorBannerText} numberOfLines={2}>
              {error}
            </Text>
            <Text style={styles.errorBannerAction}>설정</Text>
          </Pressable>
        )}

        <Pressable
          style={styles.locateButton}
          onPress={goToMyLocation}
          disabled={locating}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="내 위치로 이동"
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="locate" size={22} color={colors.primary} />
          )}
        </Pressable>

        {classify.running.size > 0 && (
          <View style={styles.classifyPill} pointerEvents="none">
            <ActivityIndicator size="small" color={colors.white} />
            <Text style={styles.classifyText}>AI가 메모 분류 중…</Text>
          </View>
        )}
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
        initialPersonId={focusPersonId}
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
        onChangeRatio={changeRatio}
        onOpenPerson={openPersonFromReminder}
        onRefresh={() => {
          load();
          loadMeetings();
        }}
      />
      <MeetingListSheet
        visible={meetingListOpen}
        onClose={() => setMeetingListOpen(false)}
        meetings={meetings}
        onDeleted={handleDeleted}
        onUpdated={handleUpdated}
        onRestored={handleRestored}
      />
      <PhotoRecordSheet draft={draft} onClose={() => setDraft(null)} onSaved={handleSaved} />
      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
  topRight: { flexDirection: 'row', gap: 8 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  errorBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    ...shadow,
  },
  errorBannerText: { flex: 1, fontSize: 13, color: colors.textSub },
  errorBannerAction: { fontSize: 14, fontWeight: '700', color: colors.primary },
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
  classifyPill: {
    position: 'absolute',
    bottom: 26,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  classifyText: { fontSize: 13, color: colors.white },
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
