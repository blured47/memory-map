# Memory Map 앱

Memory Map 아이폰 앱입니다. (React Native + Expo)

## 실행 방법

서버를 먼저 켜 둡니다. (`--host 0.0.0.0` 필수, [루트 README](../README.md) 참고)

### 1. 환경변수

```bash
cp .env.example .env
```

| 변수 | 값 |
|---|---|
| `EXPO_PUBLIC_KAKAO_JS_KEY` | 카카오 JavaScript 키 |
| `EXPO_PUBLIC_API_URL` | 서버를 켠 Mac의 LAN IP (예: `http://192.168.0.10:8000`) |

아이폰에서 `localhost` 는 아이폰 자신을 가리키므로 **Mac의 LAN IP** 를 써야 합니다. Mac IP는 `ipconfig getifaddr en0` 으로 확인합니다.

### 2. 아이폰에서 실행 (Expo Go)

```bash
npm install
npx expo start
```

아이폰에 [Expo Go](https://apps.apple.com/app/expo-go/id982107779)를 설치하고, 터미널의 QR 코드를 카메라로 찍습니다. 아이폰과 Mac은 같은 Wi-Fi에 있어야 합니다.

### 3. 네이티브 빌드 (선택)

앱 이름, 권한 문구처럼 `app.json` 의 iOS 설정을 확인하려면 Xcode가 설치된 Mac에서 빌드합니다. Expo Go에서는 이 설정이 적용되지 않습니다.

```bash
npx expo run:ios            # 시뮬레이터
npx expo run:ios --device   # 연결된 아이폰
```

`ios/` 폴더는 빌드할 때 자동으로 생성되며 git에 올리지 않습니다. 번들 ID는 `app.json` 의 `ios.bundleIdentifier` 입니다.

## 연결이 안 될 때

- **서버에 연결할 수 없습니다**: 아이폰과 Mac이 같은 Wi-Fi인지, 서버를 `--host 0.0.0.0` 으로 켰는지, `EXPO_PUBLIC_API_URL` 의 IP가 맞는지 확인합니다. `.env` 를 바꾼 뒤에는 `npx expo start -c` 로 다시 켭니다.
- **처음 실행할 때 나오는 로컬 네트워크 권한**: 허용해야 합니다. 거부했다면 설정 > 개인정보 보호 및 보안 > 로컬 네트워크에서 켭니다.
- **Mac 방화벽**: 켜져 있다면 Python의 수신 연결을 허용합니다.

## 카카오맵 설정

앱은 전면에 카카오맵(WebView + Kakao Maps JavaScript SDK)을 표시합니다.

1. [Kakao Developers](https://developers.kakao.com)에서 앱을 만들고 **JavaScript 키**를 발급
2. 플랫폼 > Web > 사이트 도메인에 `http://localhost` 등록 (앱의 WebView가 이 주소로 동작합니다)
3. 카카오맵 사용 설정을 켜기

## 기능

### 만남 기록

- **사진으로 기록**: 사진을 고르면 서버가 EXIF에서 읽은 촬영 시각·위치를 채웁니다. 아이폰 기본 형식(HEIC)도 지원합니다.
- **직접 기록**: 사진 없이 날짜, 함께한 사람, 장소, 메모를 적습니다.
- **장소 검색**: 장소 이름을 입력하면 카카오 장소 검색 결과가 나오고, 고르면 그 좌표가 저장됩니다. (서버 `.env` 에 `KAKAO_REST_KEY` 필요)
- **만남 기록 목록**: 위치가 없어 지도에 나오지 않는 만남까지 모두 보고 삭제할 수 있습니다.

위치가 있는 만남은 지도에 사진 썸네일 마커로 표시되고, 누르면 내용을 볼 수 있습니다.

> 사진을 고를 때 편집·압축을 하지 않습니다. 재인코딩하면 EXIF(위치)가 사라지기 때문입니다.
> 사진 선택 화면의 **옵션**에서 위치 포함을 끄면 위치 없이 전달되므로 장소를 검색해 고릅니다.

### 사람 관리

왼쪽 위 **사람 관리** 버튼으로 관계별 목록을 보고 사람을 등록·수정·삭제합니다. 삭제한 사람은 휴지통에서 30일 동안 복구할 수 있습니다.

### 연락 알림

오른쪽 위 **연락할 사람** 버튼에 연락이 필요한 사람 수가 표시되고, 누르면 목록이 열립니다. 기준 비율(1.2 / 1.5 / 2 / 3배)을 바꿀 수 있습니다.

## Android APK 빌드 (참고)

주 대상은 아이폰이지만 Android 빌드 환경도 남아 있습니다. `.env` 를 채운 뒤:

```bash
docker build -t rn-builder .
docker run --rm --env-file .env -v "$(pwd)/output:/output" -v rn-gradle:/root/.gradle rn-builder
```

PowerShell: `docker run --rm --env-file .env -v "${PWD}/output:/output" -v rn-gradle:/root/.gradle rn-builder`
Git Bash(Windows): 앞에 `MSYS_NO_PATHCONV=1` 을 붙이고 `$(pwd -W)/output` 사용

결과물은 `output/app-release.apk` 입니다. (debug 키로 서명된 테스트용, `EXPO_PUBLIC_*` 값을 바꾸면 다시 빌드)
