import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  createMeeting,
  createPerson,
  fetchNearby,
  fetchPersons,
  photoUrl,
  searchPlaces,
  updateMeeting,
  uploadPhoto,
} from './api';
import { needsClassify, startClassify } from './autoClassify';
import DateTimeField from './DateTimeField';
import { nowLocalIso, parseLocalIso, toLocalIso } from './datetime';
import { pickPhotoFromLibrary, readLibraryInfo } from './photoLibrary';
import { colors } from './theme';

const SEARCH_DELAY_MS = 300;

// 만남 입력 폼. meeting 이 있으면 그 만남을 수정하고, 없으면 새로 기록한다.
// asset 이 있으면 사진을 올려 서버가 EXIF 에서 읽은 촬영 시각·위치를 채운다.
// 수정·직접 기록에서도 사진을 추가하거나 바꿀 수 있다
export default function MeetingForm({ meeting, asset: initialAsset, onSaved }) {
  const editing = !!meeting;
  const originalPhoto = meeting?.photo_path ? { photo_path: meeting.photo_path } : null;

  const [asset, setAsset] = useState(initialAsset ?? null); // 지금 올리는(올린) 사진. 없으면 서버에 있던 사진이나 사진 없음
  const [photo, setPhoto] = useState(originalPhoto); // 서버에 올라간 사진 { photo_path, taken_at, latitude, ... }
  const [uploadError, setUploadError] = useState(null);
  const [uploadAttempt, setUploadAttempt] = useState(0);
  const [photoInfoApplied, setPhotoInfoApplied] = useState(false); // 수정 중 '사진의 날짜·위치 적용'을 눌렀는지
  const [persons, setPersons] = useState([]);
  const [personsError, setPersonsError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(meeting?.people.map((p) => p.id) ?? []);
  const [newName, setNewName] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [metAt, setMetAt] = useState(meeting?.met_at ?? nowLocalIso());
  const [placeName, setPlaceName] = useState(meeting?.place_name ?? '');
  // 지도에 찍힐 좌표와 그 출처: 'saved'(원래 기록) | 'photo'(사진) | 'place'(검색해서 고른 장소)
  const [location, setLocation] = useState(
    meeting?.latitude != null ? { latitude: meeting.latitude, longitude: meeting.longitude } : null,
  );
  const [locationSource, setLocationSource] = useState(meeting?.latitude != null ? 'saved' : null);
  // 장소를 고르기 직전의 위치. 고른 뒤 이름을 고치면 이 위치로 되돌린다
  const beforePick = useRef(null);
  const [searching, setSearching] = useState(false);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [places, setPlaces] = useState([]);
  const [placeError, setPlaceError] = useState(null);
  const [nearby, setNearby] = useState(null); // 사진 위치 주변 { address, building_name, places }
  const [memo, setMemo] = useState(meeting?.memo ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const picked = locationSource === 'place';

  const loadPersons = useCallback(async () => {
    try {
      const list = await fetchPersons();
      setPersons(list);
      setPersonsError(null);
    } catch (e) {
      setPersonsError(e.message);
    }
  }, []);

  useEffect(() => {
    loadPersons();
  }, [loadPersons]);

  // 사진에서 읽은 촬영 시각·위치를 폼에 넣는다
  const applyPhotoInfo = (p) => {
    if (p.taken_at) setMetAt(p.taken_at);
    if (p.latitude != null) {
      setLocation({ latitude: p.latitude, longitude: p.longitude });
      setLocationSource('photo');
    }
    setPhotoInfoApplied(true);
  };

  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    setUploadError(null);
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
        // 새 기록은 사진 정보로 바로 채우고, 수정 중에는 기존 날짜·장소를 지키려고 버튼을 눌렀을 때만 바꾼다
        if (!editing) applyPhotoInfo(p);
      })
      .catch((e) => !cancelled && setUploadError(e.message));

    return () => {
      cancelled = true;
    };
  }, [asset, uploadAttempt, editing]);

  const addOrChangePhoto = async () => {
    try {
      const next = await pickPhotoFromLibrary();
      if (!next) return;
      setNearby(null);
      setPhoto(null);
      setPhotoInfoApplied(false);
      setAsset(next);
    } catch (e) {
      Alert.alert('사진을 열 수 없어요', e.message);
    }
  };

  // 사진 업로드를 그만두면 원래 사진(새 기록이면 사진 없음)으로 돌아간다
  const cancelUpload = () => {
    setAsset(null);
    setUploadError(null);
    setPhoto(originalPhoto);
    setNearby(null);
  };

  const removePhoto = () => {
    setAsset(null);
    setUploadError(null);
    setPhoto(null);
    setNearby(null);
  };

  // 수정 시 휴지통으로 간 친구가 이미 포함되어 있다면 칩으로 보여 선택 해제할 수 있게 한다
  const visiblePersons = useMemo(() => {
    if (!meeting?.people?.length) return persons;
    const knownIds = new Set(persons.map((p) => p.id));
    const archived = meeting.people.filter((p) => !knownIds.has(p.id)).map((p) => ({ ...p, archived: true }));
    return [...persons, ...archived];
  }, [persons, meeting]);

  // 장소 이름을 입력하면 잠시 뒤 카카오 장소 검색 (위치가 있으면 가까운 순)
  useEffect(() => {
    const query = placeName.trim();
    if (!searching || !query) {
      setPlaces([]);
      setPlaceError(null);
      setPlaceSearching(false);
      return;
    }
    let cancelled = false;
    setPlaceSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(query, location?.latitude, location?.longitude)
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
        })
        .finally(() => {
          if (!cancelled) setPlaceSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placeName, searching, location]);

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
    setSearching(true);
    // 고른 장소의 이름을 고치면 그 장소의 좌표도 더는 맞지 않으니, 고르기 전 위치로 되돌린다
    if (picked) {
      setLocation(beforePick.current?.location ?? null);
      setLocationSource(beforePick.current?.source ?? null);
    }
  };

  const pickPlace = (place) => {
    if (!picked) beforePick.current = { location, source: locationSource };
    setPlaceName(place.name);
    setLocation({ latitude: place.latitude, longitude: place.longitude });
    setLocationSource('place');
    setSearching(false);
  };

  const clearLocation = () => {
    setLocation(null);
    setLocationSource(null);
    beforePick.current = null;
  };

  const toggle = (id) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const addPerson = async () => {
    const name = newName.trim();
    if (!name || addingPerson) return;
    setAddingPerson(true);
    try {
      const person = await createPerson(name);
      setPersons((list) => [...list, person]);
      setSelectedIds((ids) => [...ids, person.id]);
      setNewName('');
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingPerson(false);
    }
  };

  const save = async () => {
    if (selectedIds.length === 0) {
      setError('함께한 사람을 한 명 이상 선택하세요');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const body = {
        met_at: metAt,
        place_name: placeName.trim() || null,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        memo: memo.trim() || null,
        photo_path: photo?.photo_path ?? null,
        person_ids: selectedIds,
      };
      const saved = meeting ? await updateMeeting(meeting.id, body) : await createMeeting(body);
      if (needsClassify(meeting, saved)) startClassify(saved.id); // 기다리지 않고 뒤에서 분류
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const waitingForPhoto = !!asset && !photo; // 업로드 중이거나 실패해서 고르기를 기다리는 중
  const previewUri = asset ? asset.uri : photo?.photo_path ? photoUrl(photo.photo_path) : null;
  const hasPhotoInfo = photo && (photo.taken_at || photo.latitude != null);

  const locationHint = {
    place: '고른 장소 위치로 지도에 표시돼요',
    photo: '사진 찍은 위치로 지도에 표시돼요',
    saved: '지도에 표시돼요',
  }[locationSource] ?? '위치가 없으면 지도에는 표시되지 않고 만남 기록에만 남아요';

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />}

      {asset && uploadError ? (
        <View style={styles.uploadErrorBox}>
          <Text style={styles.errorText}>사진 업로드 실패: {uploadError}</Text>
          <View style={styles.uploadActions}>
            <Pressable style={styles.smallButtonPlain} onPress={() => setUploadAttempt((n) => n + 1)}>
              <Text style={styles.smallButtonText}>다시 시도</Text>
            </Pressable>
            <Pressable style={styles.skipButton} onPress={cancelUpload}>
              <Text style={styles.skipButtonText}>{originalPhoto ? '원래 사진으로' : '사진 없이 계속'}</Text>
            </Pressable>
          </View>
        </View>
      ) : waitingForPhoto ? (
        <View style={styles.row}>
          <ActivityIndicator />
          <Text style={styles.info}>  사진을 올리고 촬영 정보를 읽는 중…</Text>
        </View>
      ) : (
        <>
          {asset && photo && (
            <View style={styles.exifBox}>
              <Text style={styles.info}>촬영 시각: {photo.taken_at ? '사진에서 읽음' : '정보 없음'}</Text>
              <Text style={styles.info}>
                촬영 위치:{' '}
                {photo.latitude == null
                  ? '정보 없음 (장소를 검색해 고를 수 있어요)'
                  : photo.locationSource === 'library'
                    ? '사진 보관함에서 읽음'
                    : '사진에서 읽음'}
              </Text>
              {nearby?.address ? <Text style={styles.info}>{nearby.address}</Text> : null}
              {editing && hasPhotoInfo && !photoInfoApplied && (
                <Pressable style={styles.applyButton} onPress={() => applyPhotoInfo(photo)}>
                  <Text style={styles.smallButtonText}>사진의 날짜·위치 적용</Text>
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.photoActions}>
            <Pressable onPress={addOrChangePhoto} hitSlop={8} accessibilityRole="button">
              <Text style={styles.photoAction}>{previewUri ? '사진 바꾸기' : '+ 사진 추가'}</Text>
            </Pressable>
            {previewUri && (
              <Pressable onPress={removePhoto} hitSlop={8} accessibilityRole="button">
                <Text style={styles.clearLocation}>사진 지우기</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      <Text style={styles.label}>함께한 사람</Text>
      {personsError ? (
        <View style={styles.row}>
          <Text style={[styles.errorText, styles.flex]}>{personsError}</Text>
          <Pressable style={styles.smallButton} onPress={loadPersons}>
            <Text style={styles.smallButtonText}>다시 불러오기</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.chips}>
          {visiblePersons.map((p) => {
            const active = selectedIds.includes(p.id);
            return (
              <Pressable key={p.id} style={[styles.chip, active && styles.chipActive]} onPress={() => toggle(p.id)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {p.archived ? `${p.name} (휴지통)` : p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {meeting?.removed_people > 0 && (
        <Text style={styles.hint}>
          삭제한 친구 {meeting.removed_people}명도 함께한 만남이에요 (목록에는 '삭제한 친구'로 보여요)
        </Text>
      )}
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder="새 사람 이름"
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={addPerson}
          returnKeyType="done"
          maxLength={50}
        />
        <Pressable
          style={[styles.smallButton, addingPerson && styles.disabled]}
          onPress={addPerson}
          disabled={addingPerson}
        >
          <Text style={styles.smallButtonText}>{addingPerson ? '추가 중…' : '추가'}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>날짜와 시각</Text>
      <View style={styles.dateRow}>
        <DateTimeField value={parseLocalIso(metAt)} onChange={(d) => setMetAt(toLocalIso(d))} />
      </View>

      <Text style={styles.label}>장소</Text>
      <TextInput
        style={styles.input}
        placeholder="장소나 동네 (예: 양천구, 인계동 카페)"
        value={placeName}
        onChangeText={changePlaceName}
        autoCorrect={false}
        maxLength={200}
      />
      {placeSearching && (
        <View style={styles.searchStatus}>
          <ActivityIndicator size="small" color={colors.textTertiary} />
          <Text style={styles.hint}>  장소 검색 중…</Text>
        </View>
      )}
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
      {!searching && !picked && nearby?.places.length > 0 && (
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
        <View style={styles.hintRow}>
          <Text style={[styles.hint, styles.flex]}>
            {locationHint}
          </Text>
          {location && (
            <Pressable onPress={clearLocation} hitSlop={8}>
              <Text style={styles.clearLocation}>위치 지우기</Text>
            </Pressable>
          )}
        </View>
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
        <Text style={styles.saveButtonText}>{saving ? '저장 중…' : meeting ? '수정 완료' : '저장'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  dateRow: { flexDirection: 'row' },
  memo: { minHeight: 80, textAlignVertical: 'top' },
  placeItem: { paddingVertical: 12, paddingHorizontal: 4 },
  placeName: { fontSize: 15, fontWeight: '600', color: colors.text },
  placeCategory: { fontSize: 12, fontWeight: '400', color: colors.textTertiary },
  nearbyLabel: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginTop: 12 },
  placeError: { fontSize: 12, color: colors.warning, marginTop: 6 },
  placeAddress: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  hintRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  hint: { fontSize: 12, color: colors.textTertiary },
  clearLocation: { fontSize: 12, fontWeight: '600', color: colors.danger, marginLeft: 8 },
  smallButton: { marginLeft: 8, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.primaryBg },
  smallButtonText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  photoActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 8 },
  photoAction: { fontSize: 13, fontWeight: '600', color: colors.primary },
  applyButton: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primaryBg },
  smallButtonPlain: { paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.primaryBg },
  uploadErrorBox: { marginTop: 10, gap: 8 },
  uploadActions: { flexDirection: 'row', gap: 8 },
  skipButton: { paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.grey100 },
  skipButtonText: { fontSize: 15, fontWeight: '600', color: colors.textSub },
  searchStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.6 },
  errorText: { fontSize: 14, color: colors.danger, marginTop: 12 },
  saveButton: { marginTop: 24, paddingVertical: 17, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: colors.primaryDisabled },
  saveButtonText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
