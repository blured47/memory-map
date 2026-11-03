# memory-app

Memory Map 앱과 Android APK 빌드용 Docker 환경.

## 카카오맵 설정

앱은 전면에 카카오맵(WebView + Kakao Maps JavaScript SDK)을 표시합니다.

1. [Kakao Developers](https://developers.kakao.com)에서 앱을 만들고 **JavaScript 키**를 발급
2. 플랫폼 > Web > 사이트 도메인에 `http://localhost` 등록
3. 키를 `EXPO_PUBLIC_KAKAO_JS_KEY` 환경변수로 전달 (`.env.example` 참고)

## 연락 알림

지도 오른쪽 위 **연락할 사람** 버튼에 연락이 필요한 사람 수가 표시되고, 누르면 목록이 열립니다.
백엔드의 `GET /api/reminders?ratio=` 를 사용하며, 기준 비율(1.2 / 1.5 / 2 / 3배)을 바꿀 수 있습니다.

- 백엔드 주소를 `EXPO_PUBLIC_API_URL` 로 전달합니다. 폰에서는 `localhost` 가 폰 자신을 가리키므로 **PC의 LAN IP** 를 써야 합니다. (예: `http://192.168.0.10:8000`)
- 폰과 PC가 같은 네트워크에 있어야 하고, Windows 방화벽에서 8000 포트가 허용돼야 합니다.

## 사진으로 기록 (photo-exif)

오른쪽 아래 **＋ 사진으로 기록** 버튼으로 갤러리에서 사진을 고르면:

1. 사진을 `POST /api/photos` 로 올리고, 서버가 EXIF 에서 읽은 **촬영 시각·위치**를 보여줍니다.
2. 함께한 사람(새로 추가 가능)·장소 이름·메모를 적어 `POST /api/meetings` 로 저장합니다.
   촬영 시각이 없으면 지금 시각으로 저장합니다.
3. 위치가 있는 만남은 지도에 **사진 썸네일 마커**로 표시되고, 누르면 사진과 기록을 볼 수 있습니다.

> 사진을 고를 때 편집·압축을 하지 않습니다. 재인코딩하면 EXIF(위치)가 사라지기 때문입니다.

## APK 빌드

`.env` 에 위 두 값을 적은 뒤 (`.env.example` 참고):

```bash
docker build -t rn-builder .
docker run --rm --env-file .env -v "$(pwd)/output:/output" -v rn-gradle:/root/.gradle rn-builder
```

PowerShell: `docker run --rm --env-file .env -v "${PWD}/output:/output" -v rn-gradle:/root/.gradle rn-builder`
Git Bash(Windows): 앞에 `MSYS_NO_PATHCONV=1` 을 붙이고 `$(pwd -W)/output` 사용

> `EXPO_PUBLIC_*` 값은 빌드할 때 앱에 들어갑니다. 값을 바꾸면 APK를 다시 빌드해야 합니다.

결과물: `output/app-release.apk` (debug 키로 서명됨 — 테스트용)

> 첫 빌드는 Gradle 의존성 다운로드로 10~20분 걸릴 수 있습니다. 
> 캐시: `-v rn-gradle:/root/.gradle` 를 추가하면 재빌드가 빨라집니다.

## 로컬 개발

```bash
npm install
npx expo start
```
