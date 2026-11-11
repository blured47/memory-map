import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { createMeeting, createPerson, fetchNearby, fetchPersons, searchPlaces, updateMeeting, uploadPhoto } from './api';
import DateTimeField from './DateTimeField';
import { nowLocalIso, parseLocalIso, toLocalIso } from './datetime';
import { readLibraryInfo } from './photoLibrary';
import { colors } from './theme';

const SEARCH_DELAY_MS = 300;

// 만남 입력 폼. meeting 이 있으면 그 만남을 수정하고, 없으면 새로 기록한다.
// asset 이 있으면 사진을 올려 서버가 EXIF 에서 읽은 촬영 시각·위치를 채운다
export default function MeetingForm({ meeting, asset, onSaved }) {
  const [photo, setPhoto] = useState(meeting?.photo_path ? { photo_path: meeting.photo_path } : null);
  const [uploadError, setUploadError] = useState(null);
  const [persons, setPersons] = useState([]);
  const [selectedIds, setSelectedIds] = useState(meeting?.people.map((p) => p.id) ?? []);
  const [newName, setNewName] = useState('');
  const [metAt, setMetAt] = useState(meeting?.met_at ?? nowLocalIso());
  const [placeName, setPlaceName] = useState(meeting?.place_name ?? '');
  // 지도에 찍힐 좌표. 사진 위치로 시작하고, 장소를 고르면 그 장소 좌표로 바뀐다
  const [location, setLocation] = useState(
    meeting?.latitude != null ? { latitude: meeting.latitude, longitude: meeting.longitude } : null,
  );
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState([]);
  const [placeError, setPlaceError] = useState(null);
  const [nearby, setNearby] = useState(null); // 사진 위치 주변 { address, building_name, places }
  const [picked, setPicked] = useState(false);
  const [memo, setMemo] = useState(meeting?.memo ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (asset) {
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
          if (p.taken_at) setMetAt(p.taken_at);
          if (p.latitude != null) setLocation({ latitude: p.latitude, longitude: p.longitude });
        })
        .catch((e) => !cancelled && setUploadError(e.message));
    }
    fetchPersons()
      .then((list) => !cancelled && setPersons(list))
      .catch((e) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
    };
  }, [asset]);

  // 장소 이름을 입력하면 잠시 뒤 카카오 장소 검색 (위치가 있으면 가까운 순)
  useEffect(() => {
    const query = placeName.trim();
    if (!searching || !query) {
      setPlaces([]);
      setPlaceError(null);
      return;
    }
    let cancelled = false;
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
    setPicked(false);
    setSearching(true);
  };

  const pickPlace = (place) => {
    setPlaceName(place.name);
    setLocation({ latitude: place.latitude, longitude: place.longitude });
    setPicked(true);
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

  const save = async () => {
    if (selectedIds.length === 0) {
      setError('함께한 사람을 한 명 이상 선택하세요');
      return;
    }
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
      onSaved(meeting ? await updateMeeting(meeting.id, body) : await createMeeting(body));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const waitingForPhoto = !!asset && !photo;

  return (
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
            <Text style={styles.info}>촬영 시각: {photo.taken_at ? '사진에서 읽음' : '정보 없음 (아래에서 선택)'}</Text>
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
            {location ? '지도에 표시됩니다' : '위치가 없으면 지도에는 표시되지 않고 만남 기록에만 남습니다'}
          </Text>
          {location && (
            <Pressable onPress={() => setLocation(null)} hitSlop={8}>
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
  errorText: { fontSize: 14, color: colors.danger, marginTop: 12 },
  saveButton: { marginTop: 24, paddingVertical: 17, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: colors.primaryDisabled },
  saveButtonText: { color: colors.white, fontSize: 17, fontWeight: '700' },
});
