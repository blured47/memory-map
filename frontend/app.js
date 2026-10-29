import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const KAKAO_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY;
// Kakao 개발자 콘솔 > 플랫폼 > Web 에 이 도메인을 등록해야 지도가 로드됩니다.
const BASE_URL = 'http://localhost';

const mapHtml = (key) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <style>html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }</style>
  <script>
    function report(msg) {
      window.ReactNativeWebView.postMessage(msg);
    }
    window.onerror = function (message) { report('JS 오류: ' + message); };
  </script>
  <script
    src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false"
    onerror="report('카카오 SDK 로드 실패 (키 오류, 도메인 미등록, 카카오맵 사용 설정 OFF, 또는 네트워크 문제)')"
  ></script>
</head>
<body>
  <div id="map"></div>
  <script>
    if (typeof kakao === 'undefined') {
      report('kakao 객체 없음: SDK가 로드되지 않았습니다');
    } else {
      kakao.maps.load(function () {
        var center = new kakao.maps.LatLng(37.4963, 126.9573); // 숭실대학교
        new kakao.maps.Map(document.getElementById('map'), { center: center, level: 3 });
        report('OK');
      });
    }
  </script>
</body>
</html>`;

export default function App() {
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setError((prev) => prev || '지도 초기화 시간 초과 (SDK 추가 리소스 로드 실패 가능성)');
    }, 8000);
    if (loaded) clearTimeout(t);
    return () => clearTimeout(t);
  }, [loaded]);

  if (!KAKAO_JS_KEY) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>EXPO_PUBLIC_KAKAO_JS_KEY 가 설정되지 않았습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        style={styles.map}
        originWhitelist={['*']}
        source={{ html: mapHtml(KAKAO_JS_KEY), baseUrl: BASE_URL }}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(e) => {
          const msg = e.nativeEvent.data;
          if (msg === 'OK') setLoaded(true);
          setError(msg === 'OK' ? null : msg);
        }}
        onError={(e) => setError(`WebView 오류: ${e.nativeEvent.description}`)}
        onHttpError={(e) => setError(`HTTP 오류: ${e.nativeEvent.statusCode}`)}
      />
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { fontSize: 16, textAlign: 'center' },
  errorBox: { position: 'absolute', left: 12, right: 12, bottom: 32, backgroundColor: '#b91c1c', padding: 12, borderRadius: 8 },
  errorText: { color: '#fff', fontSize: 14 },
});
