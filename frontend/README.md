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
- **Wi-Fi를 옮겼거나 Mac IP가 바뀌었을 때**: `ipconfig getifaddr en0` 으로 IP를 다시 확인해 `.env` 를 고치고 `npx expo start -c` 로 켭니다.
- **`ConfigError: The expected package.json path ... does not exist`**: 루트에서 실행한 경우입니다. `frontend/` 폴더로 이동해 실행합니다.
- **패키지를 새로 설치한 뒤**: 켜 둔 `npx expo start` 를 끄고 `npx expo start -c` 로 다시 켭니다.

## 앱이 쓰는 권한

| 권한 | 쓰는 곳 |
|---|---|
| 로컬 네트워크 | 같은 Wi-Fi의 서버 연결 |
| 사진 (선택) | 기록할 사진 고르기 |
| 사진 보관함 (읽기) | 파일에 위치가 없을 때 보관함의 촬영 위치·시각 읽기 |
| 위치 (앱 사용 중) | 지도의 내 위치 버튼 |

Expo Go에서는 `app.json` 의 권한 문구 대신 Expo Go의 문구가 보입니다.

## 카카오맵 설정

앱은 전면에 카카오맵(WebView + Kakao Maps JavaScript SDK)을 표시합니다.

1. [Kakao Developers](https://developers.kakao.com)에서 앱을 만들고 **JavaScript 키**를 발급
2. 플랫폼 > Web > 사이트 도메인에 `http://localhost` 등록 (앱의 WebView가 이 주소로 동작합니다)
3. 카카오맵 사용 설정을 켜기

## 기능

### 만남 기록

- **사진으로 기록**: 사진을 고르면 서버가 EXIF에서 읽은 촬영 시각·위치를 채웁니다. 아이폰 기본 형식(HEIC)도 지원합니다.
  - 파일에 위치가 없으면 사진 보관함에 기록된 위치·시각을 대신 읽습니다. (처음 한 번 사진 보관함 권한을 묻습니다)
  - 위치를 읽으면 주소와 **사진 찍은 곳 근처** 장소 후보가 나오고, 장소 칸은 건물 이름이나 주소로 미리 채워집니다.
- **직접 기록**: 사진 없이 날짜, 함께한 사람, 장소, 메모를 적습니다. 날짜와 시각은 달력과 시각 휠로 고릅니다.
- **만남 수정**: 만남 상세에서 **수정** 을 누르면 같은 자리에서 날짜, 함께한 사람, 장소, 메모를 고칠 수 있습니다. **위치 지우기** 로 지도에서 뺄 수도 있습니다.
- **장소 검색**: 장소나 동네 이름(예: `양천구`, `인계동 카페`)을 입력하면 아래에 결과가 바로 나오고, 고르면 그 좌표가 저장됩니다. (서버 `.env` 에 `KAKAO_REST_KEY` 필요. 검색이 안 되면 입력칸 아래에 이유가 표시됩니다)
- **만남 기록 목록**: 위치가 없어 지도에 나오지 않는 만남까지 모두 보고 삭제할 수 있습니다. 월별로 묶어 보여주고, 검색어·기간(이번 달, 최근 3개월, 올해, 달력으로 직접 선택)·사람·조건(사진 있음, 지도에 없음)으로 걸러볼 수 있습니다.

위치가 있는 만남은 지도에 사진 썸네일 마커로 표시되고, 누르면 내용을 볼 수 있습니다.

> 사진을 고를 때 편집·압축을 하지 않습니다. 재인코딩하면 EXIF(위치)가 사라지기 때문입니다.
> 사진 선택 화면의 **옵션**에서 위치 포함을 끄면 파일에는 위치가 빠집니다. 이때는 사진 보관함의 위치를 쓰고, 그것도 없으면 장소를 검색해 고릅니다.
> 카카오톡 등으로 받은 사진, 스크린샷에는 위치가 없습니다.

### 내 위치

지도 오른쪽 아래 위치 버튼을 누르면 현재 위치에 파란 점을 찍고 그곳으로 이동합니다. 처음 누를 때 위치 권한을 허용해야 합니다.

### 친구 목록

왼쪽 위 **친구 목록** 버튼으로 관계별 그룹 목록을 보고 친구를 등록합니다. 삭제한 친구는 휴지통에서 30일 동안 복구할 수 있습니다.

- **그룹 순서**: 툴바의 **그룹 순서** 를 누르고 위·아래 화살표로 그룹 순서를 바꿉니다. 순서는 이 기기에 저장됩니다.
- **친구 화면**: 이름을 누르면 그 친구의 만남 횟수·마지막 만남·연락 주기를 보고, 정보를 수정하거나 휴지통으로 옮기고, 함께한 만남 기록을 열어볼 수 있습니다.

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
