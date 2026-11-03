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

import { createMeeting, createPerson, fetchPersons, uploadPhoto } from './api';
import { formatDateTime, nowLocalIso } from './datetime';

// 고른 사진(asset)을 올리고, 서버가 EXIF 에서 읽은 촬영 시각·위치로 만남을 기록한다
export default function PhotoRecordSheet({ asset, onClose, onSaved }) {
  const [photo, setPhoto] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [persons, setPersons] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [newName, setNewName] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    setPhoto(null);
    setUploadError(null);
    setSelectedIds([]);
    setNewName('');
    setPlaceName('');
    setMemo('');
    setError(null);

    uploadPhoto(asset)
      .then((p) => !cancelled && setPhoto(p))
      .catch((e) => !cancelled && setUploadError(e.message));
    fetchPersons()
      .then((list) => !cancelled && setPersons(list))
      .catch((e) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
    };
  }, [asset]);

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
      const meeting = await createMeeting({
        met_at: photo.taken_at ?? nowLocalIso(),
        place_name: placeName.trim() || null,
        latitude: photo.latitude,
        longitude: photo.longitude,
        memo: memo.trim() || null,
        photo_path: photo.photo_path,
        person_ids: selectedIds,
      });
      onSaved(meeting);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const hasLocation = photo?.latitude != null && photo?.longitude != null;

  return (
    <Modal visible={!!asset} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>사진으로 기록</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>취소</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {asset && <Image source={{ uri: asset.uri }} style={styles.preview} resizeMode="cover" />}

            {uploadError ? (
              <Text style={styles.errorText}>사진 업로드 실패: {uploadError}</Text>
            ) : !photo ? (
              <View style={styles.row}>
                <ActivityIndicator />
                <Text style={styles.info}>  사진을 올리고 촬영 정보를 읽는 중…</Text>
              </View>
            ) : (
              <View style={styles.exifBox}>
                <Text style={styles.info}>
                  촬영 시각:{' '}
                  {photo.taken_at ? formatDateTime(photo.taken_at) : '정보 없음 (지금 시각으로 저장)'}
                </Text>
                <Text style={styles.info}>
                  위치:{' '}
                  {hasLocation
                    ? `${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}`
                    : '정보 없음 (지도에 표시되지 않습니다)'}
                </Text>
              </View>
            )}

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

            <Text style={styles.label}>장소 이름</Text>
            <TextInput style={styles.input} placeholder="예: 학교 앞 카페" value={placeName} onChangeText={setPlaceName} />

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
              style={[styles.saveButton, (!photo || saving) && styles.saveButtonDisabled]}
              onPress={save}
              disabled={!photo || saving}
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
  sheet: { maxHeight: '90%', backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
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
  smallButton: { marginLeft: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  smallButtonText: { fontSize: 14, color: '#111827' },
  errorText: { fontSize: 14, color: '#b91c1c', marginTop: 12 },
  saveButton: { marginTop: 20, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#93c5fd' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
