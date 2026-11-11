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

import { createMeeting, createPerson, fetchNearby, fetchPersons, searchPlaces, uploadPhoto } from './api';
import { fromInputValue, nowLocalIso, toInputValue } from './datetime';
import { readLibraryInfo } from './photoLibrary';
import { colors } from './theme';

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
  const [placeError, setPlaceError] = useState(null);
  const [nearby, setNearby] = useState(null); // 사진 위치 주변 { address, building_name, places }
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
    setNearby(null);
    setMemo('');
    setError(null);

    if (draft.asset) {
      const asset = draft.asset;
      uploadPhoto(asset)
        .then(async (uploaded) => {
          let p = { ...uploaded, locationSource: uploaded.latitude != null ? 'file' : null };
          // 파일에서 못 읽은 값은 사진 보관함에서 채운다
          if (p.latitude == null || !p.taken_at) {
            const lib = await readLibraryInfo(asset.assetId);
            if (lib?.latitude != null && p.latitude == null) {
              p = { ...p, latitude: lib.latitude, longitude: lib.longitude, locationSource: 'library' };
            }
            if (lib?.taken_at && !p.taken_at) p = { ...p, taken_at: lib.taken_at };
          }
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
      setPlaceError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPlaces(query, photo?.latitude, photo?.longitude)
        .then((list) => {
          if (cancelled) return;
          setPlaces(list);
          setPlaceError(list.length ? null : '검색 결과가 없어요. 입력한 이름 그대로 저장할 수 있어요');
        })
        .catch((e) => {
          // 검색이 안 돼도 이름은 직접 적을 수 있다
          if (cancelled) return;
          setPlaces([]);
          setPlaceError(e.message);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placeName, searching, photo]);

  // 사진 위치가 있으면 주변 장소를 후보로 보여주고, 장소 칸이 비어 있으면 건물 이름이나 주소로 채운다
  useEffect(() => {
    if (photo?.latitude == null) return;
    let cancelled = false;
    fetchNearby(photo.latitude, photo.longitude)
      .then((result) => {
        if (cancelled) return;
        setNearby(result);
        const guess = result.building_name || result.address;
        if (guess) setPlaceName((name) => name || guess);
      })
      .catch(() => {}); // 카카오 키가 없어도 좌표로는 지도에 표시된다
    return () => {
      cancelled = true;
    };
  }, [photo]);

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
                    촬영 위치:{' '}
                    {photo.latitude == null
                      ? '정보 없음 (장소를 검색해 고를 수 있어요)'
                      : photo.locationSource === 'library'
                        ? '사진 보관함에서 읽음'
                        : '사진에서 읽음'}
                  </Text>
                  {nearby?.address ? <Text style={styles.info}>{nearby.address}</Text> : null}
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
              placeholder="장소나 동네 (예: 양천구, 인계동 카페)"
              value={placeName}
              onChangeText={changePlaceName}
              autoCorrect={false}
            />
            {places.map((place) => (
              <Pressable key={place.kakao_id} style={styles.placeItem} onPress={() => pickPlace(place)}>
                <Text style={styles.placeName}>
                  {place.name}
                  {place.category ? <Text style={styles.placeCategory}>  {place.category}</Text> : null}
                </Text>
                {place.address ? <Text style={styles.placeAddress}>{place.address}</Text> : null}
              </Pressable>
            ))}
            {placeError ? <Text style={styles.placeError}>{placeError}</Text> : null}
            {!searching && !pickedPlace && nearby?.places.length > 0 && (
              <>
                <Text style={styles.nearbyLabel}>사진 찍은 곳 근처</Text>
                {nearby.places.map((place) => (
                  <Pressable key={place.kakao_id} style={styles.placeItem} onPress={() => pickPlace(place)}>
                    <Text style={styles.placeName}>
                      {place.name}
                      {place.category ? <Text style={styles.placeCategory}>  {place.category}</Text> : null}
                    </Text>
                    {place.distance != null ? <Text style={styles.placeAddress}>{place.distance}m</Text> : null}
                  </Pressable>
                ))}
              </>
            )}
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
  backdrop: { flex: 1, backgroundColor: colors.dim },
  sheet: { maxHeight: '90%', flexShrink: 1, backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  close: { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  flex: { flex: 1 },
  exifBox: { marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: colors.grey100 },
  info: { fontSize: 14, color: colors.textSub, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textSub, marginTop: 20, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.grey100 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.textSub },
  chipTextActive: { color: colors.white, fontWeight: '600' },
  input: { backgroundColor: colors.grey100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  memo: { minHeight: 80, textAlignVertical: 'top' },
  placeItem: { paddingVertical: 12, paddingHorizontal: 4 },
  placeName: { fontSize: 15, fontWeight: '600', color: colors.text },
  placeCategory: { fontSize: 12, fontWeight: '400', color: colors.textTertiary },
  nearbyLabel: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginTop: 12 },
  placeError: { fontSize: 12, color: colors.warning, marginTop: 6 },
  placeAddress: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  hint: { fontSize: 12, color: colors.textTertiary, marginTop: 6 },
  smallButton: { marginLeft: 8, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.primaryBg },
  smallButtonText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  errorText: { fontSize: 14, color: colors.danger, marginTop: 12 },
  saveButton: { marginTop: 24, paddingVertical: 17, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: colors.primaryDisabled },
  saveButtonText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
