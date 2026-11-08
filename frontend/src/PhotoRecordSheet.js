import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createMeeting, createPerson, fetchPersons, searchPlaces, uploadPhoto } from './api';
import { fromInputValue, nowLocalIso, toInputValue } from './datetime';

const SEARCH_DELAY_MS = 300;

// 만남을 기록한다. draft.asset 이 있으면 사진을 올려 서버가 EXIF 에서 읽은 촬영 시각·위치를 채우고,
// 없으면(직접 기록) 지금 시각에서 시작한다
export default function PhotoRecordSheet({ draft, onClose, onSaved }) {
  const insets = useSafeAreaInsets();
  const asset = draft?.asset ?? null;

  const [photo, setPhoto] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [persons, setPersons] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [newName, setNewName] = useState('');
  const [metAt, setMetAt] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState([]);
  const [pickedPlace, setPickedPlace] = useState(null);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    setPhoto(null);
    setUploadError(null);
    setSelectedIds([]);
    setNewName('');
    setMetAt(toInputValue(nowLocalIso()));
    setPlaceName('');
    setSearching(false);
    setPlaces([]);
    setPickedPlace(null);
    setMemo('');
    setError(null);

    if (draft.asset) {
      uploadPhoto(draft.asset)
        .then((p) => {
          if (cancelled) return;
          setPhoto(p);
          if (p.taken_at) setMetAt(toInputValue(p.taken_at));
        })
        .catch((e) => !cancelled && setUploadError(e.message));
    }
    fetchPersons()
      .then((list) => !cancelled && setPersons(list))
      .catch((e) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
    };
  }, [draft]);

  // 장소 이름을 입력하면 잠시 뒤 카카오 장소 검색 (사진 위치가 있으면 가까운 순)
  useEffect(() => {
    const query = placeName.trim();
    if (!searching || !query) {
      setPlaces([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPlaces(query, photo?.latitude, photo?.longitude)
        .then((list) => !cancelled && setPlaces(list))
        .catch(() => !cancelled && setPlaces([])); // 검색이 안 돼도 이름은 직접 적을 수 있다
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placeName, searching, photo]);

  const changePlaceName = (text) => {
    setPlaceName(text);
    setPickedPlace(null);
    setSearching(true);
  };

  const pickPlace = (place) => {
    setPlaceName(place.name);
    setPickedPlace(place);
    setSearching(false);
  };

  const toggle = (id) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const addPerson = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const person = await createPerson(name);
      setPersons((list) => [...list, person]);
      setSelectedIds((ids) => [...ids, person.id]);
      setNewName('');
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  // 고른 장소의 좌표가 사진 위치보다 우선한다
  const latitude = pickedPlace?.latitude ?? photo?.latitude ?? null;
  const longitude = pickedPlace?.longitude ?? photo?.longitude ?? null;
  const hasLocation = latitude != null && longitude != null;

  const save = async () => {
    const metAtIso = fromInputValue(metAt);
    if (!metAtIso) {
      setError('날짜와 시각을 2026-10-20 18:30 형식으로 입력하세요');
      return;
    }
    if (selectedIds.length === 0) {
      setError('함께한 사람을 한 명 이상 선택하세요');
      return;
    }
    setSaving(true);
    try {
      const meeting = await createMeeting({
        met_at: metAtIso,
        place_name: placeName.trim() || null,
        latitude,
        longitude,
        memo: memo.trim() || null,
        photo_path: photo?.photo_path ?? null,
        person_ids: selectedIds,
      });
      onSaved(meeting);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const waitingForPhoto = !!asset && !photo;

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

          <ScrollView keyboardShouldPersistTaps="handled">
            {asset && <Image source={{ uri: asset.uri }} style={styles.preview} resizeMode="cover" />}

            {asset &&
              (uploadError ? (
                <Text style={styles.errorText}>사진 업로드 실패: {uploadError}</Text>
              ) : !photo ? (
                <View style={styles.row}>
                  <ActivityIndicator />
                  <Text style={styles.info}>  사진을 올리고 촬영 정보를 읽는 중…</Text>
                </View>
              ) : (
                <View style={styles.exifBox}>
                  <Text style={styles.info}>
                    촬영 시각: {photo.taken_at ? '사진에서 읽음' : '정보 없음 (아래에서 입력)'}
                  </Text>
                  <Text style={styles.info}>
                    촬영 위치: {photo.latitude != null ? '사진에서 읽음' : '정보 없음 (장소를 검색해 고를 수 있어요)'}
                  </Text>
                </View>
              ))}

            <Text style={styles.label}>함께한 사람</Text>
            <View style={styles.chips}>
              {persons.map((p) => {
                const active = selectedIds.includes(p.id);
                return (
                  <Pressable key={p.id} style={[styles.chip, active && styles.chipActive]} onPress={() => toggle(p.id)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="새 사람 이름"
                value={newName}
                onChangeText={setNewName}
                onSubmitEditing={addPerson}
                returnKeyType="done"
              />
              <Pressable style={styles.smallButton} onPress={addPerson}>
                <Text style={styles.smallButtonText}>추가</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>날짜와 시각</Text>
            <TextInput
              style={styles.input}
              placeholder="2026-10-20 18:30"
              value={metAt}
              onChangeText={setMetAt}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
            />

            <Text style={styles.label}>장소</Text>
            <TextInput
              style={styles.input}
              placeholder="장소 검색 (예: 학교 앞 카페)"
              value={placeName}
              onChangeText={changePlaceName}
              autoCorrect={false}
            />
            {places.map((place) => (
              <Pressable key={place.kakao_id} style={styles.placeItem} onPress={() => pickPlace(place)}>
                <Text style={styles.placeName}>{place.name}</Text>
                {place.address ? <Text style={styles.placeAddress}>{place.address}</Text> : null}
              </Pressable>
            ))}
            {!waitingForPhoto && (
              <Text style={styles.hint}>
                {hasLocation ? '지도에 표시됩니다' : '위치가 없으면 지도에는 표시되지 않고 만남 기록에만 남습니다'}
              </Text>
            )}

            <Text style={styles.label}>메모</Text>
            <TextInput
              style={[styles.input, styles.memo]}
              placeholder="그날의 기억"
              value={memo}
              onChangeText={setMemo}
              multiline
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={[styles.saveButton, (waitingForPhoto || saving) && styles.saveButtonDisabled]}
              onPress={save}
              disabled={waitingForPhoto || saving}
            >
              <Text style={styles.saveButtonText}>{saving ? '저장 중…' : '저장'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '90%', flexShrink: 1, backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  close: { fontSize: 15, color: '#2563eb' },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: '#e5e7eb' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  flex: { flex: 1 },
  exifBox: { marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: '#f3f4f6' },
  info: { fontSize: 14, color: '#374151', lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#d1d5db' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 14, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  memo: { minHeight: 80, textAlignVertical: 'top' },
  placeItem: { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  placeName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  placeAddress: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  smallButton: { marginLeft: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  smallButtonText: { fontSize: 14, color: '#111827' },
  errorText: { fontSize: 14, color: '#b91c1c', marginTop: 12 },
  saveButton: { marginTop: 20, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#93c5fd' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
