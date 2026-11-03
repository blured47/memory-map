import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

const KAKAO_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY;
// Kakao 개발자 콘솔 > 플랫폼 > Web 에 이 도메인을 등록해야 지도가 로드됩니다.
const BASE_URL = 'http://localhost';

// WebView → 앱 메시지: { type: 'ready' | 'error' | 'marker', ... }
// 앱 → WebView: window.setMarkers(list, fit), window.focusAt(lat, lng)
const mapHtml = (key) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
    .pin { width: 48px; height: 48px; border-radius: 50%; border: 3px solid #fff; background: #2563eb center / cover no-repeat;
           box-shadow: 0 2px 6px rgba(0,0,0,.35); }
    .pin.dot { width: 18px; height: 18px; }
  </style>
  <script>
    function post(msg) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
    function report(message) { post({ type: 'error', message: message }); }
    window.onerror = function (message) { report('JS 오류: ' + message); };

    var map = null, overlays = [], pending = null, pendingFit = false;

    window.setMarkers = function (list, fit) {
      pending = list;
      pendingFit = pendingFit || fit;
      if (map) render();
    };

    window.focusAt = function (lat, lng) {
      if (map) map.panTo(new kakao.maps.LatLng(lat, lng));
    };

    function render() {
      overlays.forEach(function (o) { o.setMap(null); });
      var bounds = new kakao.maps.LatLngBounds();
      overlays = (pending || []).map(function (m) {
        var el = document.createElement('div');
        el.className = m.photoUrl ? 'pin' : 'pin dot';
        if (m.photoUrl) el.style.backgroundImage = 'url("' + m.photoUrl + '")';
        el.onclick = function () { post({ type: 'marker', id: m.id }); };
        var pos = new kakao.maps.LatLng(m.lat, m.lng);
        bounds.extend(pos);
        return new kakao.maps.CustomOverlay({ map: map, position: pos, content: el, clickable: true });
      });
      if (pendingFit && overlays.length) {
        overlays.length === 1 ? map.setCenter(overlays[0].getPosition()) : map.setBounds(bounds);
        pendingFit = false;
      }
    }
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
        map = new kakao.maps.Map(document.getElementById('map'), { center: center, level: 3 });
        if (pending) render();
        post({ type: 'ready' });
      });
    }
  </script>
</body>
</html>`;

// markers: [{ id, lat, lng, photoUrl }]
const KakaoMap = forwardRef(function KakaoMap({ markers = [], onMarkerPress }, ref) {
  const webView = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef(false);

  useImperativeHandle(ref, () => ({
    focus(lat, lng) {
      webView.current?.injectJavaScript(`window.focusAt(${Number(lat)}, ${Number(lng)}); true;`);
    },
  }));

  useEffect(() => {
    const t = setTimeout(() => {
      setError((prev) => prev || '지도 초기화 시간 초과 (SDK 추가 리소스 로드 실패 가능성)');
    }, 8000);
    if (ready) clearTimeout(t);
    return () => clearTimeout(t);
  }, [ready]);

  // 마커가 처음 생길 때만 모든 마커가 보이게 맞추고, 이후 갱신 때는 화면을 움직이지 않는다
  useEffect(() => {
    if (!ready) return;
    const fit = !fitted.current && markers.length > 0;
    if (fit) fitted.current = true;
    webView.current?.injectJavaScript(`window.setMarkers(${JSON.stringify(markers)}, ${fit}); true;`);
  }, [ready, markers]);

  const handleMessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      setReady(true);
      setError(null);
    } else if (msg.type === 'error') {
      setError(msg.message);
    } else if (msg.type === 'marker') {
      onMarkerPress?.(msg.id);
    }
  };

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
        ref={webView}
        style={styles.container}
        originWhitelist={['*']}
        source={{ html: mapHtml(KAKAO_JS_KEY), baseUrl: BASE_URL }}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        onError={(e) => setError(`WebView 오류: ${e.nativeEvent.description}`)}
        onHttpError={(e) => setError(`HTTP 오류: ${e.nativeEvent.statusCode}`)}
      />
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
});

export default KakaoMap;

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { fontSize: 16, textAlign: 'center' },
  errorBox: { position: 'absolute', left: 12, right: 12, bottom: 104, backgroundColor: '#b91c1c', padding: 12, borderRadius: 8 },
  errorText: { color: '#fff', fontSize: 14 },
});
