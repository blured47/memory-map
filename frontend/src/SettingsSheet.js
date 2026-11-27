import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { checkServer } from './api';
import { getServerConfig, normalizeUrl, saveServerConfig } from './serverConfig';
import { colors, radius } from './theme';

const APP_VERSION = Constants.expoConfig?.version ?? '';

// 서버 주소·접근 토큰 설정. 와이파이가 바뀌어 서버 IP 가 달라져도 앱을 다시 빌드하지 않고 여기서 고친다
export default function SettingsSheet({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState(null); // { ok, message }
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  // 열 때마다 지금 저장된 값에서 시작한다
  useEffect(() => {
    if (!visible) return;
    const current = getServerConfig();
    setUrl(current.url ?? '');
    setToken(current.token ?? '');
    setStatus(null);
  }, [visible]);

  const draft = () => ({ url: normalizeUrl(url), token: token.trim() });

  const check = async () => {
    const server = draft();
    if (!server.url) {
      setStatus({ ok: false, message: '서버 주소를 입력해 주세요' });
      return false;
    }
    setChecking(true);
    setStatus(null);
    try {
      await checkServer(server);
      setStatus({ ok: true, message: '연결됐어요' });
      return true;
    } catch (e) {
      setStatus({ ok: false, message: e.message });
      return false;
    } finally {
      setChecking(false);
    }
  };

  const persist = async () => {
    try {
      await saveServerConfig(draft());
      onClose();
    } catch (e) {
      setStatus({ ok: false, message: `저장하지 못했어요: ${e.message}` });
    }
  };

  const save = async () => {
    setSaving(true);
    const ok = await check();
    setSaving(false);
    if (ok) {
      await persist();
      return;
    }
    if (!normalizeUrl(url)) return;
    // 서버를 아직 안 켠 경우처럼 연결이 안 돼도 저장할 수는 있게 하되, 한 번 묻는다
    Alert.alert('연결되지 않았어요', '그래도 이 주소로 저장할까요? 서버를 켠 뒤 다시 연결돼요.', [
      { text: '취소', style: 'cancel' },
      { text: '저장', onPress: persist },
    ]);
  };

  const busy = checking || saving;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="설정 닫기" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>서버 설정</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.close}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.caption}>
              기록은 내 컴퓨터에서 켠 Memory Map 서버에 저장돼요. 아이폰과 서버 컴퓨터가 같은 와이파이에 있어야 해요.
            </Text>

            <Text style={styles.label}>서버 주소</Text>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={(text) => {
                setUrl(text);
                setStatus(null);
              }}
              placeholder="http://192.168.0.10:8000"
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              textContentType="URL"
              returnKeyType="next"
            />
            <Text style={styles.hint}>Mac 에서 `ipconfig getifaddr en0` 으로 나온 IP 뒤에 :8000 을 붙여요</Text>

            <Text style={styles.label}>접근 토큰 (선택)</Text>
            <TextInput
              style={styles.input}
              value={token}
              onChangeText={(text) => {
                setToken(text);
                setStatus(null);
              }}
              placeholder="서버 .env 의 MEMORYMAP_API_TOKEN"
              placeholderTextColor={colors.textDisabled}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="password"
            />
            <Text style={styles.hint}>서버에 토큰을 설정했다면 같은 값을 넣어야 기록을 볼 수 있어요</Text>

            {status && (
              <View style={[styles.status, status.ok ? styles.statusOk : styles.statusFail]}>
                <Text style={[styles.statusText, { color: status.ok ? colors.primary : colors.danger }]}>
                  {status.message}
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              <Pressable
                style={[styles.secondary, busy && styles.disabled]}
                onPress={check}
                disabled={busy}
                accessibilityRole="button"
              >
                {checking && !saving ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.secondaryText}>연결 확인</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.primary, busy && styles.disabled]}
                onPress={save}
                disabled={busy}
                accessibilityRole="button"
              >
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>저장</Text>}
              </Pressable>
            </View>

            <Text style={styles.footer}>
              Memory Map {APP_VERSION}
              {'\n'}기록은 설정한 서버에만 저장돼요. AI 메모 정리도 서버 컴퓨터 안에서만 처리해요.
              {'\n'}지도 표시와 장소 검색은 카카오를 이용해서, 사진 위치 근처 장소를 찾을 때 좌표와 검색어가 카카오로 전달돼요.
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.dim },
  sheet: {
    maxHeight: '90%',
    flexShrink: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  close: { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
  caption: { fontSize: 14, color: colors.textSub, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textSub, marginTop: 20, marginBottom: 8 },
  input: {
    backgroundColor: colors.grey100,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  hint: { fontSize: 12, color: colors.textTertiary, marginTop: 6 },
  status: { marginTop: 16, padding: 12, borderRadius: radius.md },
  statusOk: { backgroundColor: colors.primaryBg },
  statusFail: { backgroundColor: colors.dangerBg },
  statusText: { fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  secondary: {
    flex: 1,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.primary },
  primary: {
    flex: 1,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 16, fontWeight: '700', color: colors.white },
  disabled: { opacity: 0.6 },
  footer: { fontSize: 12, color: colors.textTertiary, lineHeight: 18, marginTop: 28, textAlign: 'center' },
});
